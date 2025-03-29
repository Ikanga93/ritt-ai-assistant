# Ritt AI Voice Assistant

A multi-restaurant drive-thru voice assistant powered by OpenAI's Realtime API.

## Project Structure

This repository contains both the frontend and backend components of the Ritt AI Voice Assistant:

- **Frontend**: Next.js application for the user interface
- **Backend**: Node.js application using LiveKit Agents and OpenAI's Realtime API

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
   cd frontend
   ```

2. Install dependencies:
   ```
   pnpm install
   ```

3. Start the development server:
   ```
   pnpm dev
   ```

## License

This project is licensed under the terms of the Apache 2.0 license.
