// pages/api/submit-order.js
import { getSession } from '@auth0/nextjs-auth0';
import { saveOrderToDatabase } from '../../backend/src/services/orderDatabaseService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get order details from request body
    const orderDetails = req.body;
    
    // Get Auth0 session if available
    const session = await getSession(req, res);
    const auth0User = session?.user;
    
    // Save order to database with Auth0 user if available
    const result = await saveOrderToDatabase(orderDetails, auth0User);
    
    // Return success response
    return res.status(200).json({
      success: true,
      orderId: result.dbOrderId,
      orderNumber: result.orderNumber,
      isAuthenticated: !!auth0User
    });
  } catch (error) {
    console.error('Error submitting order:', error);
    return res.status(500).json({ 
      error: 'Failed to submit order',
      message: error.message 
    });
  }
}
