import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { CurrencyWallet } from './entities/wallet.entity';

@Injectable()
export class CurrencyWalletsService {
  constructor(
    @InjectRepository(CurrencyWallet)
    private readonly walletRepository: Repository<CurrencyWallet>,
  ) {}

  async getOrCreateUserWallet(
    userId: string,
    currency: string,
    manager?: EntityManager,
  ): Promise<CurrencyWallet> {
    const repo = manager
      ? manager.getRepository(CurrencyWallet)
      : this.walletRepository;

    let wallet = await repo.findOne({
      where: { userId, currency: currency.toUpperCase() },
    });

    if (!wallet) {
      wallet = repo.create({
        userId,
        currency: currency.toUpperCase(),
        balance: '0',
        isPlatform: false,
        isBlocked: false,
      });
      wallet = await repo.save(wallet);
    }

    return wallet;
  }

  async getOrCreatePlatformWallet(
    currency: string,
    manager?: EntityManager,
  ): Promise<CurrencyWallet> {
    const repo = manager
      ? manager.getRepository(CurrencyWallet)
      : this.walletRepository;

    let wallet = await repo.findOne({
      where: { isPlatform: true, currency: currency.toUpperCase() },
    });

    if (!wallet) {
      wallet = repo.create({
        userId: null,
        currency: currency.toUpperCase(),
        balance: '0',
        isPlatform: true,
        isBlocked: false,
      });
      wallet = await repo.save(wallet);
    }

    return wallet;
  }

  async lockWallet(
    walletId: string,
    manager: EntityManager,
  ): Promise<CurrencyWallet> {
    const wallet = await manager
      .getRepository(CurrencyWallet)
      .createQueryBuilder('wallet')
      .setLock('pessimistic_write')
      .where('wallet.id = :walletId', { walletId })
      .getOne();

    if (!wallet) {
      throw new Error(`Wallet ${walletId} not found`);
    }

    if (wallet.isBlocked) {
      throw new Error(
        `Wallet ${walletId} is blocked due to balance discrepancy`,
      );
    }

    return wallet;
  }

  async verifyWalletBalance(
    walletId: string,
    manager: EntityManager,
  ): Promise<boolean> {
    const wallet = await manager.getRepository(CurrencyWallet).findOne({
      where: { id: walletId },
    });

    if (!wallet) {
      return false;
    }

    const result = (await manager.query(
      `
        SELECT
          COALESCE(SUM(CASE WHEN "type" = 'CREDIT' THEN amount::numeric ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN "type" = 'DEBIT' THEN amount::numeric ELSE 0 END), 0) AS ledger_balance
        FROM v2_ledger_entries
        WHERE "walletId" = $1
      `,
      [walletId],
    )) as Array<{ ledger_balance: string }>;

    const ledgerBalance = new Decimal(result[0]?.ledger_balance ?? 0);
    const walletBalance = new Decimal(wallet.balance);

    if (!ledgerBalance.equals(walletBalance)) {
      await manager.getRepository(CurrencyWallet).update(walletId, {
        isBlocked: true,
      });
      return false;
    }

    return true;
  }
}
