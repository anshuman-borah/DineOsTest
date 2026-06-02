import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShiftDepartment1780300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add the department column with default 'restaurant'
    await queryRunner.query(`
      ALTER TABLE shifts
      ADD COLUMN IF NOT EXISTS department VARCHAR(20) NOT NULL DEFAULT 'restaurant'
    `);

    // 2. Backfill all existing rows as 'restaurant'
    await queryRunner.query(`
      UPDATE shifts SET department = 'restaurant' WHERE department IS NULL
    `);

    // 3. Drop old unique index (branch_id, shift_number)
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_shifts_branchId_shiftNumber"
    `);
    // Also try the auto-generated name
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_shifts_branch_id_shift_number"
    `);

    // 4. Create new unique index including department
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_shifts_branch_department_number"
      ON shifts (branch_id, department, shift_number)
    `);

    // 5. Add index on department for filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shifts_department"
      ON shifts (department)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_shifts_department"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_shifts_branch_department_number"`);

    // Recreate the original unique index
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_shifts_branchId_shiftNumber"
      ON shifts (branch_id, shift_number)
    `);

    await queryRunner.query(`ALTER TABLE shifts DROP COLUMN IF EXISTS department`);
  }
}
