#!/bin/bash

# Development script to start both frontend and backend
echo "Starting Ritt Drive-Thru in development mode..."

# Start the backend in dev mode
echo "Starting backend..."
cd backend
NODE_ENV=development node dist/agent.js dev &
BACKEND_PID=$!
echo "Backend started with PID: $BACKEND_PID"

# Wait for backend to initialize
sleep 2

# Start the frontend in dev mode
echo "Starting frontend..."
cd ../new-frontend
pnpm dev &
FRONTEND_PID=$!
echo "Frontend started with PID: $FRONTEND_PID"

# Function to handle script termination
function cleanup {
  echo "Stopping services..."
  kill $BACKEND_PID
  kill $FRONTEND_PID
  echo "All services stopped"
  exit
}

# Trap Ctrl+C and call cleanup
trap cleanup INT

# Keep script running
echo "Development environment is running. Press Ctrl+C to stop all services."
wait
