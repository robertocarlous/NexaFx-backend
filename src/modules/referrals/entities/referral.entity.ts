import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../../users/user.entity';

@Entity('v2_referrals')
@Index(['referrerId'])
export class V2Referral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  referrerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referrerId' })
  referrer: User;

  @Column({ type: 'uuid', unique: true })
  referredId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referredId' })
  referred: User;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  rewardAmount: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  rewardCurrency: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  rewardedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
