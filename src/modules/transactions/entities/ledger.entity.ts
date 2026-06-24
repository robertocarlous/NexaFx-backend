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
import { V2Transaction } from './transaction.entity';

export enum LedgerEntryType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

@Entity('v2_ledger_entries')
@Index(['transactionId'])
@Index(['walletId'])
export class Ledger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  transactionId: string;

  @ManyToOne(() => V2Transaction, (transaction) => transaction.ledgerEntries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'transactionId' })
  transaction: V2Transaction;

  @Column({ type: 'uuid' })
  walletId: string;

  @ManyToOne(() => CurrencyWallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'walletId' })
  wallet: CurrencyWallet;

  @Column({
    type: 'enum',
    enum: LedgerEntryType,
  })
  type: LedgerEntryType;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  amount: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  balanceBefore: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  balanceAfter: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
