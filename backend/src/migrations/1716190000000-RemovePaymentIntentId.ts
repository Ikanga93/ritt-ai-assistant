import { MigrationInterface, QueryRunner } from "typeorm";

export class RemovePaymentIntentId1716190000000 implements MigrationInterface {
    name = 'RemovePaymentIntentId1716190000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check if the column exists before trying to drop it
        const hasColumn = await queryRunner.hasColumn('orders', 'payment_intent_id');
        
        if (hasColumn) {
            await queryRunner.query(`
                ALTER TABLE "orders" 
                DROP COLUMN "payment_intent_id"
            `);
            
            console.log('Dropped payment_intent_id column from orders table');
        } else {
            console.log('payment_intent_id column does not exist in orders table');
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Add the column back if rolling back
        await queryRunner.query(`
            ALTER TABLE "orders" 
            ADD COLUMN "payment_intent_id" character varying(255)
        `);
        
        console.log('Added payment_intent_id column back to orders table');
    }
}
