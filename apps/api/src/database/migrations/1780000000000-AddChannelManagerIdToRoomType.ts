import { MigrationInterface, QueryRunner } from "typeorm";

export class AddChannelManagerIdToRoomType1780000000000 implements MigrationInterface {
    name = 'AddChannelManagerIdToRoomType1780000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "hotel_room_types" ADD COLUMN IF NOT EXISTS "channel_manager_id" character varying(100)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "hotel_room_types" DROP COLUMN "channel_manager_id"`);
    }
}
