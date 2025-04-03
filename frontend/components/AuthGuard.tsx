"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, ReactNode } from "react";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const [hasEmail, setHasEmail] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if email exists in localStorage
    const email = localStorage.getItem('userEmail');
    setHasEmail(!!email);
    setIsLoading(false);
    
    // If no email is found, redirect to email collection page
    if (!email) {
      router.push("/email-collection");
    }
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  // Only render children if user has provided an email
  return hasEmail ? <>{children}</> : null;
}
