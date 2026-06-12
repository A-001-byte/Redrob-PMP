import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronDown, ShieldCheck, Users, Zap } from 'lucide-react';
import AnimatedCounter from './AnimatedCounter.jsx';
import { fadeUp, stagger } from '../motion/presets.js';

function Stat({ icon: Icon, value, label, decimals = 0, suffix = '', tone = 'text-foreground' }) {
  return (
    <motion.div
      variants={fadeUp}
      className="glass hover-lift rounded-xl border border-border px-6 py-5 text-center"
    >
      <Icon className="mx-auto mb-2 h-5 w-5 text-secondary" aria-hidden="true" />
      <div className={`font-heading text-3xl font-bold ${tone}`}>
        <AnimatedCounter value={value} decimals={decimals} suffix={suffix} />
      </div>
      <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">{label}</div>
    </motion.div>
  );
}

export default function Hero({ metrics }) {
  const corpus = metrics?.funnel?.corpus ?? 100000;
  const finalCount = metrics?.total_count || 100;
  const rankSeconds = metrics?.last_run_time_seconds ?? 11.2;
  const honeypots = metrics?.honeypot_count ?? 0;

  return (
    <section
      className="relative overflow-hidden border-b border-border
                 bg-[radial-gradient(70%_60%_at_50%_0%,rgba(30,64,175,0.28),transparent_70%)]"
    >
      <motion.div
        initial="hidden"
        animate="show"
        variants={stagger}
        className="mx-auto max-w-7xl px-4 pb-16 pt-20 text-center sm:pt-24"
      >
        <motion.p
          variants={fadeUp}
          className="mb-3 font-heading text-xs uppercase tracking-[0.3em] text-secondary"
        >
          Redrob Hackathon · Track 01
        </motion.p>
        <motion.h1
          variants={fadeUp}
          className="mx-auto max-w-3xl font-heading text-4xl font-bold leading-tight
                     text-foreground sm:text-5xl"
        >
          <AnimatedCounter value={corpus} className="text-secondary text-glow" /> candidates.
          <br />
          One defensible top <AnimatedCounter value={finalCount} className="text-secondary text-glow" />.
        </motion.h1>
        <motion.p variants={fadeUp} className="mx-auto mt-5 max-w-2xl text-base text-slate-400">
          A six-layer ranking funnel — dense retrieval, RRF hybrid fusion, cross-encoder
          re-ranking, and an interpretable composite score — runs CPU-only, fully offline,
          and byte-for-byte deterministic.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/candidates"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-on-primary
                       transition-all duration-200 hover:bg-blue-800 hover:shadow-glow
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Explore the top {finalCount}
          </Link>
          <Link
            to="/methodology"
            className="rounded-md border border-border px-5 py-2.5 text-sm text-slate-300
                       transition-colors duration-200 hover:bg-surface-hover hover:text-foreground
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            How it works
          </Link>
        </motion.div>

        <motion.div
          variants={stagger}
          className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <Stat icon={Users} value={corpus} label="Profiles screened" />
          <Stat icon={Users} value={finalCount} label="Final ranked" />
          <Stat icon={Zap} value={rankSeconds} decimals={1} suffix="s" label="Rank time" />
          <Stat
            icon={ShieldCheck}
            value={honeypots}
            label="Honeypots in top 100"
            tone={honeypots === 0 ? 'text-emerald-400 text-glow-emerald' : 'text-red-400'}
          />
        </motion.div>

        <motion.button
          variants={fadeUp}
          type="button"
          onClick={() => document.getElementById('metrics')?.scrollIntoView({ behavior: 'smooth' })}
          aria-label="Scroll to metrics"
          className="mx-auto mt-12 block cursor-pointer text-slate-500 transition-colors
                     duration-200 hover:text-secondary focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown className="h-6 w-6 animate-breathe" aria-hidden="true" />
        </motion.button>
      </motion.div>
    </section>
  );
}
