import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from "typeorm";
// Import types only for type checking, not for runtime
import type { Restaurant } from "./Restaurant.js";
import type { OrderItem } from "./OrderItem.js";

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

  // Relationships - use string reference to avoid circular dependency
  @ManyToOne('Restaurant', 'menu_items')
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: Restaurant;

  // Use string reference to avoid circular dependency
  @OneToMany('OrderItem', 'menu_item')
  order_items: OrderItem[];
} 