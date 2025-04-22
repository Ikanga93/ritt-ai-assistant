// pages/api/auth/[...auth0].js
import { handleAuth, handleCallback } from '@auth0/nextjs-auth0';
import { syncCustomerWithAuth0 } from '../../../backend/src/services/customerAuthService';

// Custom callback handler to sync Auth0 user with our database
const afterCallback = async (req, res, session) => {
  try {
    // Sync the Auth0 user with our customer database
    if (session?.user) {
      await syncCustomerWithAuth0(session.user);
    }
    
    // Return the session to continue the Auth0 flow
    return session;
  } catch (error) {
    console.error('Error in Auth0 afterCallback:', error);
    // Still return the session even if sync fails
    return session;
  }
};

// Export the Auth0 API route handler
export default handleAuth({
  async callback(req, res) {
    try {
      // Use the custom callback handler
      return await handleCallback(req, res, { afterCallback });
    } catch (error) {
      console.error('Auth0 callback error:', error);
      res.status(error.status || 500).end(error.message);
    }
  }
});
