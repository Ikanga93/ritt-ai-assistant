// Script to start the backend with unlimited log output
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import './show-all-logs.js';

// Set environment variables to maximize log output
process.env.NODE_DEBUG = '*';
process.env.DEBUG = '*';
process.env.NODE_OPTIONS = '--max-old-space-size=4096 --trace-warnings';

console.log('Starting backend server with unlimited log output...');

// Start the server process
const serverProcess = spawn('node', ['dist/agent.js', 'dev'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_DEBUG: '*',
    DEBUG: '*',
    NODE_OPTIONS: '--max-old-space-size=4096 --trace-warnings',
    CONSOLE_MAX_DEPTH: 'Infinity',
    CONSOLE_MAX_ARRAY_LENGTH: 'Infinity'
  }
});

// Handle process events
serverProcess.on('error', (error) => {
  console.error('Failed to start server process:', error);
});

serverProcess.on('exit', (code, signal) => {
  if (code !== 0) {
    console.error(`Server process exited with code ${code} and signal ${signal}`);
  } else {
    console.log('Server process exited successfully');
  }
});

// Handle termination signals
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down server...');
  serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down server...');
  serverProcess.kill('SIGTERM');
});
