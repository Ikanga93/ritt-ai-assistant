// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Migration to create the order_queue table for the PostgreSQL-based queue system
 */

import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateOrderQueue1714092000000 implements MigrationInterface {
    
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE order_queue (
                id SERIAL PRIMARY KEY,
                order_data JSONB NOT NULL,
                auth0_user JSONB,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                attempts INTEGER NOT NULL DEFAULT 0,
                max_attempts INTEGER NOT NULL DEFAULT 3,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                next_attempt_at TIMESTAMP,
                error_message TEXT,
                correlation_id VARCHAR(100),
                processing_started_at TIMESTAMP,
                completed_at TIMESTAMP
            );
            
            CREATE INDEX idx_order_queue_status ON order_queue(status);
            CREATE INDEX idx_order_queue_next_attempt ON order_queue(next_attempt_at);
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX IF EXISTS idx_order_queue_next_attempt;
            DROP INDEX IF EXISTS idx_order_queue_status;
            DROP TABLE IF EXISTS order_queue;
        `);
    }
}
