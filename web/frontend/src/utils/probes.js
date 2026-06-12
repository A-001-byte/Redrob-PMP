/** Interview-prep derivations: deterministic rules over the candidate
 *  payload from /api/candidate/{id}. Every probe traces to a concrete data
 *  point — same zero-hallucination ethos as reasoning.py. Thresholds mirror
 *  pipeline/scorer.py and build_features.py semantics. */

const PART_NAMES = {
  semantic: 'JD semantic fit',
  career: 'career quality',
  skill: 'JD skill match',
  experience: 'experience fit',
  assessment: 'verified assessments',
};

/** Top strengths to lead the interview with. */
export function buildStrengths(data) {
  const out = [];
  const parts = data?.rank_detail?.parts;
  if (parts) {
    const main = ['semantic', 'career', 'skill', 'experience', 'assessment']
      .map((k) => ({ k, v: parts[k] ?? 0 }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 2);
    for (const { k, v } of main) {
      if (v > 0) out.push(`Strongest signal: ${PART_NAMES[k]} (+${v.toFixed(3)} weighted)`);
    }
  }
  const sys = data?.system_scores ?? {};
  if (typeof sys.assessment_score === 'number' && sys.assessment_score >= 0.8) {
    out.push('Skill claims independently verified — platform assessments average ≥ 80/100');
  }
  if (typeof sys.availability_multiplier === 'number' && sys.availability_multiplier >= 1.15) {
    out.push('Highly attainable: active on platform, responsive, open to work');
  }
  return out.slice(0, 3);
}

/** Probes: { severity: 'high'|'medium'|'low', title, question } */
export function buildProbes(data) {
  const probes = [];
  const parts = data?.rank_detail?.parts;
  const sys = data?.system_scores ?? {};
  const beh = data?.behavioral ?? {};
  const history = data?.career_history ?? [];
  const yoe = data?.current_role?.years_of_experience;

  if (parts && (parts.anchor_penalty ?? 0) < 0) {
    probes.push({
      severity: 'high',
      title: 'Anti-fit similarity penalty applied',
      question:
        'The profile reads close to an adjacent archetype (services consultant, academic, or CV/robotics specialist). Ask for a production retrieval/ranking system they owned end-to-end, with metrics.',
    });
  }

  if (parts && (parts.consistency ?? 0) < 0) {
    probes.push({
      severity: 'medium',
      title: 'Summary contradicts career history',
      question:
        'The self-written summary and the actual role history tell different stories. Ask which reflects their current focus — and why the gap.',
    });
  }

  const shortStints = history.filter((j) => !j.is_current && (j.duration_months ?? 99) < 18);
  const tenure = sys.career_subscores?.tenure_stability;
  if (typeof tenure === 'number' && tenure < 0.5 && shortStints.length >= 2) {
    probes.push({
      severity: 'medium',
      title: `${shortStints.length} roles under 18 months`,
      question: `Probe the reasons behind the short stints (${shortStints
        .slice(0, 3)
        .map((j) => `${j.company ?? '?'} · ${j.duration_months} mo`)
        .join(', ')}) — growth moves or a pattern?`,
    });
  }

  if (typeof sys.assessment_score === 'number') {
    if (sys.assessment_score < 0.45) {
      probes.push({
        severity: 'high',
        title: 'Assessments near the hard gate',
        question:
          'Platform assessment scores barely clear the 40/100 expert gate. Run a hands-on exercise on the required skills before progressing.',
      });
    } else if (sys.assessment_score < 0.6) {
      probes.push({
        severity: 'medium',
        title: 'Mid-band assessment scores',
        question:
          'Claimed proficiency is only moderately backed by assessments — verify depth on the JD-required skills with a concrete design question.',
      });
    }
  }

  const reqMatched = data?.matched_skills?.required ?? [];
  if (reqMatched.length === 0) {
    probes.push({
      severity: 'high',
      title: 'No required JD skill evidenced',
      question:
        'None of the four required skill groups matched this profile directly — probe for transferable depth or reconsider the slot.',
    });
  } else if (reqMatched.length <= 2) {
    probes.push({
      severity: 'medium',
      title: 'Thin required-skill evidence',
      question: `Only ${reqMatched.length} required skill${reqMatched.length === 1 ? '' : 's'} matched (${reqMatched
        .slice(0, 4)
        .join(', ')}). Ask how they cover the rest of the JD's core stack.`,
    });
  }

  if (typeof yoe === 'number' && yoe > 0) {
    if (yoe < 5) {
      probes.push({
        severity: 'medium',
        title: `${yoe} YoE — below the 5–9 band`,
        question: 'Junior to the JD band. Assess autonomy: have they owned a system in production without a senior shadowing them?',
      });
    } else if (yoe > 9) {
      probes.push({
        severity: 'low',
        title: `${yoe} YoE — above the 5–9 band`,
        question: 'Senior to the band — confirm they still want hands-on IC work and that comp expectations fit.',
      });
    }
  }

  const locFit = sys.experience_subscores?.location_fit;
  if (typeof locFit === 'number' && locFit <= 0.65 && beh.willing_to_relocate !== true) {
    probes.push({
      severity: 'medium',
      title: 'Location fit unresolved',
      question: 'Outside Pune/Noida with no confirmed relocation intent — settle work-mode and relocation before the loop.',
    });
  }

  if (typeof beh.notice_period_days === 'number' && beh.notice_period_days >= 60) {
    probes.push({
      severity: 'medium',
      title: `${beh.notice_period_days}-day notice period`,
      question: 'Long notice — align start-date expectations early and ask whether it is negotiable or buy-out-able.',
    });
  }

  if (typeof beh.days_inactive === 'number' && beh.days_inactive > 30) {
    probes.push({
      severity: 'low',
      title: `Inactive ${beh.days_inactive} days on platform`,
      question: 'May no longer be in market — confirm interest before scheduling a panel.',
    });
  }

  if (typeof beh.recruiter_response_rate === 'number' && beh.recruiter_response_rate < 0.3) {
    probes.push({
      severity: 'low',
      title: 'Low recruiter response rate',
      question: 'Historically slow to respond to outreach — try a warm intro or alternate channel.',
    });
  }

  if (typeof beh.github_activity_score === 'number' && beh.github_activity_score <= 0) {
    probes.push({
      severity: 'low',
      title: 'No public code signal',
      question: 'No GitHub activity on record — request a code sample or use a pairing exercise.',
    });
  }

  const current = history.filter((j) => j.is_current);
  if (current.length > 1) {
    probes.push({
      severity: 'medium',
      title: `${current.length} concurrent “current” roles`,
      question: 'Multiple roles marked current — clarify advisory vs. full-time commitments and actual availability.',
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  return probes.sort((a, b) => order[a.severity] - order[b.severity]);
}
