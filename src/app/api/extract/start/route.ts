import { NextRequest, NextResponse } from 'next/server';
import { Amplify } from 'aws-amplify';
import outputs from '@/../amplify_outputs.json';
import { generateClient } from 'aws-amplify/data';
import { type Schema } from '@/../amplify/data/resource';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

Amplify.configure(outputs);
const dataClient = generateClient<Schema>();
const lambdaClient = new LambdaClient({ region: outputs.auth.aws_region });

export async function POST(req: NextRequest) {
    try {
        const { text } = await req.json();
        if (!text) {
            return NextResponse.json({ ok: false, message: 'text is required' }, { status: 400 });
        }

        // 1. Create Job in DynamoDB
        const { data: job, errors } = await dataClient.models.ExtractionJob.create({
            status: 'PROCESSING',
            text: text.slice(0, 1000), // Store truncated text for reference
            errorMessage: '',
        });

        if (errors || !job) {
            console.error('Failed to create job:', errors);
            return NextResponse.json({ ok: false, message: 'Failed to create job' }, { status: 500 });
        }

        // 2. Invoke Lambda Asynchronously
        const functionName = outputs.custom?.extractGraphFunctionName;

        if (!functionName) {
            throw new Error('Lambda function name not found in amplify_outputs.json');
        }

        const payload = {
            jobId: job.id,
            text: text,
        };

        await lambdaClient.send(new InvokeCommand({
            FunctionName: functionName,
            InvocationType: 'Event', // Asynchronous invocation
            Payload: new TextEncoder().encode(JSON.stringify(payload)),
        }));

        return NextResponse.json({ ok: true, jobId: job.id });
    } catch (error) {
        console.error('Error starting job:', error);
        return NextResponse.json({ ok: false, message: String(error) }, { status: 500 });
    }
}
