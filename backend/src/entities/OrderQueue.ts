// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * OrderQueue entity for the PostgreSQL-based queue system
 * Stores orders to be processed asynchronously with retry logic
 */

import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  UpdateDateColumn,
  Index
} from "typeorm";

/**
 * Status values for queue items
 */
export enum OrderQueueStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DEAD_LETTER = 'dead_letter'
}

/**
 * OrderQueue entity for storing orders in the processing queue
 */
@Entity("order_queue")
export class OrderQueue {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * JSON data containing the complete order details
   */
  @Column({ type: "jsonb" })
  order_data: any;

  /**
   * JSON data containing the Auth0 user information (if available)
   */
  @Column({ type: "jsonb", nullable: true })
  auth0_user: any;

  /**
   * Current status of the queue item
   */
  @Column({ 
    type: "varchar", 
    length: 50, 
    default: OrderQueueStatus.PENDING 
  })
  @Index()
  status: string;

  /**
   * Number of processing attempts made
   */
  @Column({ type: "integer", default: 0 })
  attempts: number;

  /**
   * Maximum number of attempts before moving to dead_letter
   */
  @Column({ type: "integer", default: 3 })
  max_attempts: number;

  /**
   * When the item was added to the queue
   */
  @CreateDateColumn({ type: "timestamp" })
  created_at: Date;

  /**
   * When the item was last updated
   */
  @UpdateDateColumn({ type: "timestamp" })
  updated_at: Date;

  /**
   * When to attempt processing next (for delayed retry)
   */
  @Column({ type: "timestamp", nullable: true })
  @Index()
  next_attempt_at: Date | null;

  /**
   * Error message from the last failed attempt
   */
  @Column({ type: "text", nullable: true })
  error_message: string | null;

  /**
   * Correlation ID for tracking and logging
   */
  @Column({ type: "varchar", length: 100, nullable: true })
  correlation_id: string | null;

  /**
   * When processing started for the current attempt
   */
  @Column({ type: "timestamp", nullable: true })
  processing_started_at: Date | null;

  /**
   * When processing completed successfully
   */
  @Column({ type: "timestamp", nullable: true })
  completed_at: Date | null;
}
