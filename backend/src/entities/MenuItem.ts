import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from "typeorm";
import { Restaurant } from "./Restaurant.js";
import { OrderItem } from "./OrderItem.js";

@Entity("menu_items")
export class MenuItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  price: number;

  @Column({ type: "varchar", length: 100, nullable: true })
  category: string;

  @Column({ type: "boolean", default: true })
  is_available: boolean;

  // Foreign key
  @Column({ type: "integer" })
  restaurant_id: number;

  // Relationships
  @ManyToOne(() => Restaurant, restaurant => restaurant.menu_items)
  restaurant: Restaurant;

  @OneToMany(() => OrderItem, orderItem => orderItem.menu_item)
  order_items: OrderItem[];
} 