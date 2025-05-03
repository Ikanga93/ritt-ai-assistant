import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaymentFields1745726400000 implements MigrationInterface {
    name = 'AddPaymentFields1745726400000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add payment_status column with default value 'pending'
        await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_status" varchar(50) DEFAULT 'pending'`);
        
        // Add payment link related columns
        await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_link_id" varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_link_url" varchar(1000) NULL`);
        await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_link_created_at" timestamp NULL`);
        await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_link_expires_at" timestamp NULL`);
        await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "paid_at" timestamp NULL`);
        
        // Set default payment_status for existing records
        await queryRunner.query(`UPDATE "orders" SET "payment_status" = 'pending' WHERE "payment_status" IS NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove payment-related columns
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "payment_status"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "payment_link_id"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "payment_link_url"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "payment_link_created_at"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "payment_link_expires_at"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "paid_at"`);
    }
}
