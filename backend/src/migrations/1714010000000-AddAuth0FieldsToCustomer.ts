import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAuth0FieldsToCustomer1714010000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add email column if it doesn't exist
        await queryRunner.query(`
            ALTER TABLE customers 
            ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL
        `);

        // Add auth0Id column if it doesn't exist
        await queryRunner.query(`
            ALTER TABLE customers 
            ADD COLUMN IF NOT EXISTS "auth0Id" VARCHAR(255) NULL
        `);

        // Add picture column if it doesn't exist
        await queryRunner.query(`
            ALTER TABLE customers 
            ADD COLUMN IF NOT EXISTS picture VARCHAR(1024) NULL
        `);

        // Add updated_at column if it doesn't exist
        await queryRunner.query(`
            ALTER TABLE customers 
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL
        `);

        // Add unique constraint to auth0Id
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customer_auth0Id" ON customers ("auth0Id")
            WHERE "auth0Id" IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove unique constraint
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customer_auth0Id"`);

        // Remove columns
        await queryRunner.query(`ALTER TABLE customers DROP COLUMN IF EXISTS updated_at`);
        await queryRunner.query(`ALTER TABLE customers DROP COLUMN IF EXISTS picture`);
        await queryRunner.query(`ALTER TABLE customers DROP COLUMN IF EXISTS "auth0Id"`);
        await queryRunner.query(`ALTER TABLE customers DROP COLUMN IF EXISTS email`);
    }
}
