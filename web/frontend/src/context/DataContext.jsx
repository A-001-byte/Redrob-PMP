import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getHealth, getMetrics, getResults, rerankStream } from '../utils/api.js';

const IDLE_RERANK = { status: 'idle', message: '', progress: 0, elapsed: null };

const DataContext = createContext(null);

/** Single fetch + SSE owner mounted above the router: pages never re-fetch
 *  on navigation, and a re-rank started on one route keeps streaming while
 *  the user browses others (StatusBanner lives in the layout). */
export function DataProvider({ children }) {
  const [results, setResults] = useState({ candidates: [], generated_at: null });
  const [metrics, setMetrics] = useState(null);
  const [health, setHealth] = useState(null);
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
    return () => {
      clearInterval(t);
      clearTimeout(fadeTimer.current);
    };
  }, [refresh]);

  const startRerank = useCallback(async () => {
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
    <DataContext.Provider
      value={{ results, metrics, health, rerank, loadError, startRerank }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
