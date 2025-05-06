import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, OneToOne, JoinColumn } from "typeorm";
// Use type imports to avoid circular dependencies
import type { Customer } from "./Customer.js";
import type { Restaurant } from "./Restaurant.js";
import type { OrderItem } from "./OrderItem.js";

/**
 * Payment status enum for orders
 */
export enum PaymentStatus {
  PENDING = "pending",
  PAID = "paid",
  FAILED = "failed",
  EXPIRED = "expired",
  REFUNDED = "refunded"
}


@Entity("orders")
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 50, unique: true })
  order_number: string;

  @Column({ type: "varchar", length: 50 })
  status: string;
  
  @Column({ type: "varchar", length: 50, default: PaymentStatus.PENDING })
  payment_status: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  subtotal: number;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  tax: number;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  processing_fee: number;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  total: number;
  
  @Column({ type: "varchar", length: 255, nullable: true })
  payment_link_id: string;
  
  @Column({ type: "varchar", length: 1000, nullable: true })
  payment_link_url: string;
  
  @Column({ type: "timestamp", nullable: true })
  payment_link_created_at: Date;
  
  @Column({ type: "timestamp", nullable: true })
  payment_link_expires_at: Date;
  
  @Column({ type: "timestamp", nullable: true })
  paid_at: Date;

  @CreateDateColumn({ type: "timestamp" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at: Date;

  // Foreign keys
  @Column({ type: "integer" })
  customer_id: number;

  @Column({ type: "integer" })
  restaurant_id: number;

  // Relationships
  // Use string reference to avoid circular dependency
  @ManyToOne('Customer', 'orders')
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  // Use string reference to avoid circular dependency
  @ManyToOne('Restaurant', 'orders')
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: Restaurant;

  // Use string reference to avoid circular dependency
  @OneToMany('OrderItem', 'order')
  order_items: OrderItem[];


} 