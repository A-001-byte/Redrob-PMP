import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Ban,
  Calculator,
  Layers,
  Lock,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import Reveal from '../components/motion/Reveal.jsx';
import { pageEnter } from '../components/motion/presets.js';
import { PART_COLORS } from '../utils/formatters.js';

/** Static storytelling page — content mirrors PROJECT_CONTEXT.md §3–5;
 *  numbers must match pipeline/scorer.py and honeypot.py exactly. */

const LAYERS = [
  {
    id: 'L0',
    title: 'FAISS dense retrieval',
    out: '100,000 → 5,000',
    body: 'Exact inner-product search over L2-normalized 384-d career embeddings (all-MiniLM-L6-v2) against the JD embedding. A full corpus scan takes ~10 ms.',
  },
  {
    id: 'L1',
    title: 'Hybrid RRF fusion',
    out: '5,000 → 500',
    body: 'Weighted Reciprocal Rank Fusion (70/30, k=60) of the dense ranking with BM25 over the JD’s distinctive lexical terms — rank-based, so immune to score-scale mismatch between the two channels.',
  },
  {
    id: 'L2',
    title: 'Cross-encoder re-rank',
    out: '500 → 200',
    body: 'ms-marco-MiniLM-L-6-v2 scores (JD query, career text) pairs jointly — the most accurate and the slowest layer, ~80% of total rank time.',
  },
  {
    id: 'L3',
    title: 'Interpretable composite',
    out: '200 → 150',
    body: 'A transparent weighted formula over five signal families plus calibrated adjustments — every final score decomposes into auditable parts (see the drawer waterfall).',
  },
  {
    id: 'L4',
    title: 'LambdaRank slot',
    out: '150 → 100 + bench',
    body: 'A deliberate pass-through extension point for a learned ranker — left untrained because training on rank-derived synthetic labels would be circular.',
  },
  {
    id: 'L5',
    title: 'Assessment hard gate',
    out: 'ranks 1–20',
    body: 'An "expert" claim on a JD-required skill must be backed by an assessment score ≥ 40/100; violators are demoted below rank 20.',
  },
  {
    id: 'L6',
    title: 'Zero-tolerance safety',
    out: 'final 100',
    body: 'Any honeypot or disqualified profile that survives to the final 100 is physically replaced from the clean bench (ranks 101–150).',
  },
];

const WEIGHTS = [
  { key: 'career', label: 'Career quality', w: 0.3 },
  { key: 'semantic', label: 'Semantic fit', w: 0.25 },
  { key: 'skill', label: 'Skill match', w: 0.2 },
  { key: 'assessment', label: 'Assessments', w: 0.15 },
  { key: 'experience', label: 'Experience fit', w: 0.1 },
];

const HONEYPOT_CHECKS = [
  {
    title: 'Skill-duration fraud',
    body: '"Expert" proficiency claimed with under 3 months of usage.',
  },
  {
    title: 'Experience inflation',
    body: 'Summed career months under 35% of the stated years of experience.',
  },
  {
    title: 'Assessment contradiction',
    body: 'An "expert" claim scoring below 25/100 on its own platform assessment.',
  },
  {
    title: 'Impossible timeline',
    body: 'Two full-time roles overlapping by more than 6 months.',
  },
];

const DQ_CHECKS = [
  { title: 'Pure IT-services history', body: 'Every role at an IT-services firm — penalized for this product-engineering JD.' },
  { title: 'Title-chaser pattern', body: '≥ 60% of roles under 18 months with title escalation across consecutive short stints.' },
  { title: 'Wrong specialization', body: 'Pure CV/Speech/Robotics profile with zero NLP or retrieval signal.' },
];

function SectionHeading({ icon: Icon, title, sub }) {
  return (
    <div className="mb-5">
      <h2 className="flex items-center gap-2 font-heading text-xl font-semibold text-foreground">
        <Icon className="h-5 w-5 text-secondary" aria-hidden="true" />
        {title}
      </h2>
      {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
    </div>
  );
}

export default function MethodologyPage() {
  return (
    <motion.main {...pageEnter} className="mx-auto max-w-5xl space-y-16 px-4 py-10">
      <div className="text-center">
        <h1 className="font-heading text-3xl font-bold text-foreground">How the ranker works</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
          Six layers trade breadth for precision: fast approximate methods sweep 100,000
          profiles, expensive accurate methods judge the survivors, and hard safety gates
          guard the final list. CPU-only, fully offline, byte-for-byte deterministic.
        </p>
      </div>

      <section>
        <Reveal>
          <SectionHeading
            icon={Layers}
            title="The six-layer funnel"
            sub="Each layer only pays its cost on what the previous layer let through."
          />
        </Reveal>
        <ol className="relative space-y-4 border-l border-border pl-6">
          {LAYERS.map((l, i) => (
            <Reveal key={l.id} delay={i * 0.04}>
              <li className="relative">
                <span
                  className="absolute -left-[31px] top-1 flex h-2.5 w-2.5 rounded-full
                             bg-secondary shadow-glow-sm"
                  aria-hidden="true"
                />
                <div className="glass hover-lift rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-heading text-xs font-bold text-secondary">{l.id}</span>
                    <h3 className="font-heading text-sm font-semibold text-foreground">
                      {l.title}
                    </h3>
                    <span className="ml-auto font-heading text-xs text-slate-500">{l.out}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{l.body}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      <section>
        <Reveal>
          <SectionHeading
            icon={Calculator}
            title="The composite score"
            sub="base = Σ weighted parts ± adjustments, clamped to [0, 1] — then scaled by attainability."
          />
        </Reveal>
        <Reveal>
          <div className="rounded-lg border border-border bg-surface p-5">
            <div className="space-y-2.5">
              {WEIGHTS.map(({ key, label, w }) => (
                <div key={key} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 text-slate-400">{label}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted">
                    <motion.div
                      className="h-full rounded-sm"
                      style={{ backgroundColor: PART_COLORS[key] }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${(w / 0.3) * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right font-heading text-slate-300">
                    {w.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-2 border-t border-border pt-4 text-xs text-slate-400 sm:grid-cols-2">
              <div>Trajectory adjustment: <span className="font-heading text-slate-300">−0.05 / 0 / +0.05</span></div>
              <div>Summary↔career consistency: <span className="font-heading text-slate-300">±0.03</span></div>
              <div>Anti-fit anchor penalty: <span className="font-heading text-slate-300">−0.05 / −0.10</span></div>
              <div>Availability multiplier: <span className="font-heading text-slate-300">× 0.10 – 1.25</span></div>
              <div>Disqualified: <span className="font-heading text-red-400">× 0.05</span></div>
              <div>Honeypot: <span className="font-heading text-red-400">× 0.0 — eliminated</span></div>
            </div>
          </div>
        </Reveal>
      </section>

      <section>
        <Reveal>
          <SectionHeading
            icon={ShieldCheck}
            title="Fraud detection"
            sub="The dataset plants fraudulent profiles; ranking one in the top 100 is heavily penalized. Missing fields are treated as no signal — they never raise a flag."
          />
        </Reveal>
        <div className="grid gap-3 sm:grid-cols-2">
          {HONEYPOT_CHECKS.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.04}>
              <div className="glass rounded-xl border border-border p-4">
                <h3 className="flex items-center gap-2 font-heading text-sm font-semibold text-red-400">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  {c.title}
                </h3>
                <p className="mt-1.5 text-sm text-slate-400">{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {DQ_CHECKS.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.04}>
              <div className="glass rounded-xl border border-border p-4">
                <h3 className="flex items-center gap-2 font-heading text-sm font-semibold text-amber-400">
                  <Ban className="h-4 w-4" aria-hidden="true" />
                  {c.title}
                </h3>
                <p className="mt-1.5 text-sm text-slate-400">{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section>
        <Reveal>
          <SectionHeading
            icon={Lock}
            title="Guarantees"
            sub="Constraints the pipeline is verified against on every run."
          />
        </Reveal>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: Timer,
              title: '~11 s, CPU-only',
              body: 'Well inside the 300 s budget — measured 11.2 s clean, ~87 s under heavy machine load.',
            },
            {
              icon: Lock,
              title: 'Fully offline',
              body: 'HF_HUB_OFFLINE enforced before any model import; zero network calls at rank time.',
            },
            {
              icon: ShieldCheck,
              title: 'Deterministic',
              body: 'No unseeded randomness anywhere — two fresh runs produce byte-identical CSVs.',
            },
          ].map((g, i) => (
            <Reveal key={g.title} delay={i * 0.04}>
              <div className="glass hover-lift rounded-xl border border-border p-4 text-center">
                <g.icon className="mx-auto mb-2 h-5 w-5 text-secondary" aria-hidden="true" />
                <h3 className="font-heading text-sm font-semibold text-foreground">{g.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{g.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </motion.main>
  );
}
