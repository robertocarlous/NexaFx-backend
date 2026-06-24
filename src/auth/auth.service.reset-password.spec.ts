import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { OtpsService } from '../otps/otps.service';
import { RefreshTokensService } from '../tokens/refresh-tokens.service';
import { OtpDeliveryService } from './email/otp-delivery.service';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { EncryptionService } from '../common/services/encryption.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { ReferralsService } from '../referrals/referrals.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { WalletsService } from '../wallets/wallets.service';
import { MailService } from '../modules/mail/mail.service';
import { PasswordResetAttempt } from './entities/password-reset-attempt.entity';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { hashToken } from '../common/utils/auth-token.util';

const RESET_TOKEN = 'a'.repeat(64);

const makeUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'user-uuid-1',
  email: 'trader@nexafx.com',
  password: 'hashed',
  isVerified: true,
  passwordResetTokenHash: hashToken(RESET_TOKEN),
  passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
  ...overrides,
});

const makeResetDto = (
  overrides: Partial<ResetPasswordDto> = {},
): ResetPasswordDto =>
  Object.assign(new ResetPasswordDto(), {
    token: RESET_TOKEN,
    newPassword: 'NewStrongPassword!123',
    ...overrides,
  });

describe('AuthService.resetPassword()', () => {
  let service: AuthService;

  const mockUsersService = {
    findByPasswordResetTokenHash: jest.fn(),
    updateByUserId: jest.fn(),
    updatePassword: jest.fn(),
  };
  const mockOtpsService = { invalidateAllUserOtps: jest.fn() };
  const mockRefreshTokensService = { revokeAllUserTokens: jest.fn() };
  const mockAuditLogsService = { logAuthEvent: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: OtpsService, useValue: mockOtpsService },
        { provide: RefreshTokensService, useValue: mockRefreshTokensService },
        { provide: OtpDeliveryService, useValue: { sendOtp: jest.fn() } },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(), verify: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('15m') },
        },
        { provide: StellarService, useValue: { generateWallet: jest.fn() } },
        { provide: EncryptionService, useValue: { encrypt: jest.fn() } },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
        {
          provide: ReferralsService,
          useValue: { createPendingReferral: jest.fn() },
        },
        { provide: TwoFactorService, useValue: {} },
        {
          provide: WalletsService,
          useValue: { seedPrimaryWalletFromUserCredentials: jest.fn() },
        },
        {
          provide: MailService,
          useValue: { sendPasswordResetEmail: jest.fn() },
        },
        {
          provide: getRepositoryToken(PasswordResetAttempt),
          useValue: { count: jest.fn().mockResolvedValue(0), save: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('resets password with a valid token', async () => {
    const user = makeUser();
    mockUsersService.findByPasswordResetTokenHash.mockResolvedValue(user);

    const result = await service.resetPassword(makeResetDto());

    expect(result.message).toContain('Password has been reset successfully');
    expect(mockUsersService.updatePassword).toHaveBeenCalledWith(
      user.id,
      'NewStrongPassword!123',
    );
    expect(mockRefreshTokensService.revokeAllUserTokens).toHaveBeenCalledWith(
      user.id,
    );
    expect(mockAuditLogsService.logAuthEvent).toHaveBeenCalledWith(
      user.id,
      AuditAction.PASSWORD_RESET_COMPLETE,
      expect.objectContaining({ email: user.email }),
    );
  });

  it('clears reset token fields after successful reset', async () => {
    const user = makeUser();
    mockUsersService.findByPasswordResetTokenHash.mockResolvedValue(user);

    await service.resetPassword(makeResetDto());

    expect(mockUsersService.updateByUserId).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({
        passwordResetTokenHash: null,
        passwordResetExpires: null,
      }),
    );
  });

  it('returns 400 for unknown token', async () => {
    mockUsersService.findByPasswordResetTokenHash.mockResolvedValue(null);

    await expect(service.resetPassword(makeResetDto())).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns 400 for expired token', async () => {
    mockUsersService.findByPasswordResetTokenHash.mockResolvedValue(
      makeUser({
        passwordResetExpires: new Date(Date.now() - 1000),
      }),
    );

    await expect(service.resetPassword(makeResetDto())).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects token reuse after fields are cleared', async () => {
    mockUsersService.findByPasswordResetTokenHash
      .mockResolvedValueOnce(makeUser())
      .mockResolvedValueOnce(null);

    await service.resetPassword(makeResetDto());

    await expect(service.resetPassword(makeResetDto())).rejects.toThrow(
      BadRequestException,
    );
  });
});
