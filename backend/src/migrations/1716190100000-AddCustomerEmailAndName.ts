import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCustomerEmailAndName1716190100000 implements MigrationInterface {
    name = 'AddCustomerEmailAndName1716190100000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" ADD "customer_email" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "customer_name" character varying(255)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "customer_name"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "customer_email"`);
    }
}
