import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Briefcase,
  ClipboardList,
  GraduationCap,
  ScrollText,
  SlidersHorizontal,
  Wrench,
  X,
} from 'lucide-react';
import InterviewPrep from './drawer/InterviewPrep.jsx';
import CareerTimeline from './drawer/CareerTimeline.jsx';
import ShortlistControls from './drawer/ShortlistControls.jsx';
import ScoreWaterfall from './ScoreWaterfall.jsx';
import { getCandidate } from '../utils/api.js';
import { fmtScore, v } from '../utils/formatters.js';

function Section({ icon: Icon, title, children }) {
  return (
    <section className="border-b border-border px-5 py-4 last:border-b-0">
      <h3 className="mb-2.5 flex items-center gap-2 font-heading text-xs font-semibold uppercase tracking-wide text-foreground">
        <Icon className="h-3.5 w-3.5 text-secondary text-glow" aria-hidden="true" />
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
      <span className="text-right font-medium text-slate-300">{value}</span>
    </div>
  );
}

function SkillChips({ skills, tone }) {
  if (!skills.length) return <span className="text-sm text-slate-500">none</span>;
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
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus management: move focus into the dialog on open, restore on close.
  const closeRef = useRef(null);
  const restoreRef = useRef(null);
  useEffect(() => {
    if (open) {
      restoreRef.current = document.activeElement;
      requestAnimationFrame(() => closeRef.current?.focus());
    } else if (restoreRef.current) {
      restoreRef.current.focus?.();
      restoreRef.current = null;
    }
  }, [open]);

  const role = data?.current_role;
  const sys = data?.system_scores;
  const beh = data?.behavioral;
  const parts = data?.rank_detail?.parts;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-40 bg-black/60"
          aria-hidden="true"
        />
      )}
      {open && (
        <motion.aside
          key="drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Candidate profile"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          className="fixed right-0 top-0 z-50 h-full w-full max-w-xl overflow-y-auto
                     border-l border-border bg-background shadow-2xl"
        >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border glass-strong px-5 py-3">
          <div>
            <div className="font-heading text-sm font-semibold text-secondary">
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
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-md p-1.5 text-slate-500 transition-colors
                       duration-150 hover:bg-surface-hover hover:text-slate-300
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <div className="px-5 py-6 text-sm text-red-400">{error}</div>}
        {!data && !error && open && (
          <div className="space-y-3 px-5 py-6">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        )}

        {data && (
          <>
            <div className="border-b border-border px-5 py-3">
              <ShortlistControls candidateId={candidateId} />
            </div>

            <Section icon={Briefcase} title="Current Role">
              <div className="text-sm font-semibold text-slate-200">
                {v(role.title)}{' '}
                <span className="font-normal text-slate-500">@ {v(role.company)}</span>
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {v(role.location)}, {v(role.country)} · {v(role.years_of_experience)} yrs ·{' '}
                {v(role.industry)} ({v(role.company_size)})
              </div>
              {role.headline && (
                <p className="mt-2 text-sm italic text-slate-400">"{role.headline}"</p>
              )}
            </Section>

            {parts && (
              <Section icon={SlidersHorizontal} title="Score Breakdown">
                <ScoreWaterfall parts={parts} />
              </Section>
            )}

            <Section icon={ClipboardList} title="Interview Prep">
              <InterviewPrep data={data} />
            </Section>

            <Section icon={ScrollText} title="Career History">
              {data.career_history.length === 0 && (
                <span className="text-sm text-slate-500">none on file</span>
              )}
              <CareerTimeline history={data.career_history} />
              <ol className="space-y-3">
                {data.career_history.map((j, i) => (
                  <li key={i} className="border-l-2 border-border pl-3">
                    <div className="text-sm font-medium text-slate-200">
                      {v(j.title)}{' '}
                      <span className="font-normal text-slate-500">@ {v(j.company)}</span>
                      {j.is_current && (
                        <span className="ml-2 rounded-full bg-emerald-900/50 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                          current
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {v(j.duration_months)} mo · {v(j.industry)} · size {v(j.company_size)}
                    </div>
                    {j.description && (
                      <p className="mt-1 text-xs leading-relaxed text-slate-400">
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
                tone="bg-primary/20 text-blue-300"
              />
              <div className="mb-1 mt-3 text-xs text-slate-500">Nice-to-have</div>
              <SkillChips
                skills={data.matched_skills.nice_to_have}
                tone="bg-muted text-slate-400"
              />
            </Section>

            {data.education.length > 0 && (
              <Section icon={GraduationCap} title="Education">
                {data.education.map((e, i) => (
                  <div key={i} className="py-0.5 text-sm text-slate-300">
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
                <p className="text-sm leading-relaxed text-slate-400">
                  {data.summary_text}
                </p>
              </Section>
            )}
          </>
        )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
