/* SPDX-License-Identifier: AGPL-3.0-only */
import { MigrationInterface, QueryRunner } from "typeorm";

export class RoleConnectionConfigurations1793100000000 implements MigrationInterface {
    name = "RoleConnectionConfigurations1793100000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "connection_configurations" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN IF EXISTS "connection_configurations"`);
    }
}
