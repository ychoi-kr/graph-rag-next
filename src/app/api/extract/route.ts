import { NextRequest, NextResponse } from 'next/server';
import {
  LambdaClient,
  InvokeCommand,
} from '@aws-sdk/client-lambda';

const client = new LambdaClient({
  region: 'ap-northeast-2',
  // ✅ 로컬에서는 Cognito 로그인 세션이 아니라
  // AWS CLI 자격증명(~/.aws/credentials)을 그대로 씀
  credentials: undefined,
});

// ⚠️ Lambda 실제 이름 (콘솔에서 확인한 정확한 이름)
const FUNCTION_NAME =
  'amplify-graphragnext-yong-extractgraphlambda885A32-qTtsXCLSlmmr';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text } = body;

    if (!text) {
      return NextResponse.json(
        { ok: false, message: 'text is required' },
        { status: 400 }
      );
    }

    const command = new InvokeCommand({
      FunctionName: FUNCTION_NAME,
      Payload: Buffer.from(JSON.stringify({ text })),
    });

    const response = await client.send(command);

    const payload = response.Payload
      ? JSON.parse(Buffer.from(response.Payload).toString())
      : null;

    return NextResponse.json(payload);
  } catch (err) {
    console.error('API extract error:', err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
