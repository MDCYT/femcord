/* SPDX-License-Identifier: AGPL-3.0-only */
import { MigrationInterface, QueryRunner } from "typeorm";

export class AutomodDryRun1792975512837 implements MigrationInterface {
    name = "AutomodDryRun1792975512837";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "automod_actions" ADD COLUMN IF NOT EXISTS "would_action" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "automod_actions" DROP COLUMN IF EXISTS "would_action"`);
    }
}
