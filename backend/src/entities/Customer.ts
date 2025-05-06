import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm";
// Use type import to avoid circular dependency
import type { Order } from "./Order.js";

@Entity("customers")
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  email: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone: string;

  @Column({ type: "varchar", length: 255, nullable: true, unique: true })
  auth0Id: string;

  @Column({ type: "varchar", length: 1024, nullable: true })
  picture: string;

  @CreateDateColumn({ type: "timestamp" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamp", nullable: true })
  updated_at: Date;

  // Relationships
  // Use string reference to avoid circular dependency
  @OneToMany('Order', 'customer')
  orders: Order[];
} 