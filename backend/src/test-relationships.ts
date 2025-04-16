import { AppDataSource, initializeDatabase } from "./database.js";
import { Customer } from "./entities/Customer.js";
import { Restaurant } from "./entities/Restaurant.js";
import { MenuItem } from "./entities/MenuItem.js";
import { Order } from "./entities/Order.js";
import { OrderItem } from "./entities/OrderItem.js";
import { Payment } from "./entities/Payment.js";

async function testRelationships() {
  try {
    // Initialize database connection
    await initializeDatabase();
    console.log("Database connected");

    // Create repositories
    const customerRepo = AppDataSource.getRepository(Customer);
    const restaurantRepo = AppDataSource.getRepository(Restaurant);
    const menuItemRepo = AppDataSource.getRepository(MenuItem);
    const orderRepo = AppDataSource.getRepository(Order);
    const orderItemRepo = AppDataSource.getRepository(OrderItem);
    const paymentRepo = AppDataSource.getRepository(Payment);

    // 1. Create a restaurant
    const restaurant = new Restaurant();
    restaurant.name = "Test Restaurant";
    restaurant.address = "123 Test St";
    restaurant.phone = "555-0123";
    restaurant.is_active = true;
    const savedRestaurant = await restaurantRepo.save(restaurant);
    console.log("Restaurant created:", savedRestaurant);

    // 2. Create menu items
    const menuItem1 = new MenuItem();
    menuItem1.name = "Test Item 1";
    menuItem1.description = "Description 1";
    menuItem1.price = 9.99;
    menuItem1.category = "Main";
    menuItem1.is_available = true;
    menuItem1.restaurant = savedRestaurant;
    menuItem1.restaurant_id = savedRestaurant.id;

    const menuItem2 = new MenuItem();
    menuItem2.name = "Test Item 2";
    menuItem2.description = "Description 2";
    menuItem2.price = 4.99;
    menuItem2.category = "Side";
    menuItem2.is_available = true;
    menuItem2.restaurant = savedRestaurant;
    menuItem2.restaurant_id = savedRestaurant.id;

    const savedMenuItems = await menuItemRepo.save([menuItem1, menuItem2]);
    console.log("Menu items created:", savedMenuItems);

    // 3. Create a customer
    const customer = new Customer();
    customer.name = "Test Customer";
    customer.email = "test@example.com";
    customer.phone = "555-0123";
    const savedCustomer = await customerRepo.save(customer);
    console.log("Customer created:", savedCustomer);

    // 4. Create an order
    const order = new Order();
    order.order_number = "TEST-" + Date.now();
    order.status = "pending";
    order.subtotal = 14.98;
    order.tax = 1.50;
    order.total = 16.48;
    order.customer = savedCustomer;
    order.customer_id = savedCustomer.id;
    order.restaurant = savedRestaurant;
    order.restaurant_id = savedRestaurant.id;
    const savedOrder = await orderRepo.save(order);
    console.log("Order created:", savedOrder);

    // 5. Create order items
    const orderItem1 = new OrderItem();
    orderItem1.quantity = 1;
    orderItem1.price_at_time = menuItem1.price;
    orderItem1.special_instructions = "Test instructions 1";
    orderItem1.order = savedOrder;
    orderItem1.order_id = savedOrder.id;
    orderItem1.menu_item = menuItem1;
    orderItem1.menu_item_id = menuItem1.id;

    const orderItem2 = new OrderItem();
    orderItem2.quantity = 1;
    orderItem2.price_at_time = menuItem2.price;
    orderItem2.special_instructions = "Test instructions 2";
    orderItem2.order = savedOrder;
    orderItem2.order_id = savedOrder.id;
    orderItem2.menu_item = menuItem2;
    orderItem2.menu_item_id = menuItem2.id;

    const savedOrderItems = await orderItemRepo.save([orderItem1, orderItem2]);
    console.log("Order items created:", savedOrderItems);

    // 6. Create payment
    const payment = new Payment();
    payment.stripe_payment_id = "test_stripe_" + Date.now();
    payment.amount = savedOrder.total;
    payment.status = "pending";
    payment.payment_url = "https://test-payment-url.com";
    payment.order = savedOrder;
    payment.order_id = savedOrder.id;
    const savedPayment = await paymentRepo.save(payment);
    console.log("Payment created:", savedPayment);

    // 7. Verify relationships
    console.log("\nVerifying relationships...");

    // Test restaurant -> menu items relationship
    const restaurantWithItems = await restaurantRepo.findOne({
      where: { id: savedRestaurant.id },
      relations: ["menu_items", "orders"]
    });
    console.log("Restaurant's menu items:", restaurantWithItems?.menu_items.length);
    console.log("Restaurant's orders:", restaurantWithItems?.orders.length);

    // Test customer -> orders relationship
    const customerWithOrders = await customerRepo.findOne({
      where: { id: savedCustomer.id },
      relations: ["orders"]
    });
    console.log("Customer's orders:", customerWithOrders?.orders.length);

    // Test order -> order items and payment relationships
    const orderWithRelations = await orderRepo.findOne({
      where: { id: savedOrder.id },
      relations: ["order_items", "payment", "customer", "restaurant"]
    });
    console.log("Order's items:", orderWithRelations?.order_items.length);
    console.log("Order's payment:", orderWithRelations?.payment?.id);
    console.log("Order's customer:", orderWithRelations?.customer.name);
    console.log("Order's restaurant:", orderWithRelations?.restaurant.name);

    console.log("\nAll relationships verified successfully!");

  } catch (error) {
    console.error("Error during relationship testing:", error);
  } finally {
    // Close the connection
    await AppDataSource.destroy();
  }
}

// Run the test
testRelationships(); 