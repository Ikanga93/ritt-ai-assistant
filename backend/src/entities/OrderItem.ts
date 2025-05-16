import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
// Import types only to avoid circular dependencies
import type { Order } from "./Order.js";
import type { MenuItem } from "./MenuItem.js";

@Entity("order_items")
export class OrderItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "integer" })
  quantity: number;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  price_at_time: number;

  @Column({ type: "text", nullable: true })
  special_instructions: string | null;

  // Foreign keys
  @Column({ type: "integer" })
  order_id: number;

  @Column({ type: "integer" })
  menu_item_id: number;

  // Relationships - use string references to avoid circular dependencies
  @ManyToOne('Order', 'order_items')
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @ManyToOne('MenuItem', 'order_items')
  @JoinColumn({ name: 'menu_item_id' })
  menu_item: MenuItem;
} 