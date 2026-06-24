import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReferralAnd2faFields1763000000000 implements MigrationInterface {
  name = 'AddReferralAnd2faFields1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "currency_wallets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid,
        "currency" character varying(10) NOT NULL,
        "balance" numeric(20,8) NOT NULL DEFAULT '0',
        "isPlatform" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_currency_wallets_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_currency_wallets_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_currency_wallets_user_currency"
      ON "currency_wallets" ("userId", "currency")
      WHERE "userId" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "v2_referrals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "referrerId" uuid NOT NULL,
        "referredId" uuid NOT NULL,
        "rewardAmount" numeric(20,8),
        "rewardCurrency" character varying(10),
        "rewardedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_v2_referrals_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_v2_referrals_referredId" UNIQUE ("referredId"),
        CONSTRAINT "FK_v2_referrals_referrerId" FOREIGN KEY ("referrerId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_v2_referrals_referredId" FOREIGN KEY ("referredId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_v2_referrals_referrerId"
      ON "v2_referrals" ("referrerId")
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."referral_ledger_entries_type_enum" AS ENUM ('DEBIT', 'CREDIT')
    `);

    await queryRunner.query(`
      CREATE TABLE "referral_ledger_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "referralId" uuid NOT NULL,
        "walletId" uuid NOT NULL,
        "type" "public"."referral_ledger_entries_type_enum" NOT NULL,
        "amount" numeric(20,8) NOT NULL,
        "balanceBefore" numeric(20,8) NOT NULL,
        "balanceAfter" numeric(20,8) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_referral_ledger_entries_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_referral_ledger_entries_referralId" FOREIGN KEY ("referralId") REFERENCES "v2_referrals"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_referral_ledger_entries_walletId" FOREIGN KEY ("walletId") REFERENCES "currency_wallets"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_referral_ledger_entries_walletId"
      ON "referral_ledger_entries" ("walletId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "referral_ledger_entries"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."referral_ledger_entries_type_enum"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "v2_referrals"');
  }
}
