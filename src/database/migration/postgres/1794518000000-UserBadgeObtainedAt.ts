import type { MigrationInterface, QueryRunner } from "typeorm";

export class UserBadgeObtainedAt1794518000000 implements MigrationInterface {
    name = "UserBadgeObtainedAt1794518000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "badge_obtained_at" jsonb`);
        await queryRunner.query(`
            UPDATE "users" u
            SET "badge_obtained_at" = (
                SELECT jsonb_object_agg(b, to_jsonb(u.created_at))
                FROM unnest(u.badge_ids) AS b
            )
            WHERE u.badge_ids IS NOT NULL AND array_length(u.badge_ids, 1) > 0 AND u.badge_obtained_at IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "badge_obtained_at"`);
    }
}
