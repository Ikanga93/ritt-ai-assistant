// pages/api/auth/[...auth0].js
import { handleAuth, handleCallback } from '@auth0/nextjs-auth0';
import { syncCustomerWithAuth0 } from '../../../backend/src/services/customerAuthService';

// TEMPORARILY BYPASS AUTHENTICATION
export default async function handler(req, res) {
  // Return a mock session for all auth routes
  if (req.query.auth0?.[0] === 'login') {
    // Redirect to home page after "login"
    res.redirect('/');
    return;
  }
  
  if (req.query.auth0?.[0] === 'logout') {
    // Redirect to home page after "logout"
    res.redirect('/');
    return;
  }
  
  // For all other auth routes, just return success
  res.status(200).json({ message: 'Auth bypassed' });
}

/* Original Auth0 handler - commented out temporarily
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
*/
