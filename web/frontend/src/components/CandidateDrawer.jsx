import { useEffect, useState } from 'react';
import {
  Activity,
  Briefcase,
  GraduationCap,
  ScrollText,
  SlidersHorizontal,
  Wrench,
  X,
} from 'lucide-react';
import { getCandidate } from '../utils/api.js';
import { PART_COLORS, PART_LABELS, fmtScore, v } from '../utils/formatters.js';

function Section({ icon: Icon, title, children }) {
  return (
    <section className="border-b border-border px-5 py-4 last:border-b-0">
      <h3 className="mb-2.5 flex items-center gap-2 font-heading text-xs font-semibold uppercase tracking-wide text-foreground">
        <Icon className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-700">{value}</span>
    </div>
  );
}

/** Waterfall of the composite: each weighted part floats at the running
 *  total, adjustments push it up/down, the clamped base subtotals it, and
 *  the multiplier chain scales it to the final composite. Parts arrive
 *  weight-applied from scorer.py — no weights duplicated here. */
function ScoreWaterfall({ parts }) {
  const main = ['semantic', 'career', 'skill', 'experience', 'assessment'];
  const adj = ['trajectory', 'consistency', 'anchor_penalty'];

  const steps = [];
  let run = 0;
  for (const k of main) {
    const d = parts[k] ?? 0;
    steps.push({ k, delta: d, start: run, color: PART_COLORS[k] });
    run += d;
  }
  for (const k of adj) {
    const d = parts[k] ?? 0;
    steps.push({ k, delta: d, start: run, color: d < 0 ? '#DC2626' : '#059669' });
    run += d;
  }

  const base = parts.base ?? Math.max(0, Math.min(1, run));
  const avail = parts.availability_multiplier ?? 1;
  const dq = parts.dq_multiplier ?? 1;
  const hp = parts.honeypot_multiplier ?? 1;
  const composite = parts.composite ?? base * avail * dq * hp;
  const scale = Math.max(0.3, run, base, composite);
  const pct = (x) => `${Math.max(0, (x / scale) * 100)}%`;

  const Bar = ({ label, start, width, color, value, tone = 'text-slate-600' }) => (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-slate-500">{label}</span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-sm bg-muted">
        <div
          className="absolute h-full rounded-sm"
          style={{
            left: pct(start),
            width: `max(2px, ${pct(width)})`,
            backgroundColor: color,
          }}
        />
      </div>
      <span className={`w-14 shrink-0 text-right font-heading ${tone}`}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-1.5">
      {steps.map(({ k, delta, start, color }) => (
        <Bar
          key={k}
          label={PART_LABELS[k]}
          start={Math.min(start, start + delta)}
          width={Math.abs(delta)}
          color={color}
          value={`${delta < 0 ? '-' : '+'}${Math.abs(delta).toFixed(3)}`}
          tone={
            delta < 0 ? 'text-destructive' : delta === 0 ? 'text-slate-400' : 'text-slate-600'
          }
        />
      ))}
      <div className="border-t border-border pt-1.5">
        <Bar
          label={Math.abs(run - base) > 1e-9 ? 'Base (clamped)' : 'Base'}
          start={0}
          width={base}
          color="#475569"
          value={base.toFixed(3)}
          tone="font-medium text-slate-700"
        />
      </div>
      <div className="text-xs text-slate-500">
        × availability{' '}
        <span className="font-heading font-medium text-slate-700">{avail.toFixed(2)}</span>
        {dq !== 1 && (
          <span className="text-destructive"> · × disqualified {dq.toFixed(2)}</span>
        )}
        {hp !== 1 && <span className="text-destructive"> · × honeypot {hp.toFixed(2)}</span>}
      </div>
      <Bar
        label="Composite"
        start={0}
        width={composite}
        color="#1E40AF"
        value={composite.toFixed(4)}
        tone="font-semibold text-primary"
      />
    </div>
  );
}

function SkillChips({ skills, tone }) {
  if (!skills.length) return <span className="text-sm text-slate-400">none</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map((s) => (
        <span key={s} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
          {s}
        </span>
      ))}
    </div>
  );
}

export default function CandidateDrawer({ candidateId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const open = candidateId !== null;

  useEffect(() => {
    if (!candidateId) return;
    setData(null);
    setError(null);
    let cancelled = false;
    getCandidate(candidateId)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(String(e.message || e)));
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const role = data?.current_role;
  const sys = data?.system_scores;
  const beh = data?.behavioral;
  const parts = data?.rank_detail?.parts;

  return (
    <>
      {/* overlay: click outside to close */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-slate-900/30 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-label="Candidate profile"
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-xl overflow-y-auto bg-white
                    shadow-2xl transition-transform duration-300 ease-out ${
                      open ? 'translate-x-0' : 'translate-x-full'
                    }`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white px-5 py-3">
          <div>
            <div className="font-heading text-sm font-semibold text-primary">
              {candidateId}
            </div>
            {data?.rank_detail && (
              <div className="text-xs text-slate-500">
                Rank #{data.rank_detail.rank} · composite{' '}
                {fmtScore(data.rank_detail.composite)}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors
                       duration-150 hover:bg-muted hover:text-slate-600
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <div className="px-5 py-6 text-sm text-destructive">{error}</div>}
        {!data && !error && open && (
          <div className="space-y-3 px-5 py-6">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        )}

        {data && (
          <>
            <Section icon={Briefcase} title="Current Role">
              <div className="text-sm font-semibold text-slate-800">
                {v(role.title)}{' '}
                <span className="font-normal text-slate-500">@ {v(role.company)}</span>
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {v(role.location)}, {v(role.country)} · {v(role.years_of_experience)} yrs ·{' '}
                {v(role.industry)} ({v(role.company_size)})
              </div>
              {role.headline && (
                <p className="mt-2 text-sm italic text-slate-600">“{role.headline}”</p>
              )}
            </Section>

            {parts && (
              <Section icon={SlidersHorizontal} title="Score Breakdown">
                <ScoreWaterfall parts={parts} />
              </Section>
            )}

            <Section icon={ScrollText} title="Career History">
              {data.career_history.length === 0 && (
                <span className="text-sm text-slate-400">none on file</span>
              )}
              <ol className="space-y-3">
                {data.career_history.map((j, i) => (
                  <li key={i} className="border-l-2 border-border pl-3">
                    <div className="text-sm font-medium text-slate-800">
                      {v(j.title)}{' '}
                      <span className="font-normal text-slate-500">@ {v(j.company)}</span>
                      {j.is_current && (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          current
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {v(j.duration_months)} mo · {v(j.industry)} · size {v(j.company_size)}
                    </div>
                    {j.description && (
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        {j.description}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </Section>

            <Section icon={Wrench} title="Matched Skills">
              <div className="mb-1 text-xs text-slate-500">JD required</div>
              <SkillChips
                skills={data.matched_skills.required}
                tone="bg-primary/10 text-primary"
              />
              <div className="mb-1 mt-3 text-xs text-slate-500">Nice-to-have</div>
              <SkillChips
                skills={data.matched_skills.nice_to_have}
                tone="bg-muted text-slate-600"
              />
            </Section>

            {data.education.length > 0 && (
              <Section icon={GraduationCap} title="Education">
                {data.education.map((e, i) => (
                  <div key={i} className="py-0.5 text-sm text-slate-700">
                    {v(e.degree)} in {v(e.field)}{' '}
                    <span className="text-slate-500">
                      @ {v(e.institution)} ({v(e.tier)}, grade {v(e.grade)})
                    </span>
                  </div>
                ))}
              </Section>
            )}

            <Section icon={Activity} title="Behavioral Signals">
              <Row
                label="Last active"
                value={`${v(beh.last_active_date)} (${v(beh.days_inactive, ' days ago')})`}
              />
              <Row label="Recruiter response rate" value={v(beh.recruiter_response_rate)} />
              <Row label="Interview completion" value={v(beh.interview_completion_rate)} />
              <Row label="Offer acceptance" value={v(beh.offer_acceptance_rate)} />
              <Row label="Notice period" value={v(beh.notice_period_days, ' days')} />
              <Row label="Open to work" value={beh.open_to_work ? 'Yes' : 'No'} />
              <Row
                label="Willing to relocate"
                value={beh.willing_to_relocate == null ? '--' : beh.willing_to_relocate ? 'Yes' : 'No'}
              />
              <Row label="Preferred work mode" value={v(beh.preferred_work_mode)} />
              <Row label="GitHub activity score" value={v(beh.github_activity_score)} />
              <Row label="Saved by recruiters (30d)" value={v(beh.saved_by_recruiters_30d)} />
              <Row label="Applications (30d)" value={v(beh.applications_submitted_30d)} />
            </Section>

            <Section icon={SlidersHorizontal} title="System Scores">
              <Row
                label="Career score"
                value={`${fmtScore(sys.career_score)} (company ${v(sys.career_subscores.company_type)} · role ${v(sys.career_subscores.role_relevance)} · prod ${v(sys.career_subscores.production_signal)} · domain ${v(sys.career_subscores.domain_indicator)} · tenure ${v(sys.career_subscores.tenure_stability)})`}
              />
              <Row label="Skill score" value={fmtScore(sys.skill_score)} />
              <Row
                label="Experience score"
                value={`${fmtScore(sys.experience_score)} (yoe ${v(sys.experience_subscores.yoe_fit)} · loc ${v(sys.experience_subscores.location_fit)} · edu ${v(sys.experience_subscores.education_tier)})`}
              />
              <Row label="Assessment score" value={fmtScore(sys.assessment_score)} />
              <Row
                label="Trajectory adjustment"
                value={`${sys.trajectory_adjustment > 0 ? '+' : ''}${sys.trajectory_adjustment}`}
              />
              <Row
                label="Availability multiplier"
                value={`×${Number(sys.availability_multiplier).toFixed(2)}`}
              />
              <Row
                label="Disqualified"
                value={
                  sys.disqualifier_flag
                    ? `Yes — ${sys.disqualifier_reasons.join('; ')}`
                    : 'No'
                }
              />
              <Row
                label="Honeypot"
                value={sys.is_honeypot ? `Yes — ${sys.honeypot_reasons.join('; ')}` : 'No'}
              />
            </Section>

            {data.summary_text && (
              <Section icon={ScrollText} title="Profile Summary">
                <p className="text-sm leading-relaxed text-slate-600">
                  {data.summary_text}
                </p>
              </Section>
            )}
          </>
        )}
      </aside>
    </>
  );
}
