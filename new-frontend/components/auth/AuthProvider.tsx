'use client';

// Simple AuthProvider that doesn't depend on Auth0 SDK
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
