import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrencyWallet } from './entities/wallet.entity';
import { CurrencyWalletsService } from './wallets.service';

@Module({
  imports: [TypeOrmModule.forFeature([CurrencyWallet])],
  providers: [CurrencyWalletsService],
  exports: [CurrencyWalletsService, TypeOrmModule],
})
export class CurrencyWalletsModule {}
