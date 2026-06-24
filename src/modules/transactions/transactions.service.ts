import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { randomBytes } from 'crypto';
import { format } from 'date-fns';
import { PaginationService } from '../../common/services/pagination.service';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { CurrencyWalletsService } from '../wallets/wallets.service';
import { CurrencyWallet } from '../wallets/entities/wallet.entity';
import { CreateV2TransactionDto } from './dto/create-transaction.dto';
import { V2TransactionQueryDto } from './dto/transaction-query.dto';
import { Ledger, LedgerEntryType } from './entities/ledger.entity';
import {
  V2Transaction,
  V2TransactionStatus,
  V2TransactionType,
} from './entities/transaction.entity';

interface WalletPair {
  debitWallet: CurrencyWallet;
  creditWallet: CurrencyWallet;
  debitAmount: Decimal;
  creditAmount: Decimal;
}

@Injectable()
export class V2TransactionsService {
  private readonly logger = new Logger(V2TransactionsService.name);

  constructor(
    @InjectRepository(V2Transaction)
    private readonly transactionRepository: Repository<V2Transaction>,
    @InjectRepository(Ledger)
    private readonly ledgerRepository: Repository<Ledger>,
    private readonly dataSource: DataSource,
    private readonly walletsService: CurrencyWalletsService,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly paginationService: PaginationService,
  ) {}

  async create(
    userId: string,
    dto: CreateV2TransactionDto,
  ): Promise<V2Transaction> {
    const existing = await this.transactionRepository.findOne({
      where: { userId, idempotencyKey: dto.idempotencyKey },
      relations: ['ledgerEntries'],
    });

    if (existing) {
      return existing;
    }

    const fromCurrency = dto.fromCurrency.toUpperCase();
    const toCurrency = dto.toCurrency.toUpperCase();

    const { fromAmount, toAmount, exchangeRate } =
      await this.resolveAmounts(dto);

    return this.dataSource.transaction(async (manager) => {
      const walletPair = await this.resolveWalletPair(
        userId,
        dto.type,
        fromCurrency,
        toCurrency,
        fromAmount,
        toAmount,
        manager,
      );

      const debitWallet = await this.walletsService.lockWallet(
        walletPair.debitWallet.id,
        manager,
      );
      const creditWallet = await this.walletsService.lockWallet(
        walletPair.creditWallet.id,
        manager,
      );

      const debitBalance = new Decimal(debitWallet.balance);
      if (
        !debitWallet.isPlatform &&
        debitBalance.lessThan(walletPair.debitAmount)
      ) {
        throw new UnprocessableEntityException('Insufficient balance');
      }

      const debitBefore = debitBalance;
      const debitAfter = debitBefore.minus(walletPair.debitAmount);
      const creditBefore = new Decimal(creditWallet.balance);
      const creditAfter = creditBefore.plus(walletPair.creditAmount);

      debitWallet.balance = debitAfter.toFixed(8);
      creditWallet.balance = creditAfter.toFixed(8);

      await manager
        .getRepository(CurrencyWallet)
        .save([debitWallet, creditWallet]);

      const transaction = manager.getRepository(V2Transaction).create({
        userId,
        type: dto.type,
        fromCurrency,
        toCurrency,
        fromAmount: fromAmount.toFixed(8),
        toAmount: toAmount.toFixed(8),
        exchangeRate: exchangeRate?.toFixed(8) ?? null,
        fee: '0',
        status: V2TransactionStatus.PENDING,
        idempotencyKey: dto.idempotencyKey,
        reference: this.generateReference(),
        metadata: dto.metadata ?? null,
      });

      const savedTransaction = await manager
        .getRepository(V2Transaction)
        .save(transaction);

      const debitEntry = manager.getRepository(Ledger).create({
        transactionId: savedTransaction.id,
        walletId: debitWallet.id,
        type: LedgerEntryType.DEBIT,
        amount: walletPair.debitAmount.toFixed(8),
        balanceBefore: debitBefore.toFixed(8),
        balanceAfter: debitAfter.toFixed(8),
      });

      const creditEntry = manager.getRepository(Ledger).create({
        transactionId: savedTransaction.id,
        walletId: creditWallet.id,
        type: LedgerEntryType.CREDIT,
        amount: walletPair.creditAmount.toFixed(8),
        balanceBefore: creditBefore.toFixed(8),
        balanceAfter: creditAfter.toFixed(8),
      });

      await manager.getRepository(Ledger).save([debitEntry, creditEntry]);

      const debitValid = await this.walletsService.verifyWalletBalance(
        debitWallet.id,
        manager,
      );
      const creditValid = await this.walletsService.verifyWalletBalance(
        creditWallet.id,
        manager,
      );

      if (!debitValid || !creditValid) {
        this.logger.error(
          `CRITICAL: Balance discrepancy detected for transaction ${savedTransaction.id}`,
        );
        throw new UnprocessableEntityException(
          'Balance verification failed — wallet blocked',
        );
      }

      return manager.getRepository(V2Transaction).findOneOrFail({
        where: { id: savedTransaction.id },
        relations: ['ledgerEntries'],
      });
    });
  }

  async findAll(userId: string, query: V2TransactionQueryDto) {
    const { skip, take } = this.paginationService.getSkipTake(query);
    const qb = this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId })
      .orderBy('transaction.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (query.status) {
      qb.andWhere('transaction.status = :status', { status: query.status });
    }

    if (query.type) {
      qb.andWhere('transaction.type = :type', { type: query.type });
    }

    if (query.from) {
      qb.andWhere('transaction.createdAt >= :from', { from: query.from });
    }

    if (query.to) {
      qb.andWhere('transaction.createdAt <= :to', { to: query.to });
    }

    const [data, totalItems] = await qb.getManyAndCount();

    return {
      data,
      meta: this.paginationService.createMeta(query, totalItems),
    };
  }

  async findOne(userId: string, id: string): Promise<V2Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id, userId },
      relations: ['ledgerEntries'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  async cancel(userId: string, id: string): Promise<V2Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id, userId },
      relations: ['ledgerEntries'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.status === V2TransactionStatus.COMPLETED) {
      throw new UnprocessableEntityException(
        'Cannot cancel a completed transaction',
      );
    }

    if (transaction.status !== V2TransactionStatus.PENDING) {
      throw new UnprocessableEntityException(
        `Cannot cancel transaction with status ${transaction.status}`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      for (const entry of transaction.ledgerEntries) {
        const wallet = await this.walletsService.lockWallet(
          entry.walletId,
          manager,
        );
        const currentBalance = new Decimal(wallet.balance);
        const amount = new Decimal(entry.amount);

        if (entry.type === LedgerEntryType.DEBIT) {
          wallet.balance = currentBalance.plus(amount).toFixed(8);
        } else {
          wallet.balance = currentBalance.minus(amount).toFixed(8);
        }

        await manager.getRepository(CurrencyWallet).save(wallet);
      }

      transaction.status = V2TransactionStatus.CANCELLED;
      return manager.getRepository(V2Transaction).save(transaction);
    });
  }

  private async resolveAmounts(dto: CreateV2TransactionDto): Promise<{
    fromAmount: Decimal;
    toAmount: Decimal;
    exchangeRate: Decimal | null;
  }> {
    const fromCurrency = dto.fromCurrency.toUpperCase();
    const toCurrency = dto.toCurrency.toUpperCase();

    if (!dto.toAmount) {
      throw new BadRequestException('toAmount is required');
    }

    const toAmount = new Decimal(dto.toAmount);
    if (toAmount.lte(0)) {
      throw new BadRequestException('toAmount must be greater than zero');
    }

    if (fromCurrency === toCurrency) {
      return { fromAmount: toAmount, toAmount, exchangeRate: null };
    }

    const rateResult = await this.exchangeRatesService.getRate(
      fromCurrency,
      toCurrency,
    );
    const exchangeRate = new Decimal(rateResult.rate);
    const fromAmount = toAmount.div(exchangeRate);

    return { fromAmount, toAmount, exchangeRate };
  }

  private async resolveWalletPair(
    userId: string,
    type: V2TransactionType,
    fromCurrency: string,
    toCurrency: string,
    fromAmount: Decimal,
    toAmount: Decimal,
    manager: EntityManager,
  ): Promise<WalletPair> {
    const userFromWallet = await this.walletsService.getOrCreateUserWallet(
      userId,
      fromCurrency,
      manager,
    );
    const userToWallet = await this.walletsService.getOrCreateUserWallet(
      userId,
      toCurrency,
      manager,
    );
    const platformFromWallet =
      await this.walletsService.getOrCreatePlatformWallet(
        fromCurrency,
        manager,
      );
    const platformToWallet =
      await this.walletsService.getOrCreatePlatformWallet(toCurrency, manager);

    switch (type) {
      case V2TransactionType.DEPOSIT:
        return {
          debitWallet: platformFromWallet,
          creditWallet: userFromWallet,
          debitAmount: fromAmount,
          creditAmount: toAmount,
        };
      case V2TransactionType.WITHDRAWAL:
      case V2TransactionType.SEND:
        return {
          debitWallet: userFromWallet,
          creditWallet: platformFromWallet,
          debitAmount: fromAmount,
          creditAmount: fromAmount,
        };
      case V2TransactionType.RECEIVE:
        return {
          debitWallet: platformToWallet,
          creditWallet: userToWallet,
          debitAmount: toAmount,
          creditAmount: toAmount,
        };
      case V2TransactionType.EXCHANGE:
        return {
          debitWallet: userFromWallet,
          creditWallet: userToWallet,
          debitAmount: fromAmount,
          creditAmount: toAmount,
        };
      default:
        throw new BadRequestException(
          `Unsupported transaction type: ${String(type)}`,
        );
    }
  }

  private generateReference(): string {
    const datePart = format(new Date(), 'yyyyMMdd');
    const suffix = randomBytes(2).toString('hex').toUpperCase();
    return `TXN-${datePart}-${suffix}`;
  }
}
