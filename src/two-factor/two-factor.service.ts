import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { EncryptionService } from '../common/services/encryption.service';
import { BackupCode } from './entities/backup-code.entity';

@Injectable()
export class TwoFactorService {
  constructor(
    @InjectRepository(BackupCode)
    private readonly backupCodeRepository: Repository<BackupCode>,
    private readonly usersService: UsersService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async generateSecret(userId: string): Promise<{
    qrCode: string;
    manualEntryKey: string;
    backupCodes: string[];
    otpauthUrl: string;
    qrCodeDataUrl: string;
  }> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const secret = speakeasy.generateSecret({
      name: `${user.email}`,
      issuer: 'NexaFX',
      length: 20,
    });

    if (!secret.base32 || !secret.otpauth_url) {
      throw new BadRequestException('Failed to generate two-factor secret');
    }

    const encryptedSecret = this.encryptionService.encrypt(secret.base32);

    await this.usersService.updateByUserId(userId, {
      twoFactorSecret: encryptedSecret,
      isTwoFactorEnabled: false,
    });

    const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url);
    const qrCode = qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');

    const backupCodes = this.generateBackupCodes(8);
    await this.backupCodeRepository.delete({ userId });
    const saltRounds = 12;
    const entities = await Promise.all(
      backupCodes.map(async (code) =>
        this.backupCodeRepository.create({
          userId,
          codeHash: await bcrypt.hash(code, saltRounds),
          consumedAt: null,
        }),
      ),
    );
    await this.backupCodeRepository.save(entities);

    return {
      otpauthUrl: secret.otpauth_url,
      qrCodeDataUrl,
      qrCode,
      manualEntryKey: secret.base32,
      backupCodes,
    };
  }

  async confirmTwoFactor(
    userId: string,
    totpCode: string,
  ): Promise<{ backupCodes: string[] }> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.twoFactorSecret) {
      throw new BadRequestException(
        'Two-factor setup is required before enabling',
      );
    }

    const isValid = this.verifyTotp(user.twoFactorSecret, totpCode);

    if (!isValid) {
      throw new UnauthorizedException('Invalid two-factor code');
    }

    await this.usersService.updateByUserId(userId, {
      isTwoFactorEnabled: true,
    });

    const existingCodes = await this.backupCodeRepository.count({
      where: { userId, consumedAt: IsNull() },
    });

    if (existingCodes > 0) {
      return { backupCodes: [] };
    }

    const backupCodes = this.generateBackupCodes(8);
    const saltRounds = 12;
    const entities = await Promise.all(
      backupCodes.map(async (code) =>
        this.backupCodeRepository.create({
          userId,
          codeHash: await bcrypt.hash(code, saltRounds),
          consumedAt: null,
        }),
      ),
    );
    await this.backupCodeRepository.save(entities);

    return { backupCodes };
  }

  async disableTwoFactor(userId: string, totpCode: string): Promise<void> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    const isValid = this.verifyTotp(user.twoFactorSecret, totpCode);

    if (!isValid) {
      throw new UnauthorizedException('Invalid two-factor code');
    }

    await this.usersService.updateByUserId(userId, {
      isTwoFactorEnabled: false,
      twoFactorSecret: null,
    });

    await this.backupCodeRepository.delete({ userId });
  }

  async verifyTotpCode(userId: string, totpCode: string): Promise<boolean> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.twoFactorSecret || !user.isTwoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    return this.verifyTotp(user.twoFactorSecret, totpCode);
  }

  async tryAuthenticate(
    userId: string,
    token: string,
  ): Promise<'totp' | 'backup'> {
    const user = await this.usersService.findById(userId);
    if (!user?.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    if (/^\d{6}$/.test(token) && this.verifyTotp(user.twoFactorSecret, token)) {
      return 'totp';
    }

    await this.consumeBackupCode(userId, token);
    return 'backup';
  }

  async consumeBackupCode(userId: string, backupCode: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isTwoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    const codes = await this.backupCodeRepository.find({
      where: { userId, consumedAt: IsNull() },
    });

    for (const codeEntity of codes) {
      const ok = await bcrypt.compare(backupCode, codeEntity.codeHash);
      if (ok) {
        await this.backupCodeRepository.update(codeEntity.id, {
          consumedAt: new Date(),
        });
        return;
      }
    }

    throw new UnauthorizedException('Invalid two-factor code');
  }

  async regenerateBackupCodes(
    userId: string,
    totpCode: string,
  ): Promise<{ backupCodes: string[] }> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (!user.twoFactorSecret || !user.isTwoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    const isValid = this.verifyTotp(user.twoFactorSecret, totpCode);
    if (!isValid) {
      throw new UnauthorizedException('Invalid two-factor code');
    }

    await this.backupCodeRepository.delete({ userId });
    const backupCodes = this.generateBackupCodes(8);
    const saltRounds = 12;
    const entities = await Promise.all(
      backupCodes.map(async (code) =>
        this.backupCodeRepository.create({
          userId,
          codeHash: await bcrypt.hash(code, saltRounds),
          consumedAt: null,
        }),
      ),
    );
    await this.backupCodeRepository.save(entities);

    return { backupCodes };
  }

  async getStatus(userId: string): Promise<{ isTwoFactorEnabled: boolean }> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      isTwoFactorEnabled: user.isTwoFactorEnabled,
    };
  }

  private verifyTotp(encryptedSecret: string, totpCode: string): boolean {
    const secret = this.encryptionService.decrypt(encryptedSecret);

    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });
  }

  private generateBackupCodes(count: number): string[] {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const length = 8;
    const codes = new Set<string>();

    while (codes.size < count) {
      let code = '';
      for (let i = 0; i < length; i++) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      codes.add(code);
    }

    return Array.from(codes);
  }
}
