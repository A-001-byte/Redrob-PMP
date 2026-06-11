import { useCallback, useEffect, useRef, useState } from 'react';
import Header from './components/Header.jsx';
import MetricsBar from './components/MetricsBar.jsx';
import RankingTable from './components/RankingTable.jsx';
import CandidateDrawer from './components/CandidateDrawer.jsx';
import UploadPanel from './components/UploadPanel.jsx';
import StatusBanner from './components/StatusBanner.jsx';
import { getHealth, getMetrics, getResults, rerankStream } from './utils/api.js';

const IDLE_RERANK = { status: 'idle', message: '', progress: 0, elapsed: null };

export default function App() {
  const [results, setResults] = useState({ candidates: [], generated_at: null });
  const [metrics, setMetrics] = useState(null);
  const [health, setHealth] = useState(null);
  const [drawerId, setDrawerId] = useState(null);
  const [rerank, setRerank] = useState(IDLE_RERANK);
  const [loadError, setLoadError] = useState(null);
  const fadeTimer = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [r, m] = await Promise.all([getResults(), getMetrics()]);
      setResults(r);
      setMetrics(m);
      setLoadError(null);
    } catch (err) {
      setLoadError(String(err.message || err));
    }
  }, []);

  useEffect(() => {
    refresh();
    const poll = async () => {
      try {
        setHealth(await getHealth());
      } catch {
        setHealth({ status: 'down' });
      }
    };
    poll();
    const t = setInterval(poll, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  const handleRerank = useCallback(async () => {
    if (rerank.status === 'running') return;
    clearTimeout(fadeTimer.current);
    setRerank({ status: 'running', message: 'Starting ranking run...', progress: 0, elapsed: null });
    try {
      await rerankStream(({ event, data }) => {
        if (event === 'stage') {
          setRerank((s) => ({ ...s, message: data.message, progress: data.progress }));
        } else if (event === 'progress') {
          setRerank((s) => ({ ...s, progress: Math.max(s.progress, data.progress) }));
        } else if (event === 'error') {
          setRerank({ status: 'error', message: data.message, progress: 0, elapsed: data.elapsed });
        } else if (event === 'complete') {
          setResults({
            candidates: data.candidates,
            generated_at: data.generated_at,
            total_count: data.total_count,
          });
          setRerank({ status: 'success', message: `Ranked in ${data.elapsed}s`, progress: 100, elapsed: data.elapsed });
          getMetrics().then(setMetrics).catch(() => {});
          fadeTimer.current = setTimeout(() => setRerank(IDLE_RERANK), 3500);
        }
      });
    } catch (err) {
      setRerank({ status: 'error', message: String(err.message || err), progress: 0, elapsed: null });
      fadeTimer.current = setTimeout(() => setRerank(IDLE_RERANK), 6000);
    }
  }, [rerank.status]);

  return (
    <div className="min-h-screen">
      <Header
        generatedAt={results.generated_at}
        health={health}
        reranking={rerank.status === 'running'}
        onRerank={handleRerank}
      />
      <StatusBanner rerank={rerank} />
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-4">
        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-red-50 px-4 py-2 text-sm text-destructive">
            Backend unreachable: {loadError} — start it with{' '}
            <code className="font-heading text-xs">uvicorn web.backend.main:app --port 8000</code>
          </div>
        )}
        <MetricsBar metrics={metrics} />
        <RankingTable candidates={results.candidates} onSelect={setDrawerId} />
        <UploadPanel onSelect={setDrawerId} />
      </main>
      <CandidateDrawer candidateId={drawerId} onClose={() => setDrawerId(null)} />
    </div>
  );
}
