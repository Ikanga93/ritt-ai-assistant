import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, OneToOne, JoinColumn } from "typeorm";
import { Customer } from "./Customer.js";
// Import types only for type checking, not for runtime
import type { Restaurant } from "./Restaurant.js";
import type { OrderItem } from "./OrderItem.js";


@Entity("orders")
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 50, unique: true })
  order_number: string;

  @Column({ type: "varchar", length: 50 })
  status: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  subtotal: number;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  tax: number;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  total: number;

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
  @ManyToOne(() => Customer, customer => customer.orders)
  customer: Customer;

  // Use string reference to avoid circular dependency
  @ManyToOne('Restaurant', 'orders')
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: Restaurant;

  // Use string reference to avoid circular dependency
  @OneToMany('OrderItem', 'order')
  order_items: OrderItem[];


} 