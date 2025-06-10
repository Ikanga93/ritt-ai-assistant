import { MigrationInterface, QueryRunner } from "typeorm";

export class FixCustomerEmailConstraint1747801142451 implements MigrationInterface {
    name = 'FixCustomerEmailConstraint1747801142451'

    public async up(queryRunner: QueryRunner): Promise<void> {
        console.log('🔧 Fixing customer email constraint issue...');
        
        // First, update any empty string emails to NULL
        const emptyEmailCustomers = await queryRunner.query(`
            SELECT COUNT(*) as count FROM customers WHERE email = ''
        `);
        
        if (emptyEmailCustomers[0].count > 0) {
            console.log(`Found ${emptyEmailCustomers[0].count} customers with empty emails, updating to NULL...`);
            await queryRunner.query(`
                UPDATE customers SET email = NULL WHERE email = ''
            `);
        }
        
        // Drop the existing unique constraint on email if it exists
        // This constraint is causing the duplicate key error
        const emailConstraints = await queryRunner.query(`
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'customers' 
            AND constraint_type = 'UNIQUE' 
            AND constraint_name LIKE '%email%' OR constraint_name = 'UQ_8536b8b85c06969f84f0c098b03'
        `);
        
        for (const constraint of emailConstraints) {
            console.log(`Dropping email constraint: ${constraint.constraint_name}`);
            await queryRunner.query(`
                ALTER TABLE customers DROP CONSTRAINT IF EXISTS "${constraint.constraint_name}"
            `);
        }
        
        // Make email column nullable if it isn't already
        await queryRunner.query(`
            ALTER TABLE customers ALTER COLUMN email DROP NOT NULL
        `);
        
        // Create a partial unique index that allows multiple NULL values
        // This allows customers without emails while preventing duplicate emails
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique_idx 
            ON customers (email) 
            WHERE email IS NOT NULL AND email != ''
        `);
        
        console.log('✅ Customer email constraint fixed');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove the partial unique index
        await queryRunner.query(`
            DROP INDEX IF EXISTS customers_email_unique_idx
        `);
        
        // Restore the original unique constraint (this might fail if there are duplicates)
        try {
            await queryRunner.query(`
                ALTER TABLE customers ADD CONSTRAINT "UQ_8536b8b85c06969f84f0c098b03" UNIQUE (email)
            `);
        } catch (error) {
            console.warn('Could not restore original email unique constraint due to existing data');
        }
        
        // Make email column NOT NULL again (this might fail if there are NULL values)
        try {
            await queryRunner.query(`
                ALTER TABLE customers ALTER COLUMN email SET NOT NULL
            `);
        } catch (error) {
            console.warn('Could not make email column NOT NULL due to existing NULL values');
        }
    }
} 