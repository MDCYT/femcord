import type { MigrationInterface, QueryRunner } from "typeorm";

export class BadgeDetails1794514563014 implements MigrationInterface {
    name = "BadgeDetails1794514563014";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "badges" ADD COLUMN IF NOT EXISTS "name" text`);
        await queryRunner.query(`ALTER TABLE "badges" ADD COLUMN IF NOT EXISTS "details" text`);
        await queryRunner.query(`ALTER TABLE "badges" ADD COLUMN IF NOT EXISTS "rarity" smallint`);
        await queryRunner.query(`ALTER TABLE "badges" ADD COLUMN IF NOT EXISTS "tagline" text`);
        await queryRunner.query(`ALTER TABLE "badges" ADD COLUMN IF NOT EXISTS "is_legacy" boolean DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "badges" ADD COLUMN IF NOT EXISTS "obtained_at" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "badges" DROP COLUMN IF EXISTS "name"`);
        await queryRunner.query(`ALTER TABLE "badges" DROP COLUMN IF EXISTS "details"`);
        await queryRunner.query(`ALTER TABLE "badges" DROP COLUMN IF EXISTS "rarity"`);
        await queryRunner.query(`ALTER TABLE "badges" DROP COLUMN IF EXISTS "tagline"`);
        await queryRunner.query(`ALTER TABLE "badges" DROP COLUMN IF EXISTS "is_legacy"`);
        await queryRunner.query(`ALTER TABLE "badges" DROP COLUMN IF EXISTS "obtained_at"`);
    }
}
