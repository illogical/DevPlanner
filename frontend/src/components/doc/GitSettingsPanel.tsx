import { useRef, useEffect, useState } from 'react';
import { useStore } from '../../store';

interface GitSettingsPanelProps {
  onClose: () => void;
}

export function GitSettingsPanel({ onClose }: GitSettingsPanelProps) {
  const { gitRefreshInterval, setGitRefreshInterval } = useStore();
  const [localValue, setLocalValue] = useState(String(gitRefreshInterval));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleChange = (value: string) => {
    setLocalValue(value);
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      setGitRefreshInterval(num);
    }
  };

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-50 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-4"
    >
      <p className="text-xs font-medium text-gray-300 mb-2">Git Settings</p>
      <label className="block text-xs text-gray-400 mb-1">
        Refresh interval (seconds)
      </label>
      <input
        type="number"
        min={5}
        max={300}
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 px-2 py-1 outline-none focus:border-blue-500"
      />
    </div>
  );
}
