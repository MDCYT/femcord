import type { MigrationInterface, QueryRunner } from "typeorm";

const hasColumn = async (queryRunner: QueryRunner, table: string, name: string) => {
    const rows: { name: string }[] = await queryRunner.query(`PRAGMA table_info("${table}")`);
    return rows.some((row) => row.name === name);
};

export class UserBadgeObtainedAt1794518000000 implements MigrationInterface {
    name = "UserBadgeObtainedAt1794518000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (!(await hasColumn(queryRunner, "users", "badge_obtained_at"))) {
            await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "badge_obtained_at" text`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (await hasColumn(queryRunner, "users", "badge_obtained_at")) {
            await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "badge_obtained_at"`);
        }
    }
}
