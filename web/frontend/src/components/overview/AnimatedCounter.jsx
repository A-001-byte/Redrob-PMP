import { useEffect, useRef } from 'react';
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';

/** Counts from 0 to `value` the first time it scrolls into view; re-animates
 *  toward new values if live data arrives later. Reduced motion renders the
 *  final value immediately. Wrap in font-heading (Fira Code is monospaced)
 *  so digits don't jitter. */
export default function AnimatedCounter({ value, decimals = 0, suffix = '', className = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduced = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) =>
    `${decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString()}${suffix}`
  );

  useEffect(() => {
    if (!inView) return undefined;
    if (reduced) {
      mv.set(value);
      return undefined;
    }
    const controls = animate(mv, value, { duration: 1.6, ease: 'easeOut' });
    return () => controls.stop();
  }, [inView, value, reduced, mv]);

  return (
    <motion.span ref={ref} className={className}>
      {text}
    </motion.span>
  );
}
