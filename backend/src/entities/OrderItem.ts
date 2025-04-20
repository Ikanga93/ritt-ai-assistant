import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
// Import types only for type checking, not for runtime
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

  // Relationships
  // Use a string reference to Order to avoid circular dependency
  @ManyToOne('Order', 'order_items')
  @JoinColumn({ name: 'order_id' })
  order: Order;

  // Use string reference to avoid circular dependency
  @ManyToOne('MenuItem', 'order_items')
  @JoinColumn({ name: 'menu_item_id' })
  menu_item: MenuItem;
} 