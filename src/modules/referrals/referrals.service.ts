import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, IsNull, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { PaginationService } from '../../common/services/pagination.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/entities/notification.entity';
import {
  Transaction,
  TransactionStatus,
} from '../../transactions/entities/transaction.entity';
import { User } from '../../users/user.entity';
import { CurrencyWalletsService } from '../wallets/wallets.service';
import {
  ReferralHistoryItemDto,
  ReferralHistoryQueryDto,
} from './dto/referral-history.dto';
import { ReferralMeResponseDto } from './dto/referral-me.dto';
import {
  ReferralLedgerEntry,
  ReferralLedgerType,
} from './entities/referral-ledger.entity';
import { V2Referral } from './entities/referral.entity';

const REFERRAL_REWARD_AMOUNT = '5';
const REFERRAL_REWARD_CURRENCY = 'XLM';

@Injectable()
export class V2ReferralsService {
  private readonly logger = new Logger(V2ReferralsService.name);

  constructor(
    @InjectRepository(V2Referral)
    private readonly referralRepository: Repository<V2Referral>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly dataSource: DataSource,
    private readonly walletsService: CurrencyWalletsService,
    private readonly notificationsService: NotificationsService,
    private readonly paginationService: PaginationService,
  ) {}

  async linkReferralOnRegistration(
    referrerId: string,
    referredId: string,
  ): Promise<V2Referral> {
    if (referrerId === referredId) {
      throw new BadRequestException('Users cannot refer themselves');
    }

    const existing = await this.referralRepository.findOne({
      where: { referredId },
    });
    if (existing) {
      return existing;
    }

    const referral = this.referralRepository.create({
      referrerId,
      referredId,
      rewardAmount: null,
      rewardCurrency: null,
      rewardedAt: null,
    });

    return this.referralRepository.save(referral);
  }

  async getMyReferrals(userId: string): Promise<ReferralMeResponseDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const referrals = await this.referralRepository.find({
      where: { referrerId: userId },
    });

    const totalRewardsEarned = referrals
      .filter((referral) => referral.rewardedAt)
      .reduce(
        (sum, referral) => sum.plus(referral.rewardAmount ?? '0'),
        new Decimal(0),
      );

    return {
      referralCode: user.referralCode,
      totalReferrals: referrals.length,
      totalRewardsEarned: totalRewardsEarned.toFixed(8),
      rewardCurrency: REFERRAL_REWARD_CURRENCY,
    };
  }

  async getReferralHistory(
    userId: string,
    query: ReferralHistoryQueryDto,
  ): Promise<{
    data: ReferralHistoryItemDto[];
    meta: ReturnType<PaginationService['createMeta']>;
  }> {
    const { skip, take } = this.paginationService.getSkipTake(query);

    const [data, count] = await this.referralRepository.findAndCount({
      where: { referrerId: userId, rewardedAt: Not(IsNull()) },
      relations: ['referred'],
      order: { rewardedAt: 'DESC' },
      skip,
      take,
    });

    return {
      data: data.map((referral) => ({
        id: referral.id,
        referredId: referral.referredId,
        referredEmail: referral.referred?.email ?? null,
        rewardAmount: referral.rewardAmount,
        rewardCurrency: referral.rewardCurrency,
        rewardedAt: referral.rewardedAt,
        createdAt: referral.createdAt,
      })),
      meta: this.paginationService.createMeta(query, count),
    };
  }

  async processRewardOnFirstTransaction(referredId: string): Promise<void> {
    const referred = await this.userRepository.findOne({
      where: { id: referredId },
    });

    if (!referred?.referredBy) {
      return;
    }

    let referral = await this.referralRepository.findOne({
      where: { referredId },
    });

    if (!referral) {
      referral = await this.linkReferralOnRegistration(
        referred.referredBy,
        referredId,
      );
    }

    if (referral.rewardedAt) {
      return;
    }

    const qualifyingCount = await this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId: referredId })
      .andWhere('transaction.status IN (:...statuses)', {
        statuses: [TransactionStatus.SUCCESS, TransactionStatus.PENDING],
      })
      .andWhere('transaction.txHash IS NOT NULL')
      .getCount();

    if (qualifyingCount === 0) {
      return;
    }

    const rewardAmount = new Decimal(REFERRAL_REWARD_AMOUNT);

    await this.dataSource.transaction(async (manager) => {
      const lockedReferral = await manager
        .getRepository(V2Referral)
        .createQueryBuilder('referral')
        .setLock('pessimistic_write')
        .where('referral.id = :id', { id: referral.id })
        .getOne();

      if (!lockedReferral || lockedReferral.rewardedAt) {
        return;
      }

      const { wallet, balanceBefore, balanceAfter } =
        await this.walletsService.creditWallet(
          lockedReferral.referrerId,
          REFERRAL_REWARD_CURRENCY,
          rewardAmount,
          manager,
        );

      lockedReferral.rewardAmount = rewardAmount.toFixed(8);
      lockedReferral.rewardCurrency = REFERRAL_REWARD_CURRENCY;
      lockedReferral.rewardedAt = new Date();
      await manager.getRepository(V2Referral).save(lockedReferral);

      const ledgerEntry = manager.getRepository(ReferralLedgerEntry).create({
        referralId: lockedReferral.id,
        walletId: wallet.id,
        type: ReferralLedgerType.CREDIT,
        amount: rewardAmount.toFixed(8),
        balanceBefore,
        balanceAfter,
      });
      await manager.getRepository(ReferralLedgerEntry).save(ledgerEntry);

      await this.notificationsService.create({
        userId: lockedReferral.referrerId,
        type: NotificationType.REFERRAL_REWARDED,
        title: 'Referral Reward',
        message: `You earned ${REFERRAL_REWARD_AMOUNT} ${REFERRAL_REWARD_CURRENCY} for your referral.`,
        metadata: {
          entity: 'referral',
          event: 'referral.rewarded',
          referralId: lockedReferral.id,
          referredId,
          rewardAmount: REFERRAL_REWARD_AMOUNT,
          rewardCurrency: REFERRAL_REWARD_CURRENCY,
        },
        relatedId: lockedReferral.id,
      });
    });

    this.logger.log(
      `Referral reward of ${REFERRAL_REWARD_AMOUNT} ${REFERRAL_REWARD_CURRENCY} credited to referrer ${referral.referrerId}`,
    );
  }
}
