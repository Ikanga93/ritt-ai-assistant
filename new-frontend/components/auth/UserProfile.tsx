'use client';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';

export default function UserProfile() {
  const { user, isLoading, login, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (isLoading) return <div className="text-white text-sm p-2 bg-gray-800 rounded-md">Loading profile...</div>;
  
  if (!user) {
    // Return null when no user is present
    return null;
  }
  
  // Get initials (first letter of name or email)
  const initials = user.name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'U';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold border-2 border-white shadow hover:ring-2 hover:ring-blue-400 focus:outline-none"
        aria-label="Open user menu"
        tabIndex={0}
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg py-2 z-50 min-w-[180px]">
          <div className="px-4 py-2 text-gray-800 text-sm border-b">
            <div className="font-semibold truncate">{user.email}</div>
          </div>
          <button
            onClick={() => { setOpen(false); logout(); }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 hover:text-red-700 transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
