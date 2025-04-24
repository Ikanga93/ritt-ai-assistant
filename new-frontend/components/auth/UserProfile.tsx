'use client';
import { useAuth } from '../../hooks/useAuth';

export default function UserProfile() {
  const { user, isLoading, login, logout } = useAuth();
  
  if (isLoading) return <div className="text-white text-sm p-2 bg-gray-800 rounded-md">Loading profile...</div>;
  
  if (!user) {
    // This should not happen with our middleware, but just in case
    return (
      <button 
        onClick={() => login()}
        className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
      >
        Sign In
      </button>
    );
  }
  
  return (
    <div className="flex items-center space-x-3 bg-gray-800 bg-opacity-70 p-2 rounded-lg shadow-md">
      {user.picture ? (
        <img 
          src={user.picture} 
          alt={user.name || 'User'} 
          className="w-10 h-10 rounded-full border-2 border-white"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
          {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
        </div>
      )}
      <div className="flex flex-col">
        <span className="text-white font-medium">{user.name || user.email || 'User'}</span>
        <button 
          onClick={() => logout()}
          className="text-gray-300 text-xs hover:text-white transition-colors text-left"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
