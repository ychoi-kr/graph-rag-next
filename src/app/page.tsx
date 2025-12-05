'use client';

import { useState } from 'react';
import { GraphView } from '../components/GraphView';

import outputs from '@/../amplify_outputs.json';

import { generateClient } from 'aws-amplify/data';
import { type Schema } from '@/../amplify/data/resource';

const client = generateClient<Schema>();

export default function Home() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runExtract = async () => {
    if (!text.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      // 1. Create Job directly in DynamoDB via AppSync
      const { data: job, errors } = await client.models.ExtractionJob.create({
        status: 'PROCESSING',
        text: text.slice(0, 30000), // Store up to ~30k chars (safe for DynamoDB 400KB limit)
        errorMessage: '',
      }, {
        authMode: 'userPool', // Explicitly use User Pool for authenticated users
      });

      if (errors || !job) {
        throw new Error('Failed to create job: ' + JSON.stringify(errors));
      }

      const jobId = job.id;
      console.log('Job started:', jobId);

      // 2. Poll for Status via AppSync
      const pollInterval = setInterval(async () => {
        try {
          const { data: jobData } = await client.models.ExtractionJob.get({ id: jobId }, { authMode: 'userPool' });

          if (!jobData) {
            console.warn('Job not found');
            return;
          }

          console.log('Job status:', jobData.status);

          if (jobData.status === 'COMPLETED') {
            clearInterval(pollInterval);
            setLoading(false);

            let finalResult = jobData.result;
            // Parse until it's an object (handles double-encoding)
            try {
              while (typeof finalResult === 'string') {
                finalResult = JSON.parse(finalResult);
              }
            } catch (e) {
              console.error('Failed to parse result JSON', e);
            }
            setResult(finalResult);
          } else if (jobData.status === 'FAILED') {
            clearInterval(pollInterval);
            setLoading(false);
            setResult({ ok: false, error: jobData.errorMessage });
          }
          // If PROCESSING, continue polling
        } catch (e) {
          console.error('Polling error:', e);
        }
      }, 3000); // Poll every 3 seconds

    } catch (e) {
      console.error(e);
      setLoading(false);
      setResult({ ok: false, error: String(e) });
    }
  };

  return (
    <main className="p-8 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">
        📚 Graph RAG Demo (Next + Lambda + Bedrock)
      </h1>

      <textarea
        className="w-full h-40 p-3 border rounded"
        placeholder="소설 텍스트를 입력하세요..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <button
        onClick={runExtract}
        disabled={loading}
        className="px-4 py-2 rounded bg-black text-white disabled:opacity-60"
      >
        {loading ? '추출 중...' : '🔎 그래프 추출'}
      </button>

      {/* JSON 원본 (디버깅용) */}
      {result && (
        <pre className="mt-6 p-4 bg-gray-100 text-xs overflow-auto rounded max-h-80">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      {/* 그래프 시각화 */}
      <GraphView result={result} />
    </main>
  );
}
