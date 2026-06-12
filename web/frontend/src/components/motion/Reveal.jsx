import { motion } from 'framer-motion';
import { fadeUp } from './presets.js';

/** Scroll-reveal wrapper: fades/slides in once when 25% enters the viewport. */
export default function Reveal({ children, delay = 0, className = '' }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.25 }}
      variants={{
        ...fadeUp,
        show: {
          ...fadeUp.show,
          transition: { ...fadeUp.show.transition, delay },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
