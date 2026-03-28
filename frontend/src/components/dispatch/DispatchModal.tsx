import { useState, useEffect } from 'react';
import { useStore } from '../../store';
import { Button } from '../ui/Button';
import type { Card, DispatchAdapterName } from '../../types';
import { preferencesApi } from '../../api/client';

interface DispatchModalProps {
  card: Card;
  projectSlug: string;
  onClose: () => void;
}

const ADAPTER_OPTIONS: { value: DispatchAdapterName; label: string; placeholder: string }[] = [
  { value: 'claude-cli', label: 'Claude Code CLI', placeholder: 'claude-sonnet-4-20250514' },
  { value: 'gemini-cli', label: 'Gemini CLI', placeholder: 'gemini-2.5-pro' },
];

export function DispatchModal({ card, projectSlug, onClose }: DispatchModalProps) {
  const dispatchCard = useStore((state) => state.dispatchCard);

  const [adapter, setAdapter] = useState<DispatchAdapterName>('claude-cli');
  const [model, setModel] = useState('');
  const [autoCreatePR, setAutoCreatePR] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load saved preferences
  useEffect(() => {
    preferencesApi.get().then((prefs) => {
      if (prefs.lastDispatchAdapter && (prefs.lastDispatchAdapter === 'claude-cli' || prefs.lastDispatchAdapter === 'gemini-cli')) {
        setAdapter(prefs.lastDispatchAdapter);
      }
      if (prefs.lastDispatchModel) setModel(prefs.lastDispatchModel);
      if (prefs.lastDispatchAutoCreatePR !== undefined) setAutoCreatePR(prefs.lastDispatchAutoCreatePR);
    }).catch(() => {
      // Ignore — preferences are optional
    });
  }, []);

  const selectedAdapterOption = ADAPTER_OPTIONS.find((o) => o.value === adapter) ?? ADAPTER_OPTIONS[0];

  const handleDispatch = async () => {
    setIsDispatching(true);
    setError(null);

    try {
      // Save preferences
      await preferencesApi.update({
        lastDispatchAdapter: adapter,
        lastDispatchModel: model || undefined,
        lastDispatchAutoCreatePR: autoCreatePR,
      });

      await dispatchCard(projectSlug, card.slug, {
        adapter,
        model: model.trim() || undefined,
        autoCreatePR,
      });

      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to dispatch card';
      setError(message);
      setIsDispatching(false);
    }
  };

  const cardId = card.cardId ?? card.slug;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-6">
        <h2 className="text-lg font-semibold text-gray-100 mb-1">
          Dispatch Card
        </h2>
        <p className="text-sm text-gray-400 mb-5">
          {cardId} — {card.frontmatter.title}
        </p>

        <div className="space-y-4">
          {/* Agent selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Agent
            </label>
            <select
              value={adapter}
              onChange={(e) => setAdapter(e.target.value as DispatchAdapterName)}
              className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {ADAPTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Model input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Model <span className="text-gray-500">(optional)</span>
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={selectedAdapterOption.placeholder}
              className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-md px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Auto-create PR */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoCreatePR}
              onChange={(e) => setAutoCreatePR(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
            />
            <span className="text-sm text-gray-300">Auto-create Pull Request on completion</span>
          </label>

          {/* Info notice */}
          <div className="bg-gray-800/60 border border-gray-700 rounded-md p-3 text-xs text-gray-400">
            The agent will work in a git worktree on branch{' '}
            <code className="text-gray-300 bg-gray-700 px-1 py-0.5 rounded">
              card/{card.slug}
            </code>{' '}
            and update the board via DevPlanner MCP in real time.
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-950/60 border border-red-800 rounded-md p-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={onClose} disabled={isDispatching}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleDispatch}
            isLoading={isDispatching}
          >
            {isDispatching ? 'Dispatching…' : 'Dispatch'}
          </Button>
        </div>
      </div>
    </div>
  );
}
