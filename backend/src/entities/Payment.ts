import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from "typeorm";
import { Order } from "./Order.js";

@Entity("payments")
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 255, nullable: true })
  stripe_payment_id: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  amount: number;

  @Column({ type: "varchar", length: 50 })
  status: string;

  @Column({ type: "text", nullable: true })
  payment_url: string;

  @CreateDateColumn({ type: "timestamp" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at: Date;

  // Foreign key
  @Column({ type: "integer" })
  order_id: number;

  // Relationship
  @OneToOne(() => Order, order => order.payment)
  @JoinColumn({ name: "order_id" })
  order: Order;
} 