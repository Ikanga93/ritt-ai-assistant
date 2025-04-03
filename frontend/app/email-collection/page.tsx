"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function EmailCollectionPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!email) {
      setError("Email is required");
      return;
    }
    
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Store email in localStorage
      localStorage.setItem("userEmail", email);
      
      // Redirect to the voice chat
      router.push("/");
    } catch (err) {
      setError("An error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };
  
  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[var(--lk-bg)]">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center text-2xl font-bold">Welcome to Ritt Drive-Thru</h1>
        <p className="mb-6 text-center text-gray-600">
          Please enter your email to access the voice chat
        </p>
        
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-red-700">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none"
              placeholder="your@email.com"
            />
          </div>
          
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full rounded-md bg-blue-600 py-2 text-center text-white ${
              isSubmitting ? "opacity-70" : "hover:bg-blue-700"
            }`}
          >
            {isSubmitting ? "Submitting..." : "Continue to Voice Chat"}
          </button>
        </form>
      </div>
    </div>
  );
}
