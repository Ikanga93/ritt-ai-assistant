export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: number;
  orderNumber: string;
  restaurantName: string;
  items: OrderItem[];
  total: number;
  paymentLink: string;
  createdAt: string;
} 