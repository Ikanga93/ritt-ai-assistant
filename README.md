# Ritt AI Voice Assistant

A multi-restaurant drive-thru voice assistant powered by OpenAI's Realtime API and LiveKit.

## Project Structure

This repository contains both the frontend and backend components of the Ritt AI Voice Assistant:

- **Frontend**: Next.js application for the user interface (in the `new-frontend` directory)
- **Backend**: Node.js application using LiveKit Agents and OpenAI's Realtime API (in the `backend` directory)

## Features

- Voice-based ordering system for multiple restaurants
- Real-time voice interactions using OpenAI's Realtime API
- Email notifications for order confirmations
- Multi-restaurant menu system

## Setup Instructions

### Prerequisites

- Node.js 16+
- pnpm package manager

### Backend Setup

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Install dependencies:
   ```
   pnpm install
   ```

3. Create a `.env.local` file with the following variables:
   ```
   LIVEKIT_URL=
   LIVEKIT_API_KEY=
   LIVEKIT_API_SECRET=
   OPENAI_API_KEY=
   SENDGRID_API_KEY=
   ```

4. Build and start the backend:
   ```
   pnpm build
   node dist/agent.js dev
   
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```
   cd new-frontend
   ```

2. Install dependencies:
   ```
   pnpm install
   pnpm dev
   ```

3. Start the development server:
   ```
   pnpm dev
   ```

## Combined Development

You can run both the frontend and backend together using the root package.json scripts:

```
pnpm install -g concurrently  # Install concurrently globally if not already installed
pnpm install                  # Install root dependencies
pnpm run install-deps         # Install dependencies for both frontend and backend
pnpm run dev                  # Start both frontend and backend in development mode
```

## Deployment

This application is designed to be deployed on Render as a Web Service.

### Deployment on Render

1. Push your code to GitHub
2. Connect your GitHub repository to Render
3. Create a new Web Service with the following configuration:
   - **Build Command**: `cd new-frontend && pnpm install && pnpm build && cd ../backend && pnpm install && pnpm build`
   - **Start Command**: `cd backend && node dist/agent.js`
   - **Instance Type**: Standard ($25/month) recommended for voice processing

4. Add the following environment variables:
   - `LIVEKIT_URL`
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
   - `OPENAI_API_KEY`
   - `SENDGRID_API_KEY`
   - `FROM_EMAIL`
   - `DEFAULT_RESTAURANT_EMAIL`

Alternatively, you can use the `render.yaml` file in this repository for automatic deployment configuration.

## License

This project is licensed under the terms of the Apache 2.0 license.
