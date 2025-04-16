import { MigrationInterface, QueryRunner, TableIndex } from "typeorm";

export class AddValidationConstraints1000000000001 implements MigrationInterface {
    name = 'AddValidationConstraints1000000000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add check constraints
        await queryRunner.query(`
            ALTER TABLE "orders"
            ADD CONSTRAINT "chk_order_status" 
            CHECK (status IN ('PENDING', 'PAID', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'FAILED', 'REFUNDED'))
        `);

        await queryRunner.query(`
            ALTER TABLE "payments"
            ADD CONSTRAINT "chk_payment_status" 
            CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'))
        `);

        await queryRunner.query(`
            ALTER TABLE "order_items"
            ADD CONSTRAINT "chk_quantity_positive" 
            CHECK (quantity > 0)
        `);

        await queryRunner.query(`
            ALTER TABLE "menu_items"
            ADD CONSTRAINT "chk_price_positive" 
            CHECK (price > 0)
        `);

        // Add indexes for frequently queried columns
        await queryRunner.createIndex("orders", new TableIndex({
            name: "idx_orders_customer_id",
            columnNames: ["customer_id"]
        }));

        await queryRunner.createIndex("orders", new TableIndex({
            name: "idx_orders_restaurant_id",
            columnNames: ["restaurant_id"]
        }));

        await queryRunner.createIndex("orders", new TableIndex({
            name: "idx_orders_status",
            columnNames: ["status"]
        }));

        await queryRunner.createIndex("orders", new TableIndex({
            name: "idx_orders_created_at",
            columnNames: ["created_at"]
        }));

        await queryRunner.createIndex("payments", new TableIndex({
            name: "idx_payments_order_id",
            columnNames: ["order_id"]
        }));

        await queryRunner.createIndex("payments", new TableIndex({
            name: "idx_payments_status",
            columnNames: ["status"]
        }));

        await queryRunner.createIndex("order_items", new TableIndex({
            name: "idx_order_items_order_id",
            columnNames: ["order_id"]
        }));

        await queryRunner.createIndex("menu_items", new TableIndex({
            name: "idx_menu_items_restaurant_id",
            columnNames: ["restaurant_id"]
        }));

        // Add triggers for updated_at timestamps
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);

        await queryRunner.query(`
            CREATE TRIGGER update_orders_updated_at
                BEFORE UPDATE ON orders
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        `);

        await queryRunner.query(`
            CREATE TRIGGER update_payments_updated_at
                BEFORE UPDATE ON payments
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop triggers
        await queryRunner.query(`DROP TRIGGER IF EXISTS update_orders_updated_at ON orders`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS update_payments_updated_at ON payments`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS update_updated_at_column`);

        // Drop indexes
        await queryRunner.dropIndex("menu_items", "idx_menu_items_restaurant_id");
        await queryRunner.dropIndex("order_items", "idx_order_items_order_id");
        await queryRunner.dropIndex("payments", "idx_payments_status");
        await queryRunner.dropIndex("payments", "idx_payments_order_id");
        await queryRunner.dropIndex("orders", "idx_orders_created_at");
        await queryRunner.dropIndex("orders", "idx_orders_status");
        await queryRunner.dropIndex("orders", "idx_orders_restaurant_id");
        await queryRunner.dropIndex("orders", "idx_orders_customer_id");

        // Drop check constraints
        await queryRunner.query(`ALTER TABLE "menu_items" DROP CONSTRAINT "chk_price_positive"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "chk_quantity_positive"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "chk_payment_status"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "chk_order_status"`);
    }
} 