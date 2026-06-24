import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
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
import { ReferralsService } from '../referrals/referrals.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { WalletsService } from '../wallets/wallets.service';
import { MailService } from '../modules/mail/mail.service';
import { PasswordResetAttempt } from './entities/password-reset-attempt.entity';
import { hashToken } from '../common/utils/auth-token.util';

const VERIFY_TOKEN = 'b'.repeat(64);

describe('AuthService email verification', () => {
  let service: AuthService;

  const mockMailService = {
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
  };

  const mockUsersService = {
    findByEmailVerificationTokenHash: jest.fn(),
    findById: jest.fn(),
    updateByUserId: jest.fn(),
    verifyUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: OtpsService, useValue: {} },
        { provide: RefreshTokensService, useValue: {} },
        { provide: OtpDeliveryService, useValue: { sendOtp: jest.fn() } },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(), verify: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: StellarService, useValue: {} },
        { provide: EncryptionService, useValue: {} },
        { provide: AuditLogsService, useValue: { logAuthEvent: jest.fn() } },
        { provide: ReferralsService, useValue: {} },
        { provide: TwoFactorService, useValue: {} },
        { provide: WalletsService, useValue: {} },
        { provide: MailService, useValue: mockMailService },
        {
          provide: getRepositoryToken(PasswordResetAttempt),
          useValue: { count: jest.fn(), save: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('verifies email and clears token fields', async () => {
    mockUsersService.findByEmailVerificationTokenHash.mockResolvedValue({
      id: 'user-1',
      emailVerificationExpires: new Date(Date.now() + 60_000),
    });

    const result = await service.verifyEmail(VERIFY_TOKEN);

    expect(result.message).toContain('Email verified successfully');
    expect(mockUsersService.updateByUserId).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        isEmailVerified: true,
        isVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationExpires: null,
      }),
    );
    expect(mockUsersService.verifyUser).toHaveBeenCalledWith('user-1');
  });

  it('rejects expired verification token', async () => {
    mockUsersService.findByEmailVerificationTokenHash.mockResolvedValue({
      id: 'user-1',
      emailVerificationExpires: new Date(Date.now() - 1000),
    });

    await expect(service.verifyEmail(VERIFY_TOKEN)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rate limits resend verification within 5 minutes', async () => {
    mockUsersService.findById.mockResolvedValue({
      id: 'user-1',
      email: 'user@test.com',
      isEmailVerified: false,
      emailVerificationLastSentAt: new Date(),
    });

    await expect(service.resendVerification('user-1')).rejects.toThrow(
      HttpException,
    );
  });

  it('hashes verification tokens consistently', () => {
    expect(hashToken(VERIFY_TOKEN)).toHaveLength(64);
  });
});
