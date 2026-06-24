import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { User } from '../../users/user.entity';
import { CurrencyWalletsModule } from '../wallets/wallets.module';
import { ReferralLedgerEntry } from './entities/referral-ledger.entity';
import { V2Referral } from './entities/referral.entity';
import { V2ReferralsController } from './referrals.controller';
import { V2ReferralsService } from './referrals.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      V2Referral,
      ReferralLedgerEntry,
      User,
      Transaction,
    ]),
    CurrencyWalletsModule,
    NotificationsModule,
    CommonModule,
  ],
  controllers: [V2ReferralsController],
  providers: [V2ReferralsService],
  exports: [V2ReferralsService],
})
export class V2ReferralsModule {}
