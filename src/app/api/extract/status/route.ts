import { NextRequest, NextResponse } from 'next/server';
import { Amplify } from 'aws-amplify';
import outputs from '@/../amplify_outputs.json';
import { generateClient } from 'aws-amplify/data';
import { type Schema } from '@/../amplify/data/resource';

Amplify.configure(outputs);
const dataClient = generateClient<Schema>();

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ ok: false, message: 'id is required' }, { status: 400 });
    }

    try {
        const { data: job, errors } = await dataClient.models.ExtractionJob.get({ id });

        if (errors) {
            console.error('Failed to get job:', errors);
            return NextResponse.json({ ok: false, message: 'Failed to get job' }, { status: 500 });
        }

        if (!job) {
            return NextResponse.json({ ok: false, message: 'Job not found' }, { status: 404 });
        }

        return NextResponse.json({
            ok: true,
            status: job.status,
            result: job.result,
            errorMessage: job.errorMessage,
        });
    } catch (error) {
        console.error('Error getting job status:', error);
        return NextResponse.json({ ok: false, message: String(error) }, { status: 500 });
    }
}
