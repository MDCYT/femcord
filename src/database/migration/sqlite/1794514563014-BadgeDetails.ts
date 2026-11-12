import type { MigrationInterface, QueryRunner } from "typeorm";

const hasColumn = async (queryRunner: QueryRunner, table: string, name: string) => {
    const rows: { name: string }[] = await queryRunner.query(`PRAGMA table_info("${table}")`);
    return rows.some((row) => row.name === name);
};

export class BadgeDetails1794514563014 implements MigrationInterface {
    name = "BadgeDetails1794514563014";

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (!(await hasColumn(queryRunner, "badges", "name"))) await queryRunner.query(`ALTER TABLE "badges" ADD COLUMN "name" text`);
        if (!(await hasColumn(queryRunner, "badges", "details"))) await queryRunner.query(`ALTER TABLE "badges" ADD COLUMN "details" text`);
        if (!(await hasColumn(queryRunner, "badges", "rarity"))) await queryRunner.query(`ALTER TABLE "badges" ADD COLUMN "rarity" smallint`);
        if (!(await hasColumn(queryRunner, "badges", "tagline"))) await queryRunner.query(`ALTER TABLE "badges" ADD COLUMN "tagline" text`);
        if (!(await hasColumn(queryRunner, "badges", "is_legacy"))) await queryRunner.query(`ALTER TABLE "badges" ADD COLUMN "is_legacy" boolean DEFAULT 0`);
        if (!(await hasColumn(queryRunner, "badges", "obtained_at"))) await queryRunner.query(`ALTER TABLE "badges" ADD COLUMN "obtained_at" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (await hasColumn(queryRunner, "badges", "name")) await queryRunner.query(`ALTER TABLE "badges" DROP COLUMN "name"`);
        if (await hasColumn(queryRunner, "badges", "details")) await queryRunner.query(`ALTER TABLE "badges" DROP COLUMN "details"`);
        if (await hasColumn(queryRunner, "badges", "rarity")) await queryRunner.query(`ALTER TABLE "badges" DROP COLUMN "rarity"`);
        if (await hasColumn(queryRunner, "badges", "tagline")) await queryRunner.query(`ALTER TABLE "badges" DROP COLUMN "tagline"`);
        if (await hasColumn(queryRunner, "badges", "is_legacy")) await queryRunner.query(`ALTER TABLE "badges" DROP COLUMN "is_legacy"`);
        if (await hasColumn(queryRunner, "badges", "obtained_at")) await queryRunner.query(`ALTER TABLE "badges" DROP COLUMN "obtained_at"`);
    }
}
