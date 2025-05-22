import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCustomerEmailAndNameToOrders1747801142449 implements MigrationInterface {
    name = 'AddCustomerEmailAndNameToOrders1747801142449'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_e5de51ca888d8b1f5ac25799dd1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_customer_auth0Id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_order_queue_status"`);
        await queryRunner.query(`DROP INDEX "public"."idx_order_queue_next_attempt"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "customerId"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "customer_email" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "customer_name" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "customers" ADD CONSTRAINT "UQ_f5236e4e2e387f5f8456b71b422" UNIQUE ("auth0Id")`);
        await queryRunner.query(`ALTER TABLE "customers" ALTER COLUMN "updated_at" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" SET NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_98c4570bc25d4d5747284d24f1" ON "order_queue" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_7b9a74596025b568606c58514a" ON "order_queue" ("next_attempt_at") `);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7b9a74596025b568606c58514a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_98c4570bc25d4d5747284d24f1"`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "customers" ALTER COLUMN "updated_at" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "customers" DROP CONSTRAINT "UQ_f5236e4e2e387f5f8456b71b422"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "customer_name"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "customer_email"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "customerId" integer`);
        await queryRunner.query(`CREATE INDEX "idx_order_queue_next_attempt" ON "order_queue" ("next_attempt_at") `);
        await queryRunner.query(`CREATE INDEX "idx_order_queue_status" ON "order_queue" ("status") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_customer_auth0Id" ON "customers" ("auth0Id") WHERE ("auth0Id" IS NOT NULL)`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_e5de51ca888d8b1f5ac25799dd1" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
