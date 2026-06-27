/** Shared framer-motion variants. Only opacity/transform are animated so
 *  content never causes layout shift and reduced-motion (MotionConfig
 *  reducedMotion="user" in App.jsx) degrades to opacity-only. */
export const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
};

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

/** Enter-only page transition (no AnimatePresence exit — it fights
 *  React.lazy/Suspense and scroll restoration). */
export const pageEnter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: 'easeOut' },
};

/* ── New motion presets ──────────────────────────────────────────────── */

/** Height-animated expand/collapse for table rows, panels, drawers.
 *  Communicates: "this content belongs to the element you activated." */
export const accordionVariants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: { height: { duration: 0.25, ease: [0.04, 0.62, 0.23, 0.98] }, opacity: { duration: 0.2, delay: 0.05 } },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { height: { duration: 0.2, ease: [0.04, 0.62, 0.23, 0.98] }, opacity: { duration: 0.12 } },
  },
};

/** Staggered container for sibling items appearing in sequence.
 *  Communicates: "these items are loading/materializing progressively." */
export const staggerContainer = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.06 },
  },
};

/** Child item used inside staggerContainer.
 *  Subtle upward drift with opacity. */
export const staggerItem = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: 'easeOut' },
  },
};

/** AI reasoning text reveal — slightly delayed, gentler drift.
 *  Communicates: "AI reasoning is being presented." */
export const reasoningReveal = {
  hidden: { opacity: 0, y: 6 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut', delay: 0.15 },
  },
};

/** Sort indicator rotation.
 *  Communicates: "data order has changed." */
export const sortFlip = {
  transition: { duration: 0.2, ease: 'easeOut' },
};

/** Label fade for sidebar collapse/expand.
 *  Communicates: "this label is fading out as the panel compresses." */
export const labelFade = {
  initial: { opacity: 0, x: -4 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.15, ease: 'easeOut' } },
  exit: { opacity: 0, x: -4, transition: { duration: 0.1, ease: 'easeIn' } },
};
