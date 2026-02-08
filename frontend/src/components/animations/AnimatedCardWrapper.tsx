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
  const previousIndicatorIdsRef = useRef<Set<string>>(new Set());

  // Get all indicators for this card
  const indicators = getCardIndicators(cardSlug);
  
  // Determine if card has new indicators (not seen before)
  const hasNewIndicators = indicators.some(
    (ind) => !previousIndicatorIdsRef.current.has(ind.id)
  );
  
  // Determine indicator types based on new indicators
  const isNew = hasNewIndicators && indicators.some((ind) => ind.type === 'card:created');
  const isMoved = hasNewIndicators && indicators.some((ind) => ind.type === 'card:moved');
  const isUpdated = hasNewIndicators && indicators.some((ind) => ind.type === 'card:updated');

  // Update ref after render to track seen indicators
  useEffect(() => {
    if (hasNewIndicators) {
      const currentIndicatorIds = new Set(indicators.map((ind) => ind.id));
      previousIndicatorIdsRef.current = currentIndicatorIds;
    }
  }, [hasNewIndicators, indicators]);

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
