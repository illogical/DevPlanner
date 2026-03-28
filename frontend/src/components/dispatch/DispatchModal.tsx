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

const ADAPTER_OPTIONS: { value: DispatchAdapterName; label: string }[] = [
  { value: 'claude-cli', label: 'Claude Code CLI' },
  { value: 'gemini-cli', label: 'Gemini CLI' },
];

const MODELS_BY_ADAPTER: Record<DispatchAdapterName, { value: string; label: string }[]> = {
  'claude-cli': [
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-opus-4-6',   label: 'Claude Opus 4.6' },
    { value: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5' },
  ],
  'gemini-cli': [
    { value: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
  ],
};

export function DispatchModal({ card, projectSlug, onClose }: DispatchModalProps) {
  const dispatchCard = useStore((state) => state.dispatchCard);

  const [adapter, setAdapter] = useState<DispatchAdapterName>('claude-cli');
  const [model, setModel] = useState(MODELS_BY_ADAPTER['claude-cli'][0].value);
  const [autoCreatePR, setAutoCreatePR] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load saved preferences
  useEffect(() => {
    preferencesApi.get().then((prefs) => {
      const savedAdapter = prefs.lastDispatchAdapter;
      const validAdapter = savedAdapter === 'claude-cli' || savedAdapter === 'gemini-cli'
        ? savedAdapter : 'claude-cli';
      setAdapter(validAdapter);

      const savedModel = prefs.lastDispatchModel ?? '';
      const availableModels = MODELS_BY_ADAPTER[validAdapter];
      const modelValues = availableModels.map(m => m.value);
      setModel(modelValues.includes(savedModel) ? savedModel : availableModels[0].value);

      if (prefs.lastDispatchAutoCreatePR !== undefined) setAutoCreatePR(prefs.lastDispatchAutoCreatePR);
    }).catch(() => {
      // Ignore — preferences are optional
    });
  }, []);

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
              onChange={(e) => {
                const newAdapter = e.target.value as DispatchAdapterName;
                setAdapter(newAdapter);
                setModel(MODELS_BY_ADAPTER[newAdapter][0].value);
              }}
              className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {ADAPTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Model selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {MODELS_BY_ADAPTER[adapter].map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
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
