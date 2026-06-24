import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationService } from '../../common/services/pagination.service';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { CurrencyWalletsService } from '../wallets/wallets.service';
import { CurrencyWallet } from '../wallets/entities/wallet.entity';
import { Ledger, LedgerEntryType } from './entities/ledger.entity';
import {
  V2Transaction,
  V2TransactionStatus,
  V2TransactionType,
} from './entities/transaction.entity';
import { V2TransactionsService } from './transactions.service';

describe('V2TransactionsService', () => {
  let service: V2TransactionsService;
  let transactionRepository: jest.Mocked<Repository<V2Transaction>>;
  let dataSource: { transaction: jest.Mock };

  const userId = 'user-1';
  const existingTransaction = {
    id: 'txn-existing',
    userId,
    idempotencyKey: 'key-1',
    ledgerEntries: [],
  } as unknown as V2Transaction;

  beforeEach(async () => {
    transactionRepository = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<V2Transaction>>;

    dataSource = {
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        V2TransactionsService,
        {
          provide: getRepositoryToken(V2Transaction),
          useValue: transactionRepository,
        },
        {
          provide: getRepositoryToken(Ledger),
          useValue: {},
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: CurrencyWalletsService,
          useValue: {
            getOrCreateUserWallet: jest.fn(),
            getOrCreatePlatformWallet: jest.fn(),
            lockWallet: jest.fn(),
            verifyWalletBalance: jest.fn(),
          },
        },
        {
          provide: ExchangeRatesService,
          useValue: {
            getRate: jest.fn().mockResolvedValue({ rate: 1 }),
          },
        },
        {
          provide: PaginationService,
          useValue: {
            getSkipTake: jest.fn().mockReturnValue({ skip: 0, take: 10 }),
            createMeta: jest.fn().mockReturnValue({
              page: 1,
              limit: 10,
              totalItems: 0,
              totalPages: 0,
              hasNextPage: false,
              hasPreviousPage: false,
            }),
          },
        },
      ],
    }).compile();

    service = module.get(V2TransactionsService);
  });

  it('returns existing transaction for duplicate idempotency key', async () => {
    transactionRepository.findOne.mockResolvedValue(existingTransaction);

    const result = await service.create(userId, {
      type: V2TransactionType.SEND,
      fromCurrency: 'USD',
      toCurrency: 'USD',
      toAmount: '10',
      idempotencyKey: 'key-1',
    });

    expect(result).toBe(existingTransaction);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('throws when toAmount is missing', async () => {
    transactionRepository.findOne.mockResolvedValue(null);

    await expect(
      service.create(userId, {
        type: V2TransactionType.SEND,
        fromCurrency: 'USD',
        toCurrency: 'USD',
        idempotencyKey: 'key-2',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws not found when transaction does not exist', async () => {
    transactionRepository.findOne.mockResolvedValue(null);

    await expect(service.findOne(userId, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws 422 when cancelling completed transaction', async () => {
    transactionRepository.findOne.mockResolvedValue({
      id: 'txn-1',
      userId,
      status: V2TransactionStatus.COMPLETED,
      ledgerEntries: [],
    } as unknown as V2Transaction);

    await expect(service.cancel(userId, 'txn-1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('throws 422 on insufficient balance during create', async () => {
    transactionRepository.findOne.mockResolvedValue(null);

    const debitWallet = {
      id: 'wallet-debit',
      balance: '5',
      isPlatform: false,
    } as CurrencyWallet;
    const creditWallet = {
      id: 'wallet-credit',
      balance: '0',
      isPlatform: true,
    } as CurrencyWallet;

    const walletsService = {
      getOrCreateUserWallet: jest.fn().mockResolvedValue(debitWallet),
      getOrCreatePlatformWallet: jest.fn().mockResolvedValue(creditWallet),
      lockWallet: jest
        .fn()
        .mockResolvedValueOnce(debitWallet)
        .mockResolvedValueOnce(creditWallet),
      verifyWalletBalance: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        V2TransactionsService,
        {
          provide: getRepositoryToken(V2Transaction),
          useValue: transactionRepository,
        },
        { provide: getRepositoryToken(Ledger), useValue: {} },
        {
          provide: DataSource,
          useValue: {
            transaction: (cb: (manager: unknown) => Promise<unknown>) =>
              cb({
                getRepository: () => ({
                  create: jest.fn((x) => x),
                  save: jest.fn(),
                  findOneOrFail: jest.fn(),
                }),
              }),
          },
        },
        { provide: CurrencyWalletsService, useValue: walletsService },
        {
          provide: ExchangeRatesService,
          useValue: { getRate: jest.fn().mockResolvedValue({ rate: 1 }) },
        },
        {
          provide: PaginationService,
          useValue: {
            getSkipTake: jest.fn(),
            createMeta: jest.fn(),
          },
        },
      ],
    }).compile();

    const svc = module.get(V2TransactionsService);

    await expect(
      svc.create(userId, {
        type: V2TransactionType.SEND,
        fromCurrency: 'USD',
        toCurrency: 'USD',
        toAmount: '10',
        idempotencyKey: 'key-3',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('creates exactly two ledger entries on successful transaction', async () => {
    transactionRepository.findOne.mockResolvedValue(null);

    const debitWallet = {
      id: 'wallet-debit',
      balance: '100',
      isPlatform: false,
    } as CurrencyWallet;
    const creditWallet = {
      id: 'wallet-credit',
      balance: '0',
      isPlatform: true,
    } as CurrencyWallet;

    const savedLedgers: Ledger[] = [];
    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === CurrencyWallet) {
          return {
            save: jest.fn().mockResolvedValue([debitWallet, creditWallet]),
          };
        }
        if (entity === V2Transaction) {
          return {
            create: jest.fn((x) => ({ ...x, id: 'txn-new' })),
            save: jest.fn((x) => Promise.resolve(x)),
            findOneOrFail: jest.fn().mockResolvedValue({
              id: 'txn-new',
              ledgerEntries: savedLedgers,
            }),
          };
        }
        if (entity === Ledger) {
          return {
            create: jest.fn((x) => x),
            save: jest.fn((entries) => {
              savedLedgers.push(...entries);
              return entries;
            }),
          };
        }
        return {};
      },
    };

    const walletsService = {
      getOrCreateUserWallet: jest.fn().mockResolvedValue(debitWallet),
      getOrCreatePlatformWallet: jest.fn().mockResolvedValue(creditWallet),
      lockWallet: jest
        .fn()
        .mockResolvedValueOnce({ ...debitWallet, balance: '100' })
        .mockResolvedValueOnce({ ...creditWallet, balance: '0' }),
      verifyWalletBalance: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        V2TransactionsService,
        {
          provide: getRepositoryToken(V2Transaction),
          useValue: transactionRepository,
        },
        { provide: getRepositoryToken(Ledger), useValue: {} },
        {
          provide: DataSource,
          useValue: {
            transaction: (cb: (m: unknown) => unknown) => cb(manager),
          },
        },
        { provide: CurrencyWalletsService, useValue: walletsService },
        {
          provide: ExchangeRatesService,
          useValue: { getRate: jest.fn().mockResolvedValue({ rate: 1 }) },
        },
        {
          provide: PaginationService,
          useValue: {
            getSkipTake: jest.fn(),
            createMeta: jest.fn(),
          },
        },
      ],
    }).compile();

    const svc = module.get(V2TransactionsService);
    await svc.create(userId, {
      type: V2TransactionType.SEND,
      fromCurrency: 'USD',
      toCurrency: 'USD',
      toAmount: '10',
      idempotencyKey: 'key-4',
    });

    expect(savedLedgers).toHaveLength(2);
    expect(savedLedgers.map((e) => e.type).sort()).toEqual(
      [LedgerEntryType.CREDIT, LedgerEntryType.DEBIT].sort(),
    );
    expect(savedLedgers[0].balanceBefore).toBeDefined();
    expect(savedLedgers[0].balanceAfter).toBeDefined();
  });
});
