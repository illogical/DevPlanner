import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConnectionIndicatorProps {
  connectionState: 'connected' | 'disconnected' | 'reconnecting';
  onRetry?: () => void;
}

export function ConnectionIndicator({ connectionState, onRetry }: ConnectionIndicatorProps) {
  const [visible, setVisible] = useState(true);

  // Auto-hide after 3 seconds when connected
  useEffect(() => {
    if (connectionState === 'connected') {
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    } else {
      setVisible(true);
    }
  }, [connectionState]);

  if (!visible && connectionState === 'connected') {
    return null;
  }

  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected':
        return 'bg-green-500';
      case 'reconnecting':
        return 'bg-amber-500';
      case 'disconnected':
        return 'bg-red-500';
    }
  };

  const getTooltip = () => {
    switch (connectionState) {
      case 'connected':
        return 'Connected';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'disconnected':
        return 'Connection lost - Click to retry';
    }
  };

  const handleClick = () => {
    if (connectionState === 'disconnected' && onRetry) {
      onRetry();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className="relative group"
      >
        <button
          onClick={handleClick}
          disabled={connectionState !== 'disconnected'}
          className={`
            w-2.5 h-2.5 rounded-full
            ${getStatusColor()}
            ${connectionState === 'reconnecting' ? 'animate-pulse' : ''}
            ${connectionState === 'disconnected' ? 'cursor-pointer hover:scale-125' : 'cursor-default'}
            transition-transform
          `}
          title={getTooltip()}
        />
        
        {/* Tooltip */}
        <div className="
          absolute right-0 top-full mt-2 px-2 py-1
          bg-gray-800 text-white text-xs rounded
          whitespace-nowrap
          opacity-0 group-hover:opacity-100
          pointer-events-none
          transition-opacity
          z-50
        ">
          {getTooltip()}
          <div className="absolute -top-1 right-2 w-2 h-2 bg-gray-800 transform rotate-45" />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
