import type { MigrationInterface, QueryRunner } from "typeorm";

export class UserActivityStatsAndOverrides1794530000000 implements MigrationInterface {
    name = "UserActivityStatsAndOverrides1794530000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "badge_overrides" jsonb`);
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "user_activity_stats" (
                "user_id" bigint NOT NULL,
                "game_seconds" bigint NOT NULL DEFAULT 0,
                "stream_seconds" bigint NOT NULL DEFAULT 0,
                "games" jsonb NOT NULL DEFAULT '[]',
                "tier_unlocks" jsonb NOT NULL DEFAULT '{}',
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_user_activity_stats" PRIMARY KEY ("user_id"),
                CONSTRAINT "FK_user_activity_stats_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            )`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "user_activity_stats"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "badge_overrides"`);
    }
}
