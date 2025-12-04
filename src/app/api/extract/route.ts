import { NextRequest, NextResponse } from 'next/server';
import outputs from '@/../amplify_outputs.json';

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || !text.trim()) {
      return NextResponse.json(
        { ok: false, message: 'text is required' },
        { status: 400 }
      );
    }

    const url = outputs.custom?.extractGraphUrl;
    if (!url) {
      return NextResponse.json(
        { ok: false, message: 'EXTRACT_URL is not found in amplify_outputs.json' },
        { status: 500 }
      );
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    const bodyText = await response.text();
    console.log('[API] Lambda Response Status:', response.status);
    console.log('[API] Lambda Response Body:', bodyText.substring(0, 200));

    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch (e) {
      console.error('[API] Failed to parse JSON:', e);
      return NextResponse.json(
        {
          ok: false,
          message: 'Invalid response from Lambda',
          status: response.status,
          rawBody: bodyText.substring(0, 500)
        },
        { status: 502 } // Bad Gateway
      );
    }

    return NextResponse.json(payload, { status: response.status });
  } catch (err) {
    console.error('API extract error:', err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
