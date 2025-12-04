'use client';

import { useState } from 'react';
import { GraphView } from '../components/GraphView';

import outputs from '@/../amplify_outputs.json';

export default function Home() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runExtract = async () => {
    if (!text.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      // 1. Start Job
      const startRes = await fetch('/api/extract/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const startData = await startRes.json();
      if (!startData.ok || !startData.jobId) {
        throw new Error(startData.message || 'Failed to start job');
      }

      const jobId = startData.jobId;
      console.log('Job started:', jobId);

      // 2. Poll for Status
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/extract/status?id=${jobId}`);
          const statusData = await statusRes.json();

          if (!statusData.ok) {
            clearInterval(pollInterval);
            setLoading(false);
            setResult({ ok: false, error: statusData.message });
            return;
          }

          console.log('Job status:', statusData.status);

          if (statusData.status === 'COMPLETED') {
            clearInterval(pollInterval);
            setLoading(false);

            let finalResult = statusData.result;
            if (typeof finalResult === 'string') {
              try {
                finalResult = JSON.parse(finalResult);
              } catch (e) {
                console.error('Failed to parse result JSON', e);
              }
            }
            setResult(finalResult);
          } else if (statusData.status === 'FAILED') {
            clearInterval(pollInterval);
            setLoading(false);
            setResult({ ok: false, error: statusData.errorMessage });
          }
          // If PROCESSING, continue polling
        } catch (e) {
          console.error('Polling error:', e);
          // Don't stop polling on transient network errors, but maybe limit retries in real app
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
