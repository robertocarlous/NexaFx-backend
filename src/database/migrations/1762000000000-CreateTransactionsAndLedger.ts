import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionsAndLedger1762000000000 implements MigrationInterface {
  name = 'CreateTransactionsAndLedger1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "currency_wallets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid,
        "currency" character varying(10) NOT NULL,
        "balance" numeric(20,8) NOT NULL DEFAULT '0',
        "isPlatform" boolean NOT NULL DEFAULT false,
        "isBlocked" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_currency_wallets_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_currency_wallets_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_currency_wallets_user_currency"
      ON "currency_wallets" ("userId", "currency")
      WHERE "userId" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_currency_wallets_platform_currency"
      ON "currency_wallets" ("currency")
      WHERE "isPlatform" = true
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."v2_transactions_type_enum" AS ENUM (
        'SEND', 'RECEIVE', 'EXCHANGE', 'DEPOSIT', 'WITHDRAWAL'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."v2_transactions_status_enum" AS ENUM (
        'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "v2_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "type" "public"."v2_transactions_type_enum" NOT NULL,
        "fromCurrency" character varying(10) NOT NULL,
        "toCurrency" character varying(10) NOT NULL,
        "fromAmount" numeric(20,8) NOT NULL,
        "toAmount" numeric(20,8) NOT NULL,
        "exchangeRate" numeric(20,8),
        "fee" numeric(20,8) NOT NULL DEFAULT '0',
        "status" "public"."v2_transactions_status_enum" NOT NULL DEFAULT 'PENDING',
        "idempotencyKey" character varying(255) NOT NULL,
        "reference" character varying(50) NOT NULL,
        "stellarTxHash" character varying(255),
        "metadata" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "completedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_v2_transactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_v2_transactions_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_v2_transactions_user_idempotency"
      ON "v2_transactions" ("userId", "idempotencyKey")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_v2_transactions_user_status"
      ON "v2_transactions" ("userId", "status")
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."v2_ledger_entries_type_enum" AS ENUM ('DEBIT', 'CREDIT')
    `);

    await queryRunner.query(`
      CREATE TABLE "v2_ledger_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transactionId" uuid NOT NULL,
        "walletId" uuid NOT NULL,
        "type" "public"."v2_ledger_entries_type_enum" NOT NULL,
        "amount" numeric(20,8) NOT NULL,
        "balanceBefore" numeric(20,8) NOT NULL,
        "balanceAfter" numeric(20,8) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_v2_ledger_entries_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_v2_ledger_entries_transactionId" FOREIGN KEY ("transactionId") REFERENCES "v2_transactions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_v2_ledger_entries_walletId" FOREIGN KEY ("walletId") REFERENCES "currency_wallets"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_v2_ledger_entries_transactionId"
      ON "v2_ledger_entries" ("transactionId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_v2_ledger_entries_walletId"
      ON "v2_ledger_entries" ("walletId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "v2_ledger_entries"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."v2_ledger_entries_type_enum"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "v2_transactions"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."v2_transactions_status_enum"',
    );
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."v2_transactions_type_enum"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "currency_wallets"');
  }
}
