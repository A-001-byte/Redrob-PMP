import { fmtScore } from '../utils/formatters.js';
import { ShieldCheck, ShieldAlert, Star, Award, BarChart3, Timer } from 'lucide-react';
import { motion } from 'framer-motion';
import CountUp from './motion/CountUp.jsx';

export default function MetricsBar({ metrics }) {
  if (!metrics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-5 h-32 animate-skeleton rounded border border-border bg-surface" />
        <div className="md:col-span-3 h-32 animate-skeleton rounded border border-border bg-surface" />
        <div className="md:col-span-2 h-32 animate-skeleton rounded border border-border bg-surface" />
        <div className="md:col-span-2 h-32 animate-skeleton rounded border border-border bg-surface" />
      </div>
    );
  }

  const honeypots = metrics.honeypot_count ?? 0;
  const disqualified = metrics.disqualified_count ?? 0;
  const isHoneypotSafe = honeypots === 0;
  const isDisqualifiedSafe = disqualified === 0;
  const isAllSafe = isHoneypotSafe && isDisqualifiedSafe;

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] } }
  };

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={{
        visible: { transition: { staggerChildren: 0.1 } }
      }}
      className="grid grid-cols-1 md:grid-cols-12 gap-4"
    >
      {/* 1. Large Safety & Integrity Card (Span 5) */}
      <motion.div 
        variants={itemVariants}
        className={`md:col-span-5 relative overflow-hidden rounded border p-5 group ${
          isAllSafe 
            ? 'bg-surface border-border hover:border-success/30' 
            : 'bg-surface border-destructive/25 hover:border-destructive/40'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-label uppercase text-muted">
            Pipeline Safety & Data Integrity
          </span>
          <span className={`px-2 py-0.5 rounded-sm text-label border uppercase ${
            isAllSafe 
              ? 'bg-success/10 border-success/20 text-success' 
              : 'bg-destructive/10 border-destructive/20 text-destructive'
          }`}>
            {isAllSafe ? 'Secured' : 'Breach Warning'}
          </span>
        </div>
 
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded border transition-colors duration-300 ${
            isAllSafe 
              ? 'bg-success/15 border-success/25 text-success' 
              : 'bg-destructive/15 border-destructive/25 text-destructive'
          }`}>
            {isAllSafe ? <ShieldCheck className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6 animate-pulse" />}
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-2.5">
              <span className={`font-heading text-2xl font-black tracking-tight ${isAllSafe ? 'text-success' : 'text-destructive'}`}>
                {isAllSafe ? '0 Fraud Flags' : (
                  <><CountUp value={honeypots + disqualified} formatter={v => Math.round(v)} /> Violations</>
                )}
              </span>
            </div>
            <p className="text-body-sm text-muted font-medium leading-relaxed">
              {isAllSafe 
                ? 'Zero honeypots or disqualified profiles present in top 100 cohort.' 
                : `Honeypots: ${honeypots} | Disqualified: ${disqualified}. Action required to restore safety.`}
            </p>
          </div>
        </div>
      </motion.div>

      {/* 2. Top-10 Mean Card (Span 3) */}
      <motion.div variants={itemVariants} className="md:col-span-3 bg-surface border border-border hover:border-secondary/35 rounded p-5 group transition-all">
        <div className="flex items-center justify-between mb-4">
          <span className="text-label uppercase text-muted">
            Top 10 Average Fit
          </span>
          <Star className="h-4 w-4 text-muted group-hover:text-secondary transition-colors duration-300" />
        </div>
        <div className="space-y-2.5">
          <div className="font-heading text-3xl font-black tracking-tight text-primary">
            <CountUp value={metrics.mean_score_top10 || 0} formatter={fmtScore} />
          </div>
          <div className="space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded bg-sidebar border border-border">
              <div 
                className="h-full bg-secondary rounded-sm transition-all duration-1000 ease-out" 
                style={{ width: `${(metrics.mean_score_top10 || 0) * 100}%` }}
              />
            </div>
            <span className="text-label text-muted uppercase block">
              Scale representation of fit
            </span>
          </div>
        </div>
      </motion.div>

      {/* 3. Top-50 Mean Card (Span 2) */}
      <motion.div variants={itemVariants} className="md:col-span-2 bg-surface border border-border hover:border-secondary/35 rounded p-5 group transition-all">
        <div className="flex items-center justify-between mb-4">
          <span className="text-label uppercase text-muted">
            Top 50 Mean
          </span>
          <Award className="h-4 w-4 text-muted group-hover:text-secondary transition-colors duration-300" />
        </div>
        <div className="space-y-2">
          <div className="font-heading text-3xl font-black tracking-tight text-primary">
            <CountUp value={metrics.mean_score_top50 || 0} formatter={fmtScore} />
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded bg-sidebar border border-border">
            <div 
              className="h-full bg-tertiary rounded-sm transition-all duration-1000 ease-out" 
              style={{ width: `${(metrics.mean_score_top50 || 0) * 100}%` }}
            />
          </div>
          <span className="text-label text-muted uppercase block">
            Cohort depth
          </span>
        </div>
      </motion.div>

      {/* 4. Total Ranked & Runtime Card (Span 2) */}
      <motion.div variants={itemVariants} className="md:col-span-2 bg-surface border border-border hover:border-secondary/35 rounded p-5 group transition-all">
        <div className="flex items-center justify-between mb-4">
          <span className="text-label uppercase text-muted">
            Pipeline Volume
          </span>
          <BarChart3 className="h-4 w-4 text-muted group-hover:text-secondary transition-colors duration-300" />
        </div>
        <div className="space-y-1">
          <div className="font-heading text-2xl font-black tracking-tight text-primary">
            <CountUp value={metrics.total_count || 100} formatter={(v) => Math.round(v).toLocaleString()} />
          </div>
          <span className="text-label text-muted uppercase block">
            Ranked
          </span>
          {metrics.last_run_time_seconds && (
            <div className="flex items-center gap-1 mt-2.5 text-label text-muted uppercase font-mono tracking-wide">
              <Timer className="h-3.5 w-3.5 text-secondary shrink-0" />
              <span><CountUp value={metrics.last_run_time_seconds} formatter={v => v.toFixed(1)} />s run</span>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
