'use client';

import { useState } from 'react';
import { GraphView } from '../components/GraphView';

export default function Home() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runExtract = async () => {
    if (!text.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();
      setResult(data);
    } catch (e) {
      console.error(e);
      setResult({ ok: false, error: String(e) });
    } finally {
      setLoading(false);
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
