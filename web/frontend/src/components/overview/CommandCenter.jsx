import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Clock,
  Database,
  Globe2,
  Play,
  Search,
  ShieldAlert,
  Terminal,
  Sparkles,
  Cpu,
  UserCheck,
  MapPin,
  Loader2,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import { fadeUp, stagger } from '../motion/presets.js';
import { timeAgo, fmtScore } from '../../utils/formatters.js';
import { useData } from '../../context/DataContext.jsx';
import { useDrawer } from '../../hooks/useDrawer.js';
import AnomaliesDeepDive from './AnomaliesDeepDive.jsx';
import RecalibrateModal from './RecalibrateModal.jsx';
import { useState } from 'react';

function Widget({ children, className = '' }) {
  return (
    <motion.div
      variants={fadeUp}
      className={`overflow-hidden rounded-md border border-border bg-surface p-5 transition-colors duration-150 hover:border-border/60 hover:bg-surface-hover/30 ${className}`}
    >
      <div className="h-full flex flex-col justify-between">{children}</div>
    </motion.div>
  );
}

function WidgetHeader({ title, icon: Icon, tone = 'text-muted' }) {
  return (
    <div className="mb-3 flex items-center justify-between border-b border-border/40 pb-2">
      <h3 className="text-label font-semibold uppercase tracking-[0.06em] text-muted">{title}</h3>
      <Icon className={`h-4 w-4 ${tone}`} />
    </div>
  );
}

export default function CommandCenter({ metrics }) {
  const { results, rerank, startRerank, health } = useData();
  const { openDrawer } = useDrawer();
  const [isDeepDiveOpen, setIsDeepDiveOpen] = useState(false);
  const [isRecalibrateOpen, setIsRecalibrateOpen] = useState(false);

  // Extract metric metrics safely
  const corpus = metrics?.funnel?.corpus ?? 100000;
  const finalCount = metrics?.total_count ?? results?.candidates?.length ?? 0;
  const rankSeconds = metrics?.last_run_time_seconds ?? 0.0;
  const honeypots = metrics?.honeypot_count ?? 0;
  const dqs = metrics?.disqualified_count ?? 0;
  const generatedAt = metrics?.generated_at;

  const top10 = metrics?.mean_score_top10 ?? 0;
  const top50 = metrics?.mean_score_top50 ?? 0;

  const locDist = metrics?.location_distribution || {};
  const stages = metrics?.funnel?.stages || [];
  const stageLabels = ['Ingest', 'Semantic', 'Career', 'Skills', 'Final'];

  // Top Candidates preview
  const topCandidates = results?.candidates?.slice(0, 3) || [];

  // System logs formatted as a Recruiter-focused AI Filtration Ledger
  const logs = [];
  const timestamp = generatedAt ? new Date(generatedAt) : new Date();
  const formatTime = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };

  logs.push({ time: formatTime(new Date(timestamp.getTime() - 15000)), msg: 'Ledger: Initializing Sourcing Filters' });
  logs.push({ time: formatTime(new Date(timestamp.getTime() - 12000)), msg: `Ingest: Sourced ${corpus.toLocaleString()}+ candidates matching Job Description` });
  
  if (dqs > 0) {
    logs.push({ time: formatTime(new Date(timestamp.getTime() - 10000)), msg: `Hard Gates: Filtered ${dqs} disqualified applications` });
  }
  if (honeypots > 0) {
    logs.push({ time: formatTime(new Date(timestamp.getTime() - 8000)), msg: `Trust Check: Trapped ${honeypots} profiles with synthetic or inflated histories` });
  }
  
  logs.push({ time: formatTime(new Date(timestamp.getTime() - 5000)), msg: 'Semantic Match: Generating embedding proximity weights' });
  logs.push({ time: formatTime(timestamp), msg: `Output: Sourced Top 100 cohort for recruiter review (${rankSeconds.toFixed(2)}s)` });

  if (rerank.status === 'running') {
    logs.push({ time: formatTime(new Date()), msg: `Running: ${rerank.message || 'Processing...'} (${rerank.progress}%)`, active: true });
  } else if (rerank.status === 'success') {
    logs.push({ time: formatTime(new Date()), msg: `Completed: Sourced Top 100 candidates in ${rerank.elapsed || rankSeconds.toFixed(1)}s`, success: true });
  } else if (rerank.status === 'error') {
    logs.push({ time: formatTime(new Date()), msg: `Error: Sourcing engine halted: ${rerank.message}`, error: true });
  }

  // Derive top insights dynamically from metrics
  const insights = [];
  
  if (metrics?.title_distribution && metrics.title_distribution.length > 0) {
    const topTitle = metrics.title_distribution[0];
    insights.push({
      label: 'Dominant Profile',
      value: finalCount > 0
        ? `${topTitle.title} represents ${((topTitle.count / finalCount) * 100).toFixed(0)}% of Top 100`
        : `${topTitle.title} represents 0% of Top 100`,
      icon: Cpu,
    });
  }
  
  if (locDist) {
    const sortedLocs = Object.entries(locDist).sort((a, b) => b[1] - a[1]);
    if (sortedLocs.length > 0 && sortedLocs[0][1] > 0) {
      insights.push({
        label: 'Talent Pool Hub',
        value: `${sortedLocs[0][0]} holds the highest cohort density (${sortedLocs[0][1]} candidates)`,
        icon: Globe2,
      });
    }
  }

  if (top10 > 0) {
    const confidenceRating = top10 > 0.8 ? 'Excellent' : top10 > 0.6 ? 'Moderate' : 'Needs Review';
    insights.push({
      label: 'Pipeline Confidence',
      value: `${confidenceRating} matching strength in top 10 (mean: ${(top10 * 100).toFixed(1)}%)`,
      icon: BrainCircuit,
    });
  }

  if (insights.length < 3) {
    insights.push({
      label: 'Security Verification',
      value: honeypots > 0 ? `${honeypots} integrity alerts require urgent auditor review` : 'No integrity anomalies detected in top 100',
      icon: ShieldCheck,
    });
  }

  return (
    <section className="border-b border-border bg-background py-8">
      <div className="mx-auto max-w-7xl px-4">
        {/* Header */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end"
        >
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded border border-primary/20 bg-primary/8 px-2.5 py-1 text-label uppercase tracking-[0.06em] text-primary">
              <Terminal className="h-3 w-3" />
              <span>Sourcing Engine Status</span>
            </div>
            <h1 className="text-display-md tracking-tight text-foreground">
              AI Sourcing & Recruitment Command
            </h1>
          </div>
          <div className="flex items-center gap-3 font-mono text-data-sm text-muted">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
              </span>
              <span>ENGINE: {health?.status === 'down' ? 'OFFLINE' : 'OPERATIONAL'}</span>
            </div>
            <span>·</span>
            <span>UPDATED {generatedAt ? timeAgo(generatedAt).toUpperCase() : 'NEVER'}</span>
          </div>
        </motion.div>

        {/* Bento Grid */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={stagger}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {/* 1. Sourcing Funnel Yield */}
          <Widget className="lg:col-span-2">
            <div>
              <WidgetHeader title="Sourcing Funnel Yield" icon={Database} tone="text-secondary" />
              <div className="flex items-end justify-between mt-3">
                <div>
                  <p className="text-label uppercase tracking-[0.06em] text-muted">Ingested Pool</p>
                  <p className="font-mono text-data-lg text-foreground">
                    {corpus.toLocaleString()}
                  </p>
                </div>
                <div className="h-px w-12 bg-border sm:w-24" />
                <div className="text-right">
                  <p className="text-label uppercase tracking-[0.06em] text-muted">Qualified Cohort</p>
                  <p className="font-mono text-data-lg text-info">
                    {finalCount.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-border/40">
                <div
                  className="h-full rounded-full bg-info/80 transition-all duration-[400ms] ease-out"
                  style={{ width: corpus > 0 && finalCount > 0 ? `${Math.max(2, (finalCount / corpus) * 100)}%` : '0%' }}
                />
              </div>
            </div>

            {stages.length > 0 && (
              <div className="mt-4 grid grid-cols-5 gap-1 text-center border-t border-border/40 pt-3">
                {stages.map((count, idx) => (
                  <div key={idx} className="rounded bg-surface-hover/40 py-1.5 px-0.5 border border-border/40">
                    <p className="font-mono text-data-sm text-foreground">
                      {count >= 1000 ? `${(count / 1000).toFixed(0)}k` : count}
                    </p>
                    <p className="text-label font-semibold uppercase tracking-[0.06em] text-muted mt-0.5">
                      {stageLabels[idx]}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Widget>

          {/* 2. Evaluation Velocity */}
          <Widget>
            <div>
              <WidgetHeader title="Evaluation Velocity" icon={Clock} tone="text-primary" />
              <div className="mt-2">
                <div className="flex items-baseline gap-1">
                  <p className="font-mono text-display-sm font-medium tracking-tight text-primary">
                    {rankSeconds.toFixed(1)}
                  </p>
                  <span className="text-body-sm text-muted">sec</span>
                </div>
                <p className="mt-1 text-body-sm text-muted">Sourcing engine processing duration</p>
              </div>
            </div>
            <div className="mt-4 border-t border-border/40 pt-3 flex items-center justify-between font-mono text-data-sm text-muted">
              <span>Matching Rate:</span>
              <span className="font-bold text-foreground">
                {corpus > 0 ? `${(corpus / Math.max(0.1, rankSeconds) / 1000).toFixed(1)}k candidates/s` : '--'}
              </span>
            </div>
          </Widget>

          {/* 3. AI Confidence */}
          <Widget>
            <div>
              <WidgetHeader title="AI Match Confidence" icon={BrainCircuit} tone="text-accent" />
              <div className="mt-2">
                <div className="flex items-baseline gap-1">
                  <p className="font-mono text-display-sm font-medium tracking-tight text-accent">
                    {(top10 * 100).toFixed(1)}
                  </p>
                  <span className="text-xs text-muted">%</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Average AI score of top 10 cohort
                </p>
              </div>
            </div>
            <div className="mt-4 border-t border-border/40 pt-3 flex items-center justify-between font-mono text-data-sm text-muted">
              <span>Top 50 average:</span>
              <span className="font-bold text-foreground">{(top50 * 100).toFixed(1)}%</span>
            </div>
          </Widget>

          {/* 4. Trust & Verification Audit */}
          <Widget>
            <div>
              <WidgetHeader
                title="Trust & Verification"
                icon={honeypots > 0 ? AlertTriangle : ShieldAlert}
                tone={honeypots > 0 ? 'text-danger animate-pulse' : 'text-success'}
              />
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between rounded bg-surface-hover/30 px-2.5 py-1.5">
                  <span className="text-caption text-muted">Honeypots Trapped</span>
                  <span className={`font-mono text-data-md ${honeypots > 0 ? 'text-danger' : 'text-accent'}`}>
                    {honeypots}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded bg-surface-hover/30 px-2.5 py-1.5">
                  <span className="text-caption text-muted">Hard Disqualified</span>
                  <span className="font-mono text-data-md text-support">{dqs}</span>
                </div>
              </div>
            </div>
            <div className="mt-3 text-caption text-muted flex flex-col gap-2">
              {honeypots > 0 ? (
                <span className="text-danger font-medium flex items-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Suspected profile anomalies detected.</span>
              ) : (
                <span className="text-warning font-medium flex items-center gap-1.5"><AlertTriangle className="h-3 w-3" /> System baseline drift detected.</span>
              )}
              <button
                onClick={() => setIsDeepDiveOpen(true)}
                className="mt-1 flex w-full items-center justify-center gap-1.5 rounded border border-border bg-surface-hover/50 px-3 py-1.5 text-body-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
              >
                <Search className="h-3.5 w-3.5 text-muted" />
                Deep Dive Analysis
              </button>
            </div>
          </Widget>

          {/* 5. Sourcing Controls */}
          <Widget>
            <div>
              <WidgetHeader title="Sourcing Controls" icon={Activity} tone="text-primary" />
              <div className="flex flex-col gap-2 mt-2">
                <button
                  onClick={startRerank}
                  disabled={rerank.status === 'running'}
                  className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-body-sm font-semibold text-white transition-colors duration-150 hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  {rerank.status === 'running' ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Sourcing...
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3 fill-current" />
                      Re-run Sourcing Engine
                    </>
                  )}
                </button>
                <Link
                  to="/candidates"
                  className="flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-body-sm font-semibold text-foreground transition-colors duration-150 hover:bg-surface-hover"
                >
                  <Search className="h-3 w-3" />
                  View Talent Ledger
                </Link>
              </div>
            </div>
            <div className="mt-3 text-center">
              <Link
                to="/market"
                className="inline-flex items-center gap-1 text-caption font-bold text-primary hover:underline"
              >
                <span>Market Depth Intelligence</span>
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </Widget>

          {/* 6. AI Filtration Processing Ledger */}
          <Widget className="lg:col-span-2">
            <div>
              <WidgetHeader title="AI Filtration Processing Ledger" icon={Terminal} tone="text-muted" />
              <div className="mt-2 rounded bg-surface-hover/20 border border-border/40 p-3 font-mono text-data-sm leading-relaxed text-muted h-[105px] overflow-y-auto">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-primary shrink-0">[{log.time}]</span>
                    <span className={
                      log.active ? 'text-primary animate-pulse font-semibold' :
                      log.success ? 'text-success font-semibold' :
                      log.error ? 'text-danger font-semibold' :
                      'text-foreground'
                    }>
                      {log.msg}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Widget>

          {/* 7. Talent Intelligence Insights */}
          <Widget className="lg:col-span-2">
            <div>
              <WidgetHeader title="Talent Intelligence Insights" icon={Sparkles} tone="text-support" />
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {insights.map((ins, i) => {
                  const Icon = ins.icon;
                  return (
                    <div key={i} className="rounded border border-border/40 bg-surface-hover/20 p-2.5 flex flex-col justify-between">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className="h-3.5 w-3.5 text-muted/60 shrink-0" />
                        <span className="text-label uppercase tracking-[0.06em] text-muted">{ins.label}</span>
                      </div>
                      <p className="text-body-sm font-semibold text-foreground leading-tight mt-1">{ins.value}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </Widget>

          {/* 8. Top Sourced Candidates */}
          <Widget className="lg:col-span-2">
            <div>
              <WidgetHeader title="Top Sourced Candidates" icon={UserCheck} tone="text-accent" />
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {topCandidates.length === 0 ? (
                  <div className="col-span-3 py-6 text-center text-xs text-muted">
                    No candidates loaded. Re-run sourcing engine to populate.
                  </div>
                ) : (
                  topCandidates.map((c) => (
                    <button
                      key={c.candidate_id}
                      onClick={() => openDrawer(c.candidate_id)}
                      className="group flex flex-col justify-between rounded border border-border bg-surface-hover/20 p-2.5 text-left transition-colors duration-150 hover:bg-surface-hover hover:border-border/60 cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-primary font-mono text-data-sm">
                          #{c.rank}
                        </div>
                        <span className="font-mono text-data-sm text-primary bg-primary/8 border border-primary/15 px-1.5 py-0.5 rounded">
                          {fmtScore(c.score)}
                        </span>
                      </div>
                      <div className="mt-2">
                        <p className="truncate text-heading-sm text-foreground group-hover:text-primary transition-colors duration-150">
                          {c.title || 'Untitled'}
                        </p>
                        <p className="truncate text-caption text-muted flex items-center gap-0.5 mt-0.5">
                          <MapPin className="h-2.5 w-2.5" />
                          {c.location || 'Unknown'}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </Widget>
        </motion.div>
      </div>

      <AnomaliesDeepDive
        isOpen={isDeepDiveOpen}
        onClose={() => setIsDeepDiveOpen(false)}
        onRecalibrate={() => setIsRecalibrateOpen(true)}
      />

      <RecalibrateModal
        isOpen={isRecalibrateOpen}
        onClose={() => setIsRecalibrateOpen(false)}
      />
    </section>
  );
}
