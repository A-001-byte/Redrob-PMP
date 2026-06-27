import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import ScoreWaterfall from '../components/ScoreWaterfall.jsx';
import CareerTimeline from '../components/drawer/CareerTimeline.jsx';
import { pageEnter } from '../components/motion/presets.js';
import { useDrawer } from '../hooks/useDrawer.js';
import { getCandidate } from '../utils/api.js';
import { fmtScore, v } from '../utils/formatters.js';

const ID_RE = /^CAND_\d{7}$/;

function FactRow({ label, values, render = (x) => v(x) }) {
  return (
    <tr className="border-t border-border">
      <th className="py-2.5 pr-3 text-left text-label uppercase text-muted">{label}</th>
      {values.map((x, i) => (
        <td key={i} className="py-2.5 pr-3 text-xs font-semibold text-primary font-mono">
          {render(x)}
        </td>
      ))}
    </tr>
  );
}

function Chips({ skills, tone }) {
  if (!skills?.length) return <span className="text-xs text-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {skills.map((s) => (
        <span key={s} className={`rounded px-2 py-0.5 text-label uppercase ${tone}`}>
          {s}
        </span>
      ))}
    </div>
  );
}

export default function ComparePage() {
  const { openDrawer } = useDrawer();
  const [searchParams] = useSearchParams();
  const ids = useMemo(
    () =>
      [...new Set((searchParams.get('ids') ?? '').split(',').map((s) => s.trim()))]
        .filter((s) => ID_RE.test(s))
        .slice(0, 3),
    [searchParams]
  );

  const [profiles, setProfiles] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ids.length) return undefined;
    let cancelled = false;
    setProfiles(null);
    setError(null);
    Promise.all(ids.map((id) => getCandidate(id)))
      .then((ps) => !cancelled && setProfiles(ps))
      .catch((e) => !cancelled && setError(String(e.message || e)));
    return () => {
      cancelled = true;
    };
  }, [ids]);

  const sharedRequired = useMemo(() => {
    if (!profiles?.length) return [];
    return profiles
      .map((p) => p.matched_skills?.required ?? [])
      .reduce((a, b) => a.filter((s) => b.includes(s)));
  }, [profiles]);

  if (ids.length < 2) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-16 text-center text-sm text-muted">
        Pick 2–3 candidates on the{' '}
        <Link to="/candidates" className="text-secondary hover:underline">
          Candidates page
        </Link>{' '}
        (tick the boxes) to compare them here.
      </main>
    );
  }

  return (
    <motion.main {...pageEnter} className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-primary">Compare Candidates</h1>
          <p className="mt-1 text-sm text-muted font-body">
            Side by side — scores decompose identically, so differences are real signal.
          </p>
        </div>
        <Link
          to="/candidates"
          className="flex items-center gap-1.5 text-sm text-primary transition-all
                     duration-150 hover:text-secondary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to candidates
        </Link>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}
      {!profiles && !error && (
        <div
          className={`grid gap-4 ${ids.length === 3 ? 'lg:grid-cols-3 md:grid-cols-2' : 'md:grid-cols-2'}`}
        >
          {ids.map((id) => (
            <div key={id} className="h-96 animate-skeleton rounded border border-border bg-surface" />
          ))}
        </div>
      )}

      {profiles && (
        <div
          className={`grid gap-4 ${profiles.length === 3 ? 'lg:grid-cols-3 md:grid-cols-2' : 'md:grid-cols-2'}`}
        >
          {profiles.map((p) => {
            const id = p.candidate_id;
            const role = p.current_role ?? {};
            const beh = p.behavioral ?? {};
            const sys = p.system_scores ?? {};
            const uniqueReq = (p.matched_skills?.required ?? []).filter(
              (s) => !sharedRequired.includes(s)
            );
            return (
              <section key={id} className="rounded border border-border bg-surface transition-all duration-150 overflow-hidden">
                <div className="border-b border-border px-5 py-4 bg-surface-hover">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-primary">{id}</span>
                    <button
                      type="button"
                      onClick={() => openDrawer(id)}
                      className="flex cursor-pointer items-center gap-1 text-xs text-muted
                                 transition-all duration-150 hover:text-secondary
                                 focus:outline-none"
                    >
                      Full profile <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold text-primary font-body">
                    {v(role.title)} <span className="font-normal text-muted font-body">@ {v(role.company)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted font-mono">
                    {p.rank_detail
                      ? `Rank #${p.rank_detail.rank} · composite ${fmtScore(p.rank_detail.composite)}`
                      : 'not in current top 100'}
                  </div>
                </div>

                {p.rank_detail?.parts && (
                  <div className="border-b border-border px-5 py-4">
                    <ScoreWaterfall parts={p.rank_detail.parts} />
                  </div>
                )}

                <div className="border-b border-border px-5 py-4">
                  <table className="w-full">
                    <tbody>
                      <FactRow label="Experience" values={[role.years_of_experience]} render={(x) => v(x, ' yrs')} />
                      <FactRow label="Location" values={[`${role.location ?? '--'}, ${role.country ?? '--'}`]} />
                      <FactRow label="Notice period" values={[beh.notice_period_days]} render={(x) => v(x, ' days')} />
                      <FactRow label="Days inactive" values={[beh.days_inactive]} />
                      <FactRow label="Response rate" values={[beh.recruiter_response_rate]} />
                      <FactRow
                        label="Availability ×"
                        values={[sys.availability_multiplier]}
                        render={(x) => (typeof x === 'number' ? `×${Number(x).toFixed(2)}` : '--')}
                      />
                      <FactRow
                        label="Assessments"
                        values={[sys.assessment_score]}
                        render={(x) =>
                          typeof x === 'number' && x >= 0 ? `${Math.round(x * 100)}/100 avg` : '--'
                        }
                      />
                      <FactRow
                        label="Open to work"
                        values={[beh.open_to_work]}
                        render={(x) => (x ? 'Yes' : 'No')}
                      />
                    </tbody>
                  </table>
                </div>

                <div className="border-b border-border px-5 py-4">
                  <div className="mb-1.5 text-label uppercase text-muted">Shared required skills</div>
                  <Chips skills={sharedRequired} tone="bg-surface-hover text-muted border border-border" />
                  <div className="mb-1.5 mt-3.5 text-label uppercase text-muted">Unique required skills</div>
                  <Chips skills={uniqueReq} tone="bg-secondary/10 text-secondary border border-secondary/20" />
                </div>

                <div className="px-5 py-4">
                  <div className="mb-2 text-label uppercase text-muted">Career timeline</div>
                  <CareerTimeline history={p.career_history} />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </motion.main>
  );
}
