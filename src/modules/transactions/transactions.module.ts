import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { ExchangeRatesModule } from '../../exchange-rates/exchange-rates.module';
import { KycModule } from '../../kyc/kyc.module';
import { CurrencyWalletsModule } from '../wallets/wallets.module';
import { Ledger } from './entities/ledger.entity';
import { V2Transaction } from './entities/transaction.entity';
import { V2TransactionsController } from './transactions.controller';
import { V2TransactionsService } from './transactions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([V2Transaction, Ledger]),
    CurrencyWalletsModule,
    ExchangeRatesModule,
    CommonModule,
    KycModule,
  ],
  controllers: [V2TransactionsController],
  providers: [V2TransactionsService],
  exports: [V2TransactionsService],
})
export class V2TransactionsModule {}
