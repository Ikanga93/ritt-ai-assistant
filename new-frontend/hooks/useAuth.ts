'use client';

import { useState, useEffect } from 'react';

interface Auth0User {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
  [key: string]: any;
}

interface Auth0Session {
  user: Auth0User;
  accessToken: string;
  idToken: string;
  expiresAt: number;
}

export function useAuth() {
  const [user, setUser] = useState<Auth0User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function loadUserFromCookie() {
      try {
        setIsLoading(true);
        
        // Try to get the auth0.session cookie
        const cookies = document.cookie.split(';');
        const sessionCookie = cookies.find(cookie => cookie.trim().startsWith('auth0.session='));
        
        if (sessionCookie) {
          try {
            const sessionValue = decodeURIComponent(sessionCookie.split('=')[1]);
            const session: Auth0Session = JSON.parse(sessionValue);
            
            if (session && session.user) {
              // Check if the session is expired
              if (session.expiresAt && session.expiresAt > Math.floor(Date.now() / 1000)) {
                console.log('Auth0 session valid, user:', session.user);
                setUser(session.user);
              } else {
                console.log('Auth0 session expired');
                // Redirect to login if session expired
                window.location.href = '/api/auth/login?returnTo=' + encodeURIComponent(window.location.pathname);
              }
            } else {
              console.log('Auth0 session exists but no user data');
              setUser(null);
            }
          } catch (parseError) {
            console.error('Error parsing session cookie:', parseError);
            setUser(null);
          }
        } else {
          console.log('No Auth0 session cookie found');
          setUser(null);
        }
      } catch (err) {
        console.error('Error loading user from cookie:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadUserFromCookie();
    
    // Set up an interval to periodically check if the session is still valid
    const interval = setInterval(loadUserFromCookie, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, []);
  
  // Function to log out the user
  const logout = () => {
    window.location.href = '/api/auth/logout';
  };
  
  // Function to log in the user
  const login = (returnTo = '/') => {
    // Store the current URL state to indicate we're in a voice ordering session
    try {
      localStorage.setItem('voice_ordering_session', 'active');
      sessionStorage.setItem('voice_ordering_session', 'active');
      console.log('Stored voice ordering session state before authentication');
    } catch (error) {
      console.error('Failed to store voice ordering session state:', error);
    }
    
    // Redirect to Auth0 login
    window.location.href = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  };

  return { user, isLoading, error, login, logout };
}
