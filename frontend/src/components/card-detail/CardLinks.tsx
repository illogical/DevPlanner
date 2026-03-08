import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { useDetailScroll } from '../../hooks/useDetailScroll';
import { cn } from '../../utils/cn';
import { buildDiffUrl } from '../../utils/diffUrl';
import { publicConfigApi } from '../../api/client';
import type { CardLink, CreateLinkInput, UpdateLinkInput } from '../../types';

interface CardLinksProps {
  links: CardLink[];
  cardSlug: string;
}

type LinkKind = CardLink['kind'];

const KIND_OPTIONS: { value: LinkKind; label: string }[] = [
  { value: 'doc', label: 'Doc' },
  { value: 'spec', label: 'Spec' },
  { value: 'ticket', label: 'Ticket' },
  { value: 'repo', label: 'Repo' },
  { value: 'reference', label: 'Reference' },
  { value: 'other', label: 'Other' },
];

const KIND_BADGE_CLASSES: Record<LinkKind, string> = {
  doc: 'bg-blue-900/50 text-blue-300',
  spec: 'bg-purple-900/50 text-purple-300',
  ticket: 'bg-amber-900/50 text-amber-300',
  repo: 'bg-green-900/50 text-green-300',
  reference: 'bg-teal-900/50 text-teal-300',
  other: 'bg-gray-700 text-gray-300',
};

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

interface LinkFormState {
  label: string;
  url: string;
  kind: LinkKind;
}

const EMPTY_FORM: LinkFormState = { label: '', url: '', kind: 'other' };

interface LinkFormProps {
  initial: LinkFormState;
  existingLinks: CardLink[];
  editingId?: string;
  onSave: (state: LinkFormState) => void;
  onCancel: () => void;
}

function LinkForm({ initial, existingLinks, editingId, onSave, onCancel }: LinkFormProps) {
  const [form, setForm] = useState<LinkFormState>(initial);
  const [errors, setErrors] = useState<{ label?: string; url?: string }>({});

  const validate = (f: LinkFormState): boolean => {
    const errs: { label?: string; url?: string } = {};
    if (!f.label.trim()) {
      errs.label = 'Label is required.';
    }
    if (!f.url.trim()) {
      errs.url = 'URL is required.';
    } else if (!isValidUrl(f.url)) {
      errs.url = 'Enter a valid http or https URL.';
    } else {
      const normalised = new URL(f.url.trim()).href;
      const duplicate = existingLinks.find(
        (l) => l.url === normalised && l.id !== editingId
      );
      if (duplicate) {
        errs.url = 'This URL is already attached to the card.';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = () => {
    if (validate(form)) {
      onSave(form);
    }
  };

  return (
    <div className="space-y-3 bg-gray-800/50 rounded-lg p-3">
      <div>
        <input
          type="text"
          placeholder="Label (required)"
          maxLength={200}
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          className={`w-full bg-gray-700 border rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
            errors.label ? 'border-red-500' : 'border-gray-600'
          }`}
        />
        {errors.label && <p className="text-xs text-red-400 mt-1">{errors.label}</p>}
      </div>

      <div>
        <input
          type="url"
          placeholder="https://example.com"
          value={form.url}
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
          className={`w-full bg-gray-700 border rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
            errors.url ? 'border-red-500' : 'border-gray-600'
          }`}
        />
        {errors.url && <p className="text-xs text-red-400 mt-1">{errors.url}</p>}
      </div>

      <div>
        <select
          value={form.kind}
          onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as LinkKind }))}
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface UploadFormProps {
  cardSlug: string;
  onDone: () => void;
}

function UploadLinkForm({ cardSlug, onDone }: UploadFormProps) {
  const createVaultArtifact = useStore((s) => s.createVaultArtifact);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<LinkKind>('doc');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !label) {
      // Pre-fill label from filename without extension
      setLabel(f.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleSave = async () => {
    if (!file) { setError('Select a file first.'); return; }
    if (!label.trim()) { setError('Label is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await createVaultArtifact(cardSlug, file, label.trim(), kind);
      onDone();
    } catch (err: unknown) {
      const e = err as { error?: string; message?: string };
      if (e?.error === 'ARTIFACT_NOT_CONFIGURED') {
        setError('Set ARTIFACT_BASE_URL in .env to enable file uploads.');
      } else {
        setError(e?.message ?? 'Failed to upload file.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 bg-gray-800/50 rounded-lg p-3">
      <div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full border border-dashed border-gray-600 rounded px-3 py-2 text-sm text-gray-400 hover:border-gray-400 hover:text-gray-300 transition-colors text-left"
        >
          {file ? file.name : 'Choose file…'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt,.json,.ts,.tsx,.js,.jsx,.yaml,.yml,.csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <div>
        <input
          type="text"
          placeholder="Label (required)"
          maxLength={200}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as LinkKind)}
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded transition-colors"
        >
          {saving ? 'Uploading…' : 'Upload'}
        </button>
        <button
          onClick={onDone}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function CardLinks({ links, cardSlug }: CardLinksProps) {
  const { addLink, updateLink, deleteLink } = useStore();
  const detailScrollTarget = useStore((s) => s.detailScrollTarget);
  useDetailScroll('links');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [artifactBaseUrl, setArtifactBaseUrl] = useState<string | null>(null);

  // Fetch public config once per mount to determine vault artifact links
  useEffect(() => {
    publicConfigApi.get().then((cfg) => setArtifactBaseUrl(cfg.artifactBaseUrl)).catch((err) => {
      console.warn('Could not load public config (vault diff buttons will be hidden):', err);
    });
  }, []);

  const noFormOpen = !showAddForm && !showUploadForm;

  const handleAdd = async (form: LinkFormState) => {
    setError(null);
    try {
      const input: CreateLinkInput = {
        label: form.label.trim(),
        url: form.url.trim(),
        kind: form.kind,
      };
      await addLink(cardSlug, input);
      setShowAddForm(false);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message ?? 'Failed to add link.');
    }
  };

  const handleUpdate = async (linkId: string, form: LinkFormState) => {
    setError(null);
    try {
      const input: UpdateLinkInput = {
        label: form.label.trim(),
        url: form.url.trim(),
        kind: form.kind,
      };
      await updateLink(cardSlug, linkId, input);
      setEditingId(null);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message ?? 'Failed to update link.');
    }
  };

  const handleConfirmDelete = async (linkId: string) => {
    setError(null);
    try {
      await deleteLink(cardSlug, linkId);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message ?? 'Failed to delete link.');
    } finally {
      setConfirmDeleteId(null);
    }
  };

  return (
    <div id="card-section-links" className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
          <h3 className="font-medium text-sm">Links & Vault Artifacts ({links.length})</h3>
        </div>
        {noFormOpen && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUploadForm(true)}
              className="text-xs text-teal-400 hover:text-teal-300 transition-colors"
            >
              ↑ Upload File
            </button>
            <button
              onClick={() => setShowAddForm(true)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              + Add Link
            </button>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">
          {error}
        </p>
      )}

      {/* Upload form */}
      {showUploadForm && (
        <UploadLinkForm cardSlug={cardSlug} onDone={() => setShowUploadForm(false)} />
      )}

      {/* Add link form */}
      {showAddForm && (
        <LinkForm
          initial={EMPTY_FORM}
          existingLinks={links}
          onSave={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Link list */}
      <div className="space-y-2">
        {links.length === 0 && noFormOpen ? (
          <p className="text-center py-4 text-gray-500 text-xs italic">
            No links yet — add a URL or upload a vault artifact.
          </p>
        ) : (
          links.map((link) => {
            const isPendingDelete = confirmDeleteId === link.id;
            return editingId === link.id ? (
              <LinkForm
                key={link.id}
                initial={{ label: link.label, url: link.url, kind: link.kind }}
                existingLinks={links}
                editingId={link.id}
                onSave={(form) => handleUpdate(link.id, form)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div
                key={link.id}
                id={`link-row-${link.id}`}
                className={cn(
                  'flex items-center gap-2 group rounded-lg px-2 py-1.5 hover:bg-gray-800/50 transition-colors',
                  detailScrollTarget?.section === 'links' && detailScrollTarget?.linkId === link.id
                    && 'ring-2 ring-amber-400/60'
                )}
              >
                {/* Kind badge */}
                <span
                  className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded ${KIND_BADGE_CLASSES[link.kind]}`}
                >
                  {link.kind}
                </span>

                {/* Clickable label */}
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-sm text-blue-400 hover:text-blue-300 hover:underline truncate"
                  title={link.url}
                >
                  {link.label}
                </a>

                {/* Action buttons — × arms delete, then red trash executes */}
                <div
                  className={`shrink-0 flex items-center gap-1 transition-opacity ${
                    isPendingDelete ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  {isPendingDelete ? (
                    <>
                      {/* Armed: red trash executes delete */}
                      <button
                        onClick={() => handleConfirmDelete(link.id)}
                        title="Confirm delete"
                        className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-900/40 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                      {/* Cancel — back arrow icon */}
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        title="Cancel delete"
                        className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                          />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Diff Viewer button — only for vault artifact links */}
                      {artifactBaseUrl && link.url.startsWith(artifactBaseUrl) && (
                        <button
                          onClick={() => window.open(buildDiffUrl(link.url, artifactBaseUrl), '_blank')}
                          title="Open in Diff Viewer"
                          className="p-1 rounded text-gray-400 hover:text-teal-300 hover:bg-gray-700 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7"
                            />
                          </svg>
                        </button>
                      )}
                      {/* Edit button */}
                      <button
                        onClick={() => { setEditingId(link.id); setConfirmDeleteId(null); }}
                        title="Edit link"
                        className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                      {/* × button — first click arms delete */}
                      <button
                        onClick={() => setConfirmDeleteId(link.id)}
                        title="Remove link"
                        className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-gray-700 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
