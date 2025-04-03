"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LoginPage() {
  const { isAuthenticated, error, isLoading, loginWithRedirect } = useAuth0();
  const router = useRouter();

  useEffect(() => {
    // If user is already logged in, redirect to home page
    if (isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, router]);

  if (isLoading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (error) return <div className="flex h-screen items-center justify-center">Error: {error.message}</div>;

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[var(--lk-bg)]">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center text-2xl font-bold">Welcome to Ritt Drive-Thru</h1>
        <p className="mb-6 text-center text-gray-600">Please sign in to access the voice chat</p>
        
        <div className="flex flex-col gap-4">
          <button
            onClick={() => loginWithRedirect()}
            className="w-full rounded-md bg-blue-600 py-2 text-center text-white hover:bg-blue-700"
          >
            Login
          </button>
          <button
            onClick={() => loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })}
            className="w-full rounded-md border border-gray-300 py-2 text-center hover:bg-gray-50"
          >
            Sign Up
          </button>
        </div>
      </div>
    </div>
  );
}
