// pages/api/submit-order.js
// import { getSession } from '@auth0/nextjs-auth0'; // Commented out temporarily
import { saveOrderToDatabase } from '../../backend/src/services/orderService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const orderDetails = req.body;
    
    // TEMPORARILY REMOVE AUTH CHECK
    // const session = await getSession(req, res);
    // const auth0User = session?.user;
    
    // Save order to database without Auth0 user
    const result = await saveOrderToDatabase(orderDetails, null);
    
    return res.status(200).json({
      success: true,
      orderId: result.orderId,
      // isAuthenticated: !!auth0User // Commented out temporarily
    });
  } catch (error) {
    console.error('Error submitting order:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error submitting order',
      error: error.message 
    });
  }
}
