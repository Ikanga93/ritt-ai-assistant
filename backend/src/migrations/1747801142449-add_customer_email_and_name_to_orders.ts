import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCustomerEmailAndNameToOrders1747801142449 implements MigrationInterface {
    name = 'AddCustomerEmailAndNameToOrders1747801142449'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check if constraint exists before dropping it
        const constraintExists = await queryRunner.query(`
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'FK_e5de51ca888d8b1f5ac25799dd1' 
            AND table_name = 'orders'
        `);
        
        if (constraintExists.length > 0) {
            await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_e5de51ca888d8b1f5ac25799dd1"`);
        }
        
        // Check if indexes exist before dropping them
        const customerAuth0Index = await queryRunner.query(`
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'IDX_customer_auth0Id'
        `);
        
        if (customerAuth0Index.length > 0) {
            await queryRunner.query(`DROP INDEX "public"."IDX_customer_auth0Id"`);
        }
        
        const statusIndex = await queryRunner.query(`
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'idx_order_queue_status'
        `);
        
        if (statusIndex.length > 0) {
            await queryRunner.query(`DROP INDEX "public"."idx_order_queue_status"`);
        }
        
        const nextAttemptIndex = await queryRunner.query(`
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'idx_order_queue_next_attempt'
        `);
        
        if (nextAttemptIndex.length > 0) {
            await queryRunner.query(`DROP INDEX "public"."idx_order_queue_next_attempt"`);
        }
        
        // Check if column exists before dropping it
        const customerIdColumn = await queryRunner.query(`
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'orders' AND column_name = 'customerId'
        `);
        
        if (customerIdColumn.length > 0) {
            await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "customerId"`);
        }
        
        // Add columns if they don't exist
        const customerEmailColumn = await queryRunner.query(`
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'orders' AND column_name = 'customer_email'
        `);
        
        if (customerEmailColumn.length === 0) {
            await queryRunner.query(`ALTER TABLE "orders" ADD "customer_email" character varying(255)`);
        }
        
        const customerNameColumn = await queryRunner.query(`
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'orders' AND column_name = 'customer_name'
        `);
        
        if (customerNameColumn.length === 0) {
            await queryRunner.query(`ALTER TABLE "orders" ADD "customer_name" character varying(255)`);
        }
        
        // Add unique constraint if it doesn't exist
        const uniqueConstraint = await queryRunner.query(`
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'UQ_f5236e4e2e387f5f8456b71b422' 
            AND table_name = 'customers'
        `);
        
        if (uniqueConstraint.length === 0) {
            await queryRunner.query(`ALTER TABLE "customers" ADD CONSTRAINT "UQ_f5236e4e2e387f5f8456b71b422" UNIQUE ("auth0Id")`);
        }
        
        // Update column defaults and constraints
        await queryRunner.query(`ALTER TABLE "customers" ALTER COLUMN "updated_at" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" SET NOT NULL`);
        
        // Create new indexes if they don't exist
        const newStatusIndex = await queryRunner.query(`
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'IDX_98c4570bc25d4d5747284d24f1'
        `);
        
        if (newStatusIndex.length === 0) {
            await queryRunner.query(`CREATE INDEX "IDX_98c4570bc25d4d5747284d24f1" ON "order_queue" ("status")`);
        }
        
        const newNextAttemptIndex = await queryRunner.query(`
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'IDX_7b9a74596025b568606c58514a'
        `);
        
        if (newNextAttemptIndex.length === 0) {
            await queryRunner.query(`CREATE INDEX "IDX_7b9a74596025b568606c58514a" ON "order_queue" ("next_attempt_at")`);
        }
        
        // Add foreign key constraint if it doesn't exist
        const newForeignKey = await queryRunner.query(`
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'FK_772d0ce0473ac2ccfa26060dbe9' 
            AND table_name = 'orders'
        `);
        
        if (newForeignKey.length === 0) {
            await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Safe rollback - check if things exist before dropping them
        const foreignKey = await queryRunner.query(`
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'FK_772d0ce0473ac2ccfa26060dbe9' 
            AND table_name = 'orders'
        `);
        
        if (foreignKey.length > 0) {
            await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9"`);
        }
        
        const statusIndex = await queryRunner.query(`
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'IDX_7b9a74596025b568606c58514a'
        `);
        
        if (statusIndex.length > 0) {
            await queryRunner.query(`DROP INDEX "public"."IDX_7b9a74596025b568606c58514a"`);
        }
        
        const nextAttemptIndex = await queryRunner.query(`
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'IDX_98c4570bc25d4d5747284d24f1'
        `);
        
        if (nextAttemptIndex.length > 0) {
            await queryRunner.query(`DROP INDEX "public"."IDX_98c4570bc25d4d5747284d24f1"`);
        }
        
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "customers" ALTER COLUMN "updated_at" DROP DEFAULT`);
        
        const uniqueConstraint = await queryRunner.query(`
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'UQ_f5236e4e2e387f5f8456b71b422' 
            AND table_name = 'customers'
        `);
        
        if (uniqueConstraint.length > 0) {
            await queryRunner.query(`ALTER TABLE "customers" DROP CONSTRAINT "UQ_f5236e4e2e387f5f8456b71b422"`);
        }
        
        const customerNameColumn = await queryRunner.query(`
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'orders' AND column_name = 'customer_name'
        `);
        
        if (customerNameColumn.length > 0) {
            await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "customer_name"`);
        }
        
        const customerEmailColumn = await queryRunner.query(`
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'orders' AND column_name = 'customer_email'
        `);
        
        if (customerEmailColumn.length > 0) {
            await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "customer_email"`);
        }
        
        const customerIdColumn = await queryRunner.query(`
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'orders' AND column_name = 'customerId'
        `);
        
        if (customerIdColumn.length === 0) {
            await queryRunner.query(`ALTER TABLE "orders" ADD "customerId" integer`);
        }
        
        // Recreate old indexes if they don't exist
        const oldNextAttemptIndex = await queryRunner.query(`
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'idx_order_queue_next_attempt'
        `);
        
        if (oldNextAttemptIndex.length === 0) {
            await queryRunner.query(`CREATE INDEX "idx_order_queue_next_attempt" ON "order_queue" ("next_attempt_at")`);
        }
        
        const oldStatusIndex = await queryRunner.query(`
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'idx_order_queue_status'
        `);
        
        if (oldStatusIndex.length === 0) {
            await queryRunner.query(`CREATE INDEX "idx_order_queue_status" ON "order_queue" ("status")`);
        }
        
        const oldAuth0Index = await queryRunner.query(`
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'IDX_customer_auth0Id'
        `);
        
        if (oldAuth0Index.length === 0) {
            await queryRunner.query(`CREATE UNIQUE INDEX "IDX_customer_auth0Id" ON "customers" ("auth0Id") WHERE ("auth0Id" IS NOT NULL)`);
        }
        
        const oldForeignKey = await queryRunner.query(`
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'FK_e5de51ca888d8b1f5ac25799dd1' 
            AND table_name = 'orders'
        `);
        
        if (oldForeignKey.length === 0) {
            await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_e5de51ca888d8b1f5ac25799dd1" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        }
    }
}
