// Database initialization module
import { initializeDatabase } from './database.js';

// Initialize database connection
(async () => {
  try {
    console.log('Initializing database connection...');
    await initializeDatabase();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }
})();

// Export a dummy function to ensure this file is imported
export function ensureDatabaseInitialized() {
  return true;
}
