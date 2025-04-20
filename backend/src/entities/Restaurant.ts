import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from "typeorm";
// Import types only for type checking, not for runtime
import type { MenuItem } from "./MenuItem.js";
import type { Order } from "./Order.js";

@Entity("restaurants")
export class Restaurant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "text", nullable: true })
  address: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone: string;

  @Column({ type: "boolean", default: true })
  is_active: boolean;

  // Relationships - use string references to avoid circular dependencies
  @OneToMany('MenuItem', 'restaurant')
  menu_items: MenuItem[];

  @OneToMany('Order', 'restaurant')
  orders: Order[];
} 