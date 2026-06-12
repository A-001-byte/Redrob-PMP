/** Shared framer-motion variants. Only opacity/transform are animated so
 *  content never causes layout shift and reduced-motion (MotionConfig
 *  reducedMotion="user" in App.jsx) degrades to opacity-only. */
export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

/** Enter-only page transition (no AnimatePresence exit — it fights
 *  React.lazy/Suspense and scroll restoration). */
export const pageEnter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: 'easeOut' },
};
