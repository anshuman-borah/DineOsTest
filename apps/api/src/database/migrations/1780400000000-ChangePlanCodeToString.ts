import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangePlanCodeToString1780400000000 implements MigrationInterface {
  name = 'ChangePlanCodeToString1780400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "plans" ALTER COLUMN "code" TYPE varchar`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // If needed to revert, but we'll leave it as varchar
    await queryRunner.query(`ALTER TABLE "plans" ALTER COLUMN "code" TYPE varchar`);
  }
}
