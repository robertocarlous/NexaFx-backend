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
      });
      wallet = await repo.save(wallet);
    }

    return wallet;
  }

  async creditWallet(
    userId: string,
    currency: string,
    amount: Decimal,
    manager: EntityManager,
  ): Promise<{
    wallet: CurrencyWallet;
    balanceBefore: string;
    balanceAfter: string;
  }> {
    const wallet = await manager
      .getRepository(CurrencyWallet)
      .createQueryBuilder('wallet')
      .setLock('pessimistic_write')
      .where('wallet.userId = :userId AND wallet.currency = :currency', {
        userId,
        currency: currency.toUpperCase(),
      })
      .getOne();

    const repo = manager.getRepository(CurrencyWallet);
    const targetWallet =
      wallet ??
      (await repo.save(
        repo.create({
          userId,
          currency: currency.toUpperCase(),
          balance: '0',
          isPlatform: false,
        }),
      ));

    const balanceBefore = new Decimal(targetWallet.balance);
    const balanceAfter = balanceBefore.plus(amount);
    targetWallet.balance = balanceAfter.toFixed(8);
    await repo.save(targetWallet);

    return {
      wallet: targetWallet,
      balanceBefore: balanceBefore.toFixed(8),
      balanceAfter: balanceAfter.toFixed(8),
    };
  }
}
