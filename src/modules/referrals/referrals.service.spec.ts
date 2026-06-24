import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaginationService } from '../../common/services/pagination.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { User } from '../../users/user.entity';
import { CurrencyWalletsService } from '../wallets/wallets.service';
import { V2Referral } from './entities/referral.entity';
import { V2ReferralsService } from './referrals.service';

describe('V2ReferralsService', () => {
  let service: V2ReferralsService;
  let referralRepository: jest.Mocked<Repository<V2Referral>>;

  beforeEach(async () => {
    referralRepository = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'ref-1', ...value })),
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<V2Referral>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        V2ReferralsService,
        {
          provide: getRepositoryToken(V2Referral),
          useValue: referralRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: 'user-1',
              referralCode: 'AB12CD34',
            }),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: { count: jest.fn(), createQueryBuilder: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: { transaction: jest.fn() },
        },
        {
          provide: CurrencyWalletsService,
          useValue: { creditWallet: jest.fn() },
        },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn() },
        },
        {
          provide: PaginationService,
          useValue: {
            getSkipTake: jest.fn().mockReturnValue({ skip: 0, take: 10 }),
            createMeta: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(V2ReferralsService);
  });

  it('links referral on registration', async () => {
    referralRepository.findOne.mockResolvedValue(null);

    const result = await service.linkReferralOnRegistration(
      'ref-user',
      'new-user',
    );

    expect(result.referrerId).toBe('ref-user');
    expect(result.referredId).toBe('new-user');
    expect(referralRepository.save).toHaveBeenCalled();
  });

  it('rejects self-referral', async () => {
    await expect(
      service.linkReferralOnRegistration('same-user', 'same-user'),
    ).rejects.toThrow('Users cannot refer themselves');
  });
});
