import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from "typeorm";
import { Order } from "./Order.js";
import { MenuItem } from "./MenuItem.js";

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
  @ManyToOne(() => Order, order => order.order_items)
  order: Order;

  @ManyToOne(() => MenuItem, menuItem => menuItem.order_items)
  menu_item: MenuItem;
} 