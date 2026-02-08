import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../../store';
import { cn } from '../../utils/cn';

interface AnimatedCardWrapperProps {
  cardSlug: string;
  children: React.ReactNode;
  className?: string;
}

export function AnimatedCardWrapper({
  cardSlug,
  children,
  className,
}: AnimatedCardWrapperProps) {
  const { getCardIndicators } = useStore();
  const previousIndicatorsRef = useRef<Set<string>>(new Set());

  // Get all indicators for this card
  const indicators = getCardIndicators(cardSlug);
  
  // Determine if card is newly created or moved
  const isNew = indicators.some((ind) => ind.type === 'card:created');
  const isMoved = indicators.some((ind) => ind.type === 'card:moved');
  const isUpdated = indicators.some((ind) => ind.type === 'card:updated');

  // Track which indicators we've seen to avoid re-animating
  useEffect(() => {
    const currentIndicatorIds = new Set(indicators.map((ind) => ind.id));
    previousIndicatorsRef.current = currentIndicatorIds;
  }, [indicators]);

  // Determine glow color based on indicator type
  const getGlowColor = () => {
    if (isNew) return 'shadow-blue-500/40';
    if (isMoved) return 'shadow-amber-500/30';
    if (isUpdated) return 'shadow-violet-500/30';
    return '';
  };

  return (
    <motion.div
      className={cn(
        'relative',
        className,
        // Add glow effect when indicator is active
        (isNew || isMoved || isUpdated) && 'shadow-lg',
        (isNew || isMoved || isUpdated) && getGlowColor()
      )}
      // Animate when card is newly created
      initial={isNew ? { opacity: 0, scale: 0.95, y: -10 } : false}
      animate={{
        opacity: 1,
        scale: 1,
        y: 0,
      }}
      transition={{
        type: 'spring',
        damping: 30,
        stiffness: 200,
        duration: 0.5,
      }}
      layout
    >
      {children}
      
      {/* Animated border glow */}
      {(isNew || isMoved || isUpdated) && (
        <motion.div
          className={cn(
            'absolute inset-0 rounded-lg pointer-events-none',
            'border-2',
            isNew && 'border-blue-500',
            isMoved && 'border-amber-500',
            isUpdated && 'border-violet-500'
          )}
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 0 }}
          transition={{
            duration: isNew ? 2 : isMoved ? 1.5 : 3,
            ease: 'easeInOut',
          }}
        />
      )}
    </motion.div>
  );
}
