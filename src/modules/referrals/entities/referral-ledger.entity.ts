import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CurrencyWallet } from '../../wallets/entities/wallet.entity';
import { V2Referral } from './referral.entity';

export enum ReferralLedgerType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

@Entity('referral_ledger_entries')
@Index(['walletId'])
@Index(['referralId'])
export class ReferralLedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  referralId: string;

  @ManyToOne(() => V2Referral, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referralId' })
  referral: V2Referral;

  @Column({ type: 'uuid' })
  walletId: string;

  @ManyToOne(() => CurrencyWallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'walletId' })
  wallet: CurrencyWallet;

  @Column({
    type: 'enum',
    enum: ReferralLedgerType,
  })
  type: ReferralLedgerType;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  amount: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  balanceBefore: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  balanceAfter: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
