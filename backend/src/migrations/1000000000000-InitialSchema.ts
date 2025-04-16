import { MigrationInterface, QueryRunner, Table, TableForeignKey } from "typeorm";

export class InitialSchema1000000000000 implements MigrationInterface {
    name = 'InitialSchema1000000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create customers table
        await queryRunner.createTable(new Table({
            name: "customers",
            columns: [
                {
                    name: "id",
                    type: "integer",
                    isPrimary: true,
                    isGenerated: true,
                    generationStrategy: "increment"
                },
                {
                    name: "name",
                    type: "varchar",
                    length: "255",
                    isNullable: false
                },
                {
                    name: "email",
                    type: "varchar",
                    length: "255",
                    isNullable: false,
                    isUnique: true
                },
                {
                    name: "phone",
                    type: "varchar",
                    length: "20",
                    isNullable: false
                },
                {
                    name: "created_at",
                    type: "timestamp",
                    default: "CURRENT_TIMESTAMP"
                }
            ]
        }), true);

        // Create restaurants table
        await queryRunner.createTable(new Table({
            name: "restaurants",
            columns: [
                {
                    name: "id",
                    type: "integer",
                    isPrimary: true,
                    isGenerated: true,
                    generationStrategy: "increment"
                },
                {
                    name: "name",
                    type: "varchar",
                    length: "255",
                    isNullable: false
                },
                {
                    name: "address",
                    type: "text",
                    isNullable: false
                },
                {
                    name: "created_at",
                    type: "timestamp",
                    default: "CURRENT_TIMESTAMP"
                }
            ]
        }), true);

        // Create menu_items table
        await queryRunner.createTable(new Table({
            name: "menu_items",
            columns: [
                {
                    name: "id",
                    type: "integer",
                    isPrimary: true,
                    isGenerated: true,
                    generationStrategy: "increment"
                },
                {
                    name: "name",
                    type: "varchar",
                    length: "255",
                    isNullable: false
                },
                {
                    name: "description",
                    type: "text",
                    isNullable: true
                },
                {
                    name: "price",
                    type: "decimal",
                    precision: 10,
                    scale: 2,
                    isNullable: false
                },
                {
                    name: "restaurant_id",
                    type: "integer",
                    isNullable: false
                },
                {
                    name: "created_at",
                    type: "timestamp",
                    default: "CURRENT_TIMESTAMP"
                }
            ]
        }), true);

        // Create orders table
        await queryRunner.createTable(new Table({
            name: "orders",
            columns: [
                {
                    name: "id",
                    type: "integer",
                    isPrimary: true,
                    isGenerated: true,
                    generationStrategy: "increment"
                },
                {
                    name: "order_number",
                    type: "varchar",
                    length: "50",
                    isNullable: false,
                    isUnique: true
                },
                {
                    name: "status",
                    type: "varchar",
                    length: "20",
                    isNullable: false
                },
                {
                    name: "subtotal",
                    type: "decimal",
                    precision: 10,
                    scale: 2,
                    isNullable: false
                },
                {
                    name: "tax",
                    type: "decimal",
                    precision: 10,
                    scale: 2,
                    isNullable: false
                },
                {
                    name: "total",
                    type: "decimal",
                    precision: 10,
                    scale: 2,
                    isNullable: false
                },
                {
                    name: "customer_id",
                    type: "integer",
                    isNullable: false
                },
                {
                    name: "restaurant_id",
                    type: "integer",
                    isNullable: false
                },
                {
                    name: "created_at",
                    type: "timestamp",
                    default: "CURRENT_TIMESTAMP"
                },
                {
                    name: "updated_at",
                    type: "timestamp",
                    default: "CURRENT_TIMESTAMP"
                }
            ]
        }), true);

        // Create order_items table
        await queryRunner.createTable(new Table({
            name: "order_items",
            columns: [
                {
                    name: "id",
                    type: "integer",
                    isPrimary: true,
                    isGenerated: true,
                    generationStrategy: "increment"
                },
                {
                    name: "quantity",
                    type: "integer",
                    isNullable: false
                },
                {
                    name: "price_at_time",
                    type: "decimal",
                    precision: 10,
                    scale: 2,
                    isNullable: false
                },
                {
                    name: "special_instructions",
                    type: "text",
                    isNullable: true
                },
                {
                    name: "order_id",
                    type: "integer",
                    isNullable: false
                },
                {
                    name: "menu_item_id",
                    type: "integer",
                    isNullable: false
                }
            ]
        }), true);

        // Create payments table
        await queryRunner.createTable(new Table({
            name: "payments",
            columns: [
                {
                    name: "id",
                    type: "integer",
                    isPrimary: true,
                    isGenerated: true,
                    generationStrategy: "increment"
                },
                {
                    name: "stripe_payment_id",
                    type: "varchar",
                    length: "255",
                    isNullable: false
                },
                {
                    name: "amount",
                    type: "decimal",
                    precision: 10,
                    scale: 2,
                    isNullable: false
                },
                {
                    name: "status",
                    type: "varchar",
                    length: "20",
                    isNullable: false
                },
                {
                    name: "payment_url",
                    type: "text",
                    isNullable: true
                },
                {
                    name: "order_id",
                    type: "integer",
                    isNullable: false
                },
                {
                    name: "created_at",
                    type: "timestamp",
                    default: "CURRENT_TIMESTAMP"
                },
                {
                    name: "updated_at",
                    type: "timestamp",
                    default: "CURRENT_TIMESTAMP"
                }
            ]
        }), true);

        // Add foreign key constraints
        await queryRunner.createForeignKey("menu_items", new TableForeignKey({
            columnNames: ["restaurant_id"],
            referencedColumnNames: ["id"],
            referencedTableName: "restaurants",
            onDelete: "CASCADE"
        }));

        await queryRunner.createForeignKey("orders", new TableForeignKey({
            columnNames: ["customer_id"],
            referencedColumnNames: ["id"],
            referencedTableName: "customers",
            onDelete: "CASCADE"
        }));

        await queryRunner.createForeignKey("orders", new TableForeignKey({
            columnNames: ["restaurant_id"],
            referencedColumnNames: ["id"],
            referencedTableName: "restaurants",
            onDelete: "CASCADE"
        }));

        await queryRunner.createForeignKey("order_items", new TableForeignKey({
            columnNames: ["order_id"],
            referencedColumnNames: ["id"],
            referencedTableName: "orders",
            onDelete: "CASCADE"
        }));

        await queryRunner.createForeignKey("order_items", new TableForeignKey({
            columnNames: ["menu_item_id"],
            referencedColumnNames: ["id"],
            referencedTableName: "menu_items",
            onDelete: "RESTRICT"
        }));

        await queryRunner.createForeignKey("payments", new TableForeignKey({
            columnNames: ["order_id"],
            referencedColumnNames: ["id"],
            referencedTableName: "orders",
            onDelete: "CASCADE"
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop tables in reverse order to handle foreign key constraints
        await queryRunner.dropTable("payments");
        await queryRunner.dropTable("order_items");
        await queryRunner.dropTable("orders");
        await queryRunner.dropTable("menu_items");
        await queryRunner.dropTable("restaurants");
        await queryRunner.dropTable("customers");
    }
} 