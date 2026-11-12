import type { MigrationInterface, QueryRunner } from "typeorm";

export class UserActivityStatsAndOverrides1794530000000 implements MigrationInterface {
    name = "UserActivityStatsAndOverrides1794530000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        try {
            await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "badge_overrides" text`);
        } catch {}
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "user_activity_stats" (
                "user_id" bigint NOT NULL,
                "game_seconds" bigint NOT NULL DEFAULT 0,
                "stream_seconds" bigint NOT NULL DEFAULT 0,
                "games" text NOT NULL DEFAULT '[]',
                "tier_unlocks" text NOT NULL DEFAULT '{}',
                "updated_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "PK_user_activity_stats" PRIMARY KEY ("user_id"),
                CONSTRAINT "FK_user_activity_stats_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            )`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "user_activity_stats"`);
    }
}
