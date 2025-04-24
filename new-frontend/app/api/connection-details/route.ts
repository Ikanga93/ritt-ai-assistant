import { AccessToken, AccessTokenOptions, VideoGrant } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { cookies } from 'next/headers';

// NOTE: you are expected to define the following environment variables in `.env.local`:
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

// don't cache the results
export const revalidate = 0;

export type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

export async function GET() {
  try {
    if (LIVEKIT_URL === undefined) {
      throw new Error("LIVEKIT_URL is not defined");
    }
    if (API_KEY === undefined) {
      throw new Error("LIVEKIT_API_KEY is not defined");
    }
    if (API_SECRET === undefined) {
      throw new Error("LIVEKIT_API_SECRET is not defined");
    }

    // Get Auth0 user data from cookies if available
    const cookieStore = cookies();
    let auth0User = null;
    
    console.log('Checking for Auth0 user data in cookies...');
    
    // Log all available cookies for debugging
    const allCookies = cookieStore.getAll();
    console.log('Available cookies:', allCookies.map((c: { name: string }) => c.name));
    
    // Try to get user from auth0.session cookie first (our custom implementation)
    const sessionCookie = cookieStore.get('auth0.session');
    if (sessionCookie) {
      console.log('Found auth0.session cookie');
      try {
        const session = JSON.parse(decodeURIComponent(sessionCookie.value));
        auth0User = session.user;
        console.log('Extracted user from auth0.session:', {
          sub: auth0User?.sub,
          email: auth0User?.email,
          name: auth0User?.name,
          hasData: !!auth0User
        });
      } catch (error) {
        console.error('Error parsing auth0.session cookie:', error);
      }
    } else {
      console.log('No auth0.session cookie found');
    }
    
    // Fallback to auth0.user cookie (used by the Auth0 SDK)
    if (!auth0User) {
      const userCookie = cookieStore.get('auth0.user');
      if (userCookie) {
        console.log('Found auth0.user cookie');
        try {
          auth0User = JSON.parse(decodeURIComponent(userCookie.value));
          console.log('Extracted user from auth0.user:', {
            sub: auth0User?.sub,
            email: auth0User?.email,
            name: auth0User?.name,
            hasData: !!auth0User
          });
        } catch (error) {
          console.error('Error parsing auth0.user cookie:', error);
        }
      } else {
        console.log('No auth0.user cookie found');
      }
    }

    // Generate participant token
    const participantIdentity = `voice_assistant_user_${Math.floor(Math.random() * 10_000)}`;
    const roomName = `voice_assistant_room_${Math.floor(Math.random() * 10_000)}`;
    
    // Include Auth0 user data in the participant token metadata
    const participantToken = await createParticipantToken(
      { 
        identity: participantIdentity,
        // Include Auth0 user data in metadata if available
        metadata: auth0User ? JSON.stringify(auth0User) : undefined 
      },
      roomName
    );
    
    console.log('Created participant token with metadata:', {
      identity: participantIdentity,
      hasAuth0Data: !!auth0User,
      auth0Sub: auth0User?.sub
    });

    // Return connection details
    const data: ConnectionDetails = {
      serverUrl: LIVEKIT_URL,
      roomName,
      participantToken: participantToken,
      participantName: participantIdentity,
    };
    const headers = new Headers({
      "Cache-Control": "no-store",
    });
    return NextResponse.json(data, { headers });
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return new NextResponse(error.message, { status: 500 });
    }
  }
}

function createParticipantToken(userInfo: AccessTokenOptions, roomName: string) {
  const at = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: "15m",
  });
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);
  return at.toJwt();
}
