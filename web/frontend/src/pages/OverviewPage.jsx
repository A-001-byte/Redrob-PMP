import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import Hero from '../components/overview/Hero.jsx';
import TopTenPreview from '../components/overview/TopTenPreview.jsx';
import MetricsBar from '../components/MetricsBar.jsx';
import FunnelChart from '../components/FunnelChart.jsx';
import FairnessPanel from '../components/FairnessPanel.jsx';
import Reveal from '../components/motion/Reveal.jsx';
import { pageEnter } from '../components/motion/presets.js';
import { useData } from '../context/DataContext.jsx';
import { useDrawer } from '../hooks/useDrawer.js';

function SectionHeading({ title, sub }) {
  return (
    <div className="mb-4">
      <h2 className="font-heading text-xl font-semibold text-foreground">{title}</h2>
      {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
    </div>
  );
}

export default function OverviewPage() {
  const { results, metrics } = useData();
  const { openDrawer } = useDrawer();
  const { hash } = useLocation();

  // Support /#funnel style links from other routes.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <motion.div {...pageEnter}>
      <Hero metrics={metrics} />

      <main className="mx-auto max-w-7xl space-y-16 px-4 py-14">
        <section id="metrics" className="scroll-mt-24">
          <Reveal>
            <SectionHeading
              title="Submission quality"
              sub="Zero-tolerance safety gates and score quality of the submitted top 100."
            />
            <MetricsBar metrics={metrics} />
          </Reveal>
        </section>

        <section id="funnel" className="scroll-mt-24">
          <Reveal>
            <SectionHeading
              title="The six-layer funnel"
              sub="Each layer trades breadth for precision — 100,000 profiles in, 100 out, in seconds."
            />
            <FunnelChart funnel={metrics?.funnel} />
            <div className="mt-4">
              <FairnessPanel />
            </div>
          </Reveal>
        </section>

        <section id="top" className="scroll-mt-24">
          <Reveal>
            <TopTenPreview candidates={results.candidates} onSelect={openDrawer} />
          </Reveal>
        </section>
      </main>
    </motion.div>
  );
}
