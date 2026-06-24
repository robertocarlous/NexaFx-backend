import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycGuard } from './kyc.guard';
import { KycRecord, KycStatus } from '../entities/kyc.entity';

describe('KycGuard', () => {
  let guard: KycGuard;
  let kycRepository: jest.Mocked<Repository<KycRecord>>;

  const createContext = (userId?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: userId ? { userId } : undefined }),
      }),
    }) as ExecutionContext;

  beforeEach(async () => {
    kycRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<KycRecord>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycGuard,
        {
          provide: getRepositoryToken(KycRecord),
          useValue: kycRepository,
        },
      ],
    }).compile();

    guard = module.get(KycGuard);
  });

  it('allows users with approved KYC', async () => {
    kycRepository.findOne.mockResolvedValue({
      status: KycStatus.APPROVED,
    } as KycRecord);

    await expect(guard.canActivate(createContext('user-1'))).resolves.toBe(
      true,
    );
  });

  it('rejects users without approved KYC', async () => {
    kycRepository.findOne.mockResolvedValue(null);

    await expect(
      guard.canActivate(createContext('user-1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
