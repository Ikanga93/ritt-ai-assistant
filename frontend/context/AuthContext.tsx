"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface User {
  email: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    // In a real application, you would validate credentials with Auth0 here
    // For this simple example, we'll just store the user in localStorage
    if (!email || !password) {
      throw new Error("Email and password are required");
    }
    
    // Simulate authentication
    const user = { email };
    localStorage.setItem("user", JSON.stringify(user));
    setUser(user);
  };

  const signup = async (email: string, password: string) => {
    // In a real application, you would create a new user with Auth0 here
    // For this simple example, we'll just store the user in localStorage
    if (!email || !password) {
      throw new Error("Email and password are required");
    }
    
    // Simulate user creation
    const user = { email };
    localStorage.setItem("user", JSON.stringify(user));
    setUser(user);
  };

  const logout = () => {
    // Clear user from localStorage and state
    localStorage.removeItem("user");
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
