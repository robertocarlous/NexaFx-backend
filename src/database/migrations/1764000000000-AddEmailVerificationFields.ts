import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailVerificationFields1764000000000 implements MigrationInterface {
  name = 'AddEmailVerificationFields1764000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "isEmailVerified" boolean NOT NULL DEFAULT false,
      ADD COLUMN "emailVerificationTokenHash" character varying(64),
      ADD COLUMN "emailVerificationExpires" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN "passwordResetTokenHash" character varying(64),
      ADD COLUMN "passwordResetExpires" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN "emailVerificationLastSentAt" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      UPDATE "users"
      SET "isEmailVerified" = "isVerified"
      WHERE "isVerified" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "emailVerificationLastSentAt",
      DROP COLUMN IF EXISTS "passwordResetExpires",
      DROP COLUMN IF EXISTS "passwordResetTokenHash",
      DROP COLUMN IF EXISTS "emailVerificationExpires",
      DROP COLUMN IF EXISTS "emailVerificationTokenHash",
      DROP COLUMN IF EXISTS "isEmailVerified"
    `);
  }
}
