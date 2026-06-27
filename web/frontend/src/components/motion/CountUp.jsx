import { useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

export default function CountUp({
  value,
  duration = 1.5,
  formatter = (v) => v.toFixed(0),
  className = '',
}) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => formatter(latest));

  useEffect(() => {
    const controls = animate(count, value, {
      duration,
      ease: [0.4, 0, 0.2, 1],
    });
    return controls.stop;
  }, [value, duration, count]);

  return <motion.span className={className}>{rounded}</motion.span>;
}
