import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProcessingFeeColumn1747801142450 implements MigrationInterface {
    name = 'AddProcessingFeeColumn1747801142450'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add processing_fee column if it doesn't exist
        const processingFeeColumn = await queryRunner.query(`
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'orders' AND column_name = 'processing_fee'
        `);
        
        if (processingFeeColumn.length === 0) {
            await queryRunner.query(`ALTER TABLE "orders" ADD "processing_fee" decimal(10,2) NULL`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove processing_fee column if it exists
        const processingFeeColumn = await queryRunner.query(`
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'orders' AND column_name = 'processing_fee'
        `);
        
        if (processingFeeColumn.length > 0) {
            await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "processing_fee"`);
        }
    }
} 