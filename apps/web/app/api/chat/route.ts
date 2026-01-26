// Chat API Route - Streaming proxy to NestJS backend
// v1.3 - Fixed: Forward history parameter for conversation context

import { NextRequest } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
  console.log('[Chat Route] POST /api/chat called');
  console.log('[Chat Route] Backend API_URL:', API_URL);

  try {
    const body = await request.json();
    const { message, restaurant_id, session_id, history } = body;
    const authHeader = request.headers.get('Authorization');

    console.log('[Chat Route] Request body:', { message, restaurant_id, session_id, historyLength: history?.length || 0 });

    // Build headers with auth
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    // Create streaming response from backend
    console.log('[Chat Route] Calling backend:', `${API_URL}/api/chat/message`);
    const response = await fetch(`${API_URL}/api/chat/message`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message,
        restaurant_id: restaurant_id || 'demo-restaurant-id',
        session_id,
        history,
      }),
    });

    console.log('[Chat Route] Backend response status:', response.status);
    console.log('[Chat Route] Backend response ok:', response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Chat Route] Backend error response:', errorText);
      return new Response(
        JSON.stringify({ error: 'Chat request failed', details: errorText }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Chat Route] Forwarding SSE stream to client');
    // Forward the SSE stream
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[Chat Route] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process chat request', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
