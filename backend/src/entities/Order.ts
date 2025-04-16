import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, OneToOne } from "typeorm";
import { Customer } from "./Customer.js";
import { Restaurant } from "./Restaurant.js";
import { OrderItem } from "./OrderItem.js";
import { Payment } from "./Payment.js";

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

  @ManyToOne(() => Restaurant, restaurant => restaurant.orders)
  restaurant: Restaurant;

  @OneToMany(() => OrderItem, orderItem => orderItem.order)
  order_items: OrderItem[];

  @OneToOne(() => Payment, payment => payment.order)
  payment: Payment;
} 