import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from "typeorm";
import { MenuItem } from "./MenuItem.js";
import { Order } from "./Order.js";

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

  // Relationships
  @OneToMany(() => MenuItem, menuItem => menuItem.restaurant)
  menu_items: MenuItem[];

  @OneToMany(() => Order, order => order.restaurant)
  orders: Order[];
} 