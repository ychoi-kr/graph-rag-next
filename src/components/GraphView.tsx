// components/GraphView.tsx
'use client';

import dynamic from 'next/dynamic';
import { useMemo, useRef, useState, useEffect } from 'react';

const ForceGraph2D = dynamic(
  () => import('react-force-graph-2d'),
  { ssr: false }
);

type GraphViewProps = {
  result: any | null;
};

export function GraphView({ result }: GraphViewProps) {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ width: 800, height: 480 });

  // 컨테이너 크기 측정
  useEffect(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDims({ width: rect.width, height: rect.height });

    // 리사이즈 대응 (선택 사항)
    const onResize = () => {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      setDims({ width: r.width, height: r.height });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const data = useMemo(() => {
    if (!result || !result.ok) return { nodes: [], links: [] };

    let g: any = result.graph ?? result;

    if (
      (!g || Object.keys(g).length === 0) ||
      (
        !g.nodes?.length &&
        !g['노드']?.length &&
        !g.edges?.length &&
        !g['간선']?.length
      )
    ) {
      if (typeof result.raw === 'string') {
        try {
          const parsed = JSON.parse(result.raw);
          g = parsed.graph ?? parsed;
        } catch (e) {
          console.warn('failed to parse raw graph json', e);
        }
      }
    }

    const rawNodes: any[] =
      g.nodes || g['nodes'] || g['노드'] || g['node'] || [];
    const rawEdges: any[] =
      g.edges || g['edges'] || g['간선'] || g['edge'] || [];

    const nodes = rawNodes.map((n, idx) => {
      const id =
        n.id ??
        n.name ??
        n['이름'] ??
        `n${idx}`;

      const label =
        n.label ??
        n.name ??
        n['이름'] ??
        String(id);

      const description =
        n.description ??
        n['설명'] ??
        '';

      return { id, label, description };
    });

    const links = rawEdges
      .map((e) => {
        const source =
          e.src ??
          e.source ??
          e['출발'] ??
          e['출발점'] ??
          e.from;

        const target =
          e.dst ??
          e.target ??
          e['도착'] ??
          e['도착점'] ??
          e.to;

        if (!source || !target) return null;

        const label =
          e?.attrs?.relation_type ??
          e['설명'] ??
          e['관계'] ??
          e.label ??
          '';

        return { source, target, label };
      })
      .filter(Boolean) as any[];

    return { nodes, links };
  }, [result]);

  // 데이터가 바뀌면 다시 fit
  useEffect(() => {
    if (!fgRef.current) return;
    if (!data.nodes.length) return;

    // 살짝 딜레이를 줘야 위치 계산이 끝난 후에 적용되는 경우가 많음
    const id = setTimeout(() => {
      try {
        fgRef.current.zoomToFit(400, 40);
      } catch (e) {
        console.warn('zoomToFit failed', e);
      }
    }, 300);

    return () => clearTimeout(id);
  }, [data]);

  if (!result || !result.ok) {
    return null;
  }

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold mb-2">그래프 시각화</h2>
      <div
        ref={containerRef}
        className="h-[480px] rounded border border-gray-200 bg-white"
      >
        <ForceGraph2D
          ref={fgRef}
          width={dims.width}
          height={dims.height}
          graphData={data}
          nodeLabel={(node: any) =>
            node.description
              ? `${node.label}\n${node.description}`
              : node.label
          }
          nodeCanvasObject={(node: any, ctx, globalScale) => {
            const label = node.label;
            const fontSize = 12 / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            const textWidth = ctx.measureText(label).width;
            const bckgDimensions = [textWidth + 8, fontSize + 6];

            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(
              node.x - bckgDimensions[0] / 2,
              node.y - bckgDimensions[1] / 2,
              bckgDimensions[0],
              bckgDimensions[1]
            );

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'white';
            ctx.fillText(label, node.x, node.y);
          }}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          linkCurvature={0.1}
          linkColor={() => 'rgba(0,0,0,0.3)'}
          linkLabel={(link: any) => link.label as string}
        />
      </div>
    </div>
  );
}
