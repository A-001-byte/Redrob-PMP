import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import RankingTable from '../components/RankingTable.jsx';
import UploadPanel from '../components/UploadPanel.jsx';
import WhatIfPanel from '../components/candidates/WhatIfPanel.jsx';
import CompareTray from '../components/candidates/CompareTray.jsx';
import { pageEnter } from '../components/motion/presets.js';
import { useData } from '../context/DataContext.jsx';
import { useDrawer } from '../hooks/useDrawer.js';
import { DEFAULT_WEIGHTS, applyWeights, isAdjusted } from '../utils/whatif.js';

const MAX_COMPARE = 3;

export default function CandidatesPage() {
  const { results } = useData();
  const { openDrawer } = useDrawer();
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS });
  const [selected, setSelected] = useState(() => new Set());

  const whatifActive = isAdjusted(weights);
  const candidates = useMemo(
    () => (whatifActive ? applyWeights(results.candidates, weights) : results.candidates),
    [results.candidates, weights, whatifActive]
  );

  const toggleSelect = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_COMPARE) next.add(id);
      return next;
    });

  return (
    <motion.main {...pageEnter} className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">Candidates</h1>
        <p className="mt-1 text-sm text-muted font-body">
          The submitted top 100 — search, filter, tag a shortlist, tick boxes to compare,
          or re-weight the score live.
        </p>
      </div>
      <WhatIfPanel weights={weights} onChange={setWeights} active={whatifActive} />
      <RankingTable
        candidates={candidates}
        onSelect={openDrawer}
        selected={selected}
        onToggleSelect={toggleSelect}
      />
      <UploadPanel onSelect={openDrawer} />
      <CompareTray ids={[...selected]} onClear={() => setSelected(new Set())} />
    </motion.main>
  );
}
