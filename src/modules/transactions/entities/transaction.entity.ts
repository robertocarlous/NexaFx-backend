import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../../users/user.entity';
import { Ledger } from './ledger.entity';

export enum V2TransactionType {
  SEND = 'SEND',
  RECEIVE = 'RECEIVE',
  EXCHANGE = 'EXCHANGE',
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
}

export enum V2TransactionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

@Entity('v2_transactions')
@Index(['userId', 'status'])
@Index(['userId', 'idempotencyKey'], { unique: true })
export class V2Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: V2TransactionType,
  })
  type: V2TransactionType;

  @Column({ type: 'varchar', length: 10 })
  fromCurrency: string;

  @Column({ type: 'varchar', length: 10 })
  toCurrency: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  fromAmount: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  toAmount: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  exchangeRate: string | null;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: '0' })
  fee: string;

  @Column({
    type: 'enum',
    enum: V2TransactionStatus,
    default: V2TransactionStatus.PENDING,
  })
  status: V2TransactionStatus;

  @Column({ type: 'varchar', length: 255 })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 50 })
  reference: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stellarTxHash: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  completedAt: Date | null;

  @OneToMany(() => Ledger, (ledger) => ledger.transaction)
  ledgerEntries: Ledger[];
}
