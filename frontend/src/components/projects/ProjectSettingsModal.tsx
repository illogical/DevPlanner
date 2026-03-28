import { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { Button } from '../ui/Button';
import { projectsApi } from '../../api/client';
import type { ProjectSummary } from '../../types';

interface ProjectSettingsModalProps {
  project: ProjectSummary;
  onClose: () => void;
}

type RepoValidationState = 'idle' | 'validating' | 'valid' | 'invalid';

export function ProjectSettingsModal({ project, onClose }: ProjectSettingsModalProps) {
  const updateProject = useStore((state) => state.updateProject);

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [repoPath, setRepoPath] = useState(project.repoPath ?? '');
  const [repoValidation, setRepoValidation] = useState<RepoValidationState>('idle');
  const [repoValidationMessage, setRepoValidationMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => nameInputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleRepoPathBlur = async () => {
    const trimmed = repoPath.trim();
    if (!trimmed) {
      setRepoValidation('idle');
      setRepoValidationMessage('');
      return;
    }
    if (trimmed === project.repoPath) {
      setRepoValidation('valid');
      setRepoValidationMessage('Valid git repository');
      return;
    }

    setRepoValidation('validating');
    setRepoValidationMessage('');
    try {
      await projectsApi.update(project.slug, { repoPath: trimmed });
      setRepoValidation('valid');
      setRepoValidationMessage('Valid git repository');
    } catch (err: unknown) {
      setRepoValidation('invalid');
      if (err instanceof Error) {
        setRepoValidationMessage(err.message);
      } else {
        setRepoValidationMessage('Invalid repository path');
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || isSaving) return;
    if (repoValidation === 'invalid') return;

    setIsSaving(true);
    setError(null);
    try {
      await updateProject(project.slug, {
        name: trimmedName,
        description: description.trim() || undefined,
        repoPath: repoPath.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save project settings');
      setIsSaving(false);
    }
  };

  const inputClass =
    'w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-6">
        <h2 className="text-lg font-semibold text-gray-100 mb-5">Project Settings</h2>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Name
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSaving}
              className={inputClass}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Description <span className="text-gray-500">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={isSaving}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Git Repository Path */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Git Repository Path <span className="text-gray-500">(optional)</span>
            </label>
            <input
              type="text"
              value={repoPath}
              onChange={(e) => {
                setRepoPath(e.target.value);
                setRepoValidation('idle');
                setRepoValidationMessage('');
              }}
              onBlur={handleRepoPathBlur}
              placeholder="/absolute/path/to/repo"
              disabled={isSaving}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-500">
              Local path to the git repository. Required for card dispatch.
            </p>
            {repoValidation === 'validating' && (
              <p className="mt-1 text-xs text-gray-400">Checking path…</p>
            )}
            {repoValidation === 'valid' && (
              <p className="mt-1 text-xs text-green-400">{repoValidationMessage}</p>
            )}
            {repoValidation === 'invalid' && (
              <p className="mt-1 text-xs text-red-400">{repoValidationMessage}</p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-950/60 border border-red-800 rounded-md p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSaving}
              disabled={!name.trim() || repoValidation === 'invalid'}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
