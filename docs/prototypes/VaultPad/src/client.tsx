/** @jsxImportSource preact */
import { h, render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Download, Eye, FileText, Folder, FolderOpen, Pencil, RefreshCw, Save, Settings, X } from 'lucide-preact';
import './client.css';

type TreeFile = { name: string; path: string; updatedAt: string };
type TreeFolder = { name: string; path: string; parentPath: string; count: number; files: TreeFile[] };
type ApiFile = { path: string; content: string; updatedAt: string; error?: string };
type ApiTree = { folders: TreeFolder[]; error?: string };

type ToastState = { type: 'success' | 'error'; message: string } | null;

type NavMode = 'push' | 'back' | 'forward' | 'replace';

type GitState = 'clean' | 'modified' | 'staged' | 'modified-staged' | 'untracked' | 'ignored' | 'outside-repo' | 'unknown';
type ConfigState = { refreshSeconds: number };

const q = new URLSearchParams(location.search);
const initialPath = (q.get('path') || '').replace(/^\/+/, '');
const pagePath = location.pathname.replace(/\/$/, '');
const isViewMode = pagePath.endsWith('/view');
const apiBase = pagePath.endsWith('/editor')
  ? pagePath.slice(0, -'/editor'.length)
  : pagePath.endsWith('/view')
    ? pagePath.slice(0, -'/view'.length)
    : '';
const apiUrl = (p: string) => `${apiBase}${p}`;
const CONFIG_KEY = 'vaultpad.config.v1';
const DEFAULT_REFRESH_SECONDS = 30;

function folderForFilePath(p: string) {
  const clean = (p || '').replace(/^\/+/, '');
  const parts = clean.split('/');
  if (parts.length <= 1) return '';
  parts.pop();
  return parts.join('/');
}

function parseFrontmatter(md: string) {
  if (!md.startsWith('---\n')) return { frontmatter: '', body: md };
  const end = md.indexOf('\n---\n', 4);
  if (end === -1) return { frontmatter: '', body: md };
  return { frontmatter: md.slice(4, end), body: md.slice(end + 5) };
}

function escapeHtml(text: string) {
  return (text || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function looksLikeScriptLine(line: string) {
  const t = line.trim();
  if (!t) return false;
  if (/^\s{2,}\S/.test(line)) return true;
  if (t.startsWith('{') || t.startsWith('[') || t.startsWith('}') || t.startsWith(']')) return true;
  if (/^"[^"]+"\s*:/.test(t)) return true;
  if (/^(const|let|var|function|return)\b/.test(t)) return true;
  if (/^(GET|POST|PUT|PATCH|DELETE)\s+\//.test(t)) return true;
  if (/^(curl|http|https):/i.test(t)) return true;
  return false;
}

function renderMarkdown(md: string) {
  const lines = (md || '').split('\n');
  let out = '';
  let inCode = false;
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('~~~') || line.startsWith('```')) {
      if (!inCode) { inCode = true; out += '<pre><code>'; }
      else { inCode = false; out += '</code></pre>'; }
      continue;
    }
    if (inCode) { out += `${escapeHtml(line)}\n`; continue; }

    if (line.startsWith('### ')) { if (inList) { out += '</ul>'; inList = false; } out += `<h3>${escapeHtml(line.slice(4))}</h3>`; continue; }
    if (line.startsWith('## ')) { if (inList) { out += '</ul>'; inList = false; } out += `<h2>${escapeHtml(line.slice(3))}</h2>`; continue; }
    if (line.startsWith('# ')) { if (inList) { out += '</ul>'; inList = false; } out += `<h1>${escapeHtml(line.slice(2))}</h1>`; continue; }

    if (line.startsWith('- ')) {
      if (!inList) { out += '<ul>'; inList = true; }
      out += `<li>${escapeHtml(line.slice(2))}</li>`;
      continue;
    }

    if (!inList && looksLikeScriptLine(line)) {
      const block: string[] = [line];
      while (i + 1 < lines.length && looksLikeScriptLine(lines[i + 1])) {
        i += 1;
        block.push(lines[i]);
      }
      out += `<pre class="script-block"><code>${block.map((b) => escapeHtml(b)).join('\n')}</code></pre>`;
      continue;
    }

    if (inList) { out += '</ul>'; inList = false; }
    if (line.trim() === '') { out += '<br/>'; continue; }

    const kv = line.match(/^([A-Za-z0-9 _.-]{2,40})(\s*:\s*)(.+)$/);
    if (kv && !line.includes('://')) {
      out += `<p class="md-line kv-line"><span class="kv-key">${escapeHtml(kv[1])}</span><span class="kv-sep">${escapeHtml(kv[2])}</span><span class="kv-val">${escapeHtml(kv[3])}</span></p>`;
      continue;
    }

    out += `<p class="md-line">${escapeHtml(line)}</p>`;
  }

  if (inList) out += '</ul>';
  if (inCode) out += '</code></pre>';
  return out;
}

function compactName(filename: string) {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})-(.+)\.md$/);
  if (!m) return { title: filename, stamp: '' };
  return { title: m[5].replaceAll('-', ' '), stamp: `${m[1]} ${m[2]}:${m[3]}` };
}

async function fetchJson<T>(url: string): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  const res = await fetch(url);
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) as T, text };
  } catch {
    return { ok: res.ok, status: res.status, data: null, text };
  }
}

function App() {
  const [path, setPath] = useState(initialPath);
  const [content, setContent] = useState('');
  const [lastSavedContent, setLastSavedContent] = useState('');
  const [error, setError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [folders, setFolders] = useState<TreeFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [toast, setToast] = useState<ToastState>(null);
  const [backHistory, setBackHistory] = useState<string[]>([]);
  const [forwardHistory, setForwardHistory] = useState<string[]>([]);
  const [gitStatuses, setGitStatuses] = useState<Record<string, GitState>>({});
  const [gitActionLoading, setGitActionLoading] = useState(false);
  const [showGitPanel, setShowGitPanel] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const commitInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<ConfigState>({ refreshSeconds: DEFAULT_REFRESH_SECONDS });
  const toastTimer = useRef<number | null>(null);

  const displayPath = useMemo(() => `/${(path || '').replace(/^\/+/, '')}`.replace(/\/$/, '/'), [path]);
  const isDirty = content !== lastSavedContent;
  const editorHref = `${apiBase}/editor?path=${encodeURIComponent(path || '')}`;
  const viewHref = `${apiBase}/view?path=${encodeURIComponent(path || '')}`;

  const previewHtml = useMemo(() => {
    const { frontmatter, body } = parseFrontmatter(content);
    const fmRows = frontmatter
      ? frontmatter
          .split('\n')
          .map((line) => {
            const i = line.indexOf(':');
            if (i < 0) return `<div>${escapeHtml(line)}</div>`;
            const key = line.slice(0, i).trim();
            const val = line.slice(i + 1).trim();
            const low = key.toLowerCase();
            if ((low === 'sources' || low === 'related') && (val === '[]' || val === '')) return '';
            return `<div class="fm-row"><span class="fm-key">${escapeHtml(key)}</span><span class="fm-val">${escapeHtml(val)}</span></div>`;
          })
          .join('')
      : '';

    const fmBlock = frontmatter ? `<section id="frontmatter">${fmRows}</section>` : '';
    return `${fmBlock}${renderMarkdown(body || '')}`;
  }, [content]);

  function gitStateLabel(state: GitState | undefined) {
    switch (state) {
      case 'modified': return 'Modified';
      case 'staged': return 'Staged';
      case 'modified-staged': return 'Staged + Unstaged';
      case 'untracked': return 'Untracked';
      case 'ignored': return 'Ignored';
      case 'outside-repo': return 'Outside repo';
      case 'unknown': return 'Unknown';
      default: return 'Clean';
    }
  }

  async function refreshGitStatuses(extraPaths: string[] = []) {
    const visible = (active?.files || []).map((f) => f.path);
    const paths = Array.from(new Set([path, ...visible, ...extraPaths].filter(Boolean)));
    if (!paths.length) return;
    const res = await fetch(apiUrl('/api/git/statuses'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paths }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { statuses?: Record<string, GitState> };
    setGitStatuses((prev) => ({ ...prev, ...(data.statuses || {}) }));
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ConfigState>;
      if (typeof parsed.refreshSeconds === 'number' && Number.isFinite(parsed.refreshSeconds)) {
        setConfig({ refreshSeconds: Math.max(5, Math.min(300, Math.round(parsed.refreshSeconds))) });
      }
    } catch {
      // ignore
    }
  }

  function persistConfig(next: ConfigState) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  }

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }

  async function loadNote(nextPath?: string, mode: NavMode = 'push') {
    const p = (nextPath ?? path).trim().replace(/^\/+/, '');
    if (!p) return false;
    if (p !== path && isDirty) {
      const ok = window.confirm('You have unsaved changes. Continue and discard them?');
      if (!ok) return false;
    }

    const r = await fetchJson<ApiFile>(apiUrl(`/api/file?path=${encodeURIComponent(p)}`));
    if (!r.ok || !r.data) {
      const msg = `Failed to load file (${r.status})`;
      setError(msg);
      showToast('error', msg);
      return false;
    }

    setError('');
    const current = path;
    setPath(p);
    setContent(r.data.content || '');
    setLastSavedContent(r.data.content || '');
    void refreshGitStatuses([p]);

    const folderForPath = folderForFilePath(p);
    if (folderForPath) {
      setActiveFolder(folderForPath);
    }

    if (p !== current) {
      if (mode === 'push' && current) {
        setBackHistory((prev) => [...prev, current]);
        setForwardHistory([]);
      }
      if (mode === 'back' && current) {
        setBackHistory((prev) => prev.slice(0, -1));
        setForwardHistory((prev) => [...prev, current]);
      }
      if (mode === 'forward' && current) {
        setForwardHistory((prev) => prev.slice(0, -1));
        setBackHistory((prev) => [...prev, current]);
      }
    }

    return true;
  }

  async function saveNote() {
    const p = path.trim().replace(/^\/+/, '');
    if (!p) return;
    setSaveState('saving');
    const res = await fetch(apiUrl('/api/file'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: p, content }),
    });
    if (!res.ok) {
      const msg = `Save failed (${res.status})`;
      setError(msg);
      setSaveState('error');
      showToast('error', msg);
      window.setTimeout(() => setSaveState('idle'), 1200);
      return;
    }

    setError('');
    setLastSavedContent(content);
    void refreshGitStatuses([p]);
    setSaveState('saved');
    showToast('success', 'Saved');
    window.setTimeout(() => setSaveState('idle'), 900);
    if (drawerOpen) loadTree();
  }


  async function stageCurrentFile() {
    const p = path.trim().replace(/^\/+/, '');
    if (!p) return;
    const res = await fetch(apiUrl('/api/git/stage'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: p }),
    });
    if (!res.ok) {
      showToast('error', 'Stage failed');
      return;
    }
    await refreshGitStatuses([p]);
    showToast('success', 'Staged');
  }

  async function unstageCurrentFile() {
    const p = path.trim().replace(/^\/+/, '');
    if (!p) return;
    const res = await fetch(apiUrl('/api/git/unstage'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: p }),
    });
    if (!res.ok) {
      showToast('error', 'Unstage failed');
      return;
    }
    await refreshGitStatuses([p]);
    showToast('success', 'Unstaged');
  }

  async function discardUnstagedCurrentFile() {
    const p = path.trim().replace(/^\/+/, '');
    if (!p) return;
    const res = await fetch(apiUrl('/api/git/discard-unstaged'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: p }),
    });
    if (!res.ok) {
      showToast('error', 'Discard failed');
      return;
    }
    await refreshGitStatuses([p]);
    showToast('success', 'Discarded unstaged changes');
  }


  async function toggleTrackCurrentFile() {
    const p = path.trim().replace(/^\/+/, '');
    if (!p) return;
    const state = gitStatuses[p];
    setGitActionLoading(true);
    try {
      if (state === 'staged') {
        await unstageCurrentFile();
      } else {
        await stageCurrentFile();
      }
      if (state !== 'modified-staged') {
        setShowGitPanel(false);
      }
    } finally {
      window.setTimeout(() => setGitActionLoading(false), 260);
    }
  }

  async function commitCurrentFile() {
    const p = path.trim().replace(/^\/+/, '');
    if (!p) return;
    const msg = commitMessage.trim();
    if (!msg) { showToast('error', 'Commit message required'); return; }
    setGitActionLoading(true);
    const res = await fetch(apiUrl('/api/git/commit'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: p, message: msg }),
    });
    if (!res.ok) {
      const t = await res.text();
      showToast('error', `Commit failed: ${t.slice(0, 80)}`);
      setGitActionLoading(false);
      return;
    }
    await refreshGitStatuses([p]);
    setCommitMessage('');
    setShowGitPanel(false);
    setGitActionLoading(false);
    showToast('success', 'Committed');
  }

  function downloadNote() {
    const p = path.trim().replace(/^\/+/, '');
    if (!p) return;
    const fileName = p.split('/').pop() || 'note.md';
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(href);
  }

  async function loadTree(selectCurrent = false) {
    const r = await fetchJson<ApiTree>(apiUrl('/api/tree'));
    if (!r.ok || !r.data) return;
    const nextFolders = r.data.folders || [];
    setFolders(nextFolders);
    const visible = nextFolders.find((f) => f.path === activeFolder)?.files.map((f) => f.path) || [];
    void refreshGitStatuses(visible);

    const currentFolder = folderForFilePath(path);
    if (selectCurrent) {
      const hasCurrent = nextFolders.some((f) => f.path === currentFolder);
      setActiveFolder(hasCurrent ? currentFolder : nextFolders[0]?.path || '');
      return;
    }

    const hasActive = nextFolders.some((f) => f.path === activeFolder);
    if (!hasActive) {
      const hasCurrent = nextFolders.some((f) => f.path === currentFolder);
      setActiveFolder(hasCurrent ? currentFolder : nextFolders[0]?.path || '');
    }
  }

  function focusCurrentFileInBrowser() {
    const currentFolder = folderForFilePath(path);
    if (currentFolder) setActiveFolder(currentFolder);
  }

  async function openDrawerAndSync(selectCurrent = true) {
    if (!drawerOpen) setDrawerOpen(true);
    await loadTree(selectCurrent);
  }

  function goBack() {
    const prev = backHistory[backHistory.length - 1];
    if (!prev) return;
    void loadNote(prev, 'back');
  }

  function goForward() {
    const next = forwardHistory[forwardHistory.length - 1];
    if (!next) return;
    void loadNote(next, 'forward');
  }

  useEffect(() => {
    loadConfig();
    if (initialPath) void loadNote(initialPath, 'replace');
  }, []);

  useEffect(() => {
    const normalized = (path || '').replace(/^\/+/, '');
    const next = new URL(window.location.href);
    if (normalized) next.searchParams.set('path', normalized);
    else next.searchParams.delete('path');
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const target = `${next.pathname}${next.search}${next.hash}`;
    if (current !== target) {
      window.history.replaceState(window.history.state, '', target);
    }
  }, [path]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isSave = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's';
      if (!isSave) return;
      e.preventDefault();
      void saveNote();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [path, content, drawerOpen]);


  useEffect(() => {
    const ms = Math.max(5, config.refreshSeconds) * 1000;
    const run = () => {
      if (document.visibilityState === 'visible') void refreshGitStatuses();
    };
    run();
    const id = window.setInterval(run, ms);
    return () => window.clearInterval(id);
  }, [config.refreshSeconds, path, activeFolder, folders.length]);


  useEffect(() => {
    if (showGitPanel) {
      const el = commitInputRef.current;
      if (el) {
        el.focus();
        el.style.height = 'auto';
        el.style.height = `${Math.min(220, el.scrollHeight || 68)}px`;
      }
    }
  }, [showGitPanel]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const active = folders.find((f) => f.path === activeFolder) || null;
  const rootFolders = folders
    .filter((f) => f.parentPath === '')
    .sort((a, b) => a.name.localeCompare(b.name));
  const childFolders = folders
    .filter((f) => f.parentPath === activeFolder)
    .sort((a, b) => a.name.localeCompare(b.name));
  const currentRootPath = (activeFolder || '').split('/')[0] || '';
  const currentSubpathLabel = (() => {
    const parts = (activeFolder || '').split('/').filter(Boolean);
    if (parts.length <= 1) return '/';
    const segs = parts.slice(1);
    const full = `/${segs.join('/')}`;
    if (full.length <= 34) return full;
    const tail = segs.slice(-2).join('/');
    return `…/${tail}`;
  })();
  const breadcrumbParts = (activeFolder || '').split('/').filter(Boolean);

  const currentGitState = (gitStatuses[path] || 'clean') as GitState;
  const isMixedState = currentGitState === 'modified-staged';
  const leftActionLabel = isMixedState
    ? 'Discard'
    : currentGitState === 'staged'
      ? 'Unstage'
      : 'Stage';
  const leftActionTitle = isMixedState
    ? 'Discard unstaged edits and keep staged content'
    : currentGitState === 'staged'
      ? 'Move staged changes back to unstaged'
      : 'Stage current file changes';
  const middleActionLabel = isMixedState ? 'Stage' : 'Cancel';
  const middleActionTitle = isMixedState
    ? 'Stage latest edits for this file'
    : 'Close panel';
  const rightActionLabel = 'Commit';
  const rightActionTitle = isMixedState
    ? 'Commit currently staged changes (unstaged edits remain unless staged first)'
    : 'Commit staged changes';

  return (
    <>
      <header>
        <div class="navButtons">
          <button class="iconBtn" title="Go back" aria-label="Go back" disabled={backHistory.length === 0} onClick={() => goBack()}>
            <ChevronLeft size={16} />
          </button>
          <button class="iconBtn" title="Go forward" aria-label="Go forward" disabled={forwardHistory.length === 0} onClick={() => goForward()}>
            <ChevronRight size={16} />
          </button>
        </div>
        <input
          value={displayPath}
          onInput={(e) => setPath((e.target as HTMLInputElement).value.replace(/^\/+/, ''))}
          placeholder="/20-Knowledge/operations/... .md"
          readOnly={isViewMode}
        />
        <div class="gitControlWrap">
          <button
            class={`iconBtn gitToggle gitToggleTop state-${currentGitState} ${gitActionLoading ? 'isLoading' : ''}`}
            title={gitActionLoading ? 'Updating git status…' : `Git status: ${gitStateLabel(currentGitState)} (click for actions)`}
            aria-label="Git actions"
            onClick={() => {
              const state = currentGitState;
              if (state === 'untracked') {
                void toggleTrackCurrentFile();
                return;
              }
              setShowGitPanel((v) => !v);
            }}
            disabled={gitActionLoading || !path}
          >
            <span class={`gitToggleDot ${gitActionLoading ? 'loading' : ''}`} />
          </button>
          {showGitPanel && (
            <div class="gitPanel expanded">
              <textarea
                ref={commitInputRef}
                class="commitInput"
                placeholder="Commit message"
                value={commitMessage}
                onInput={(e) => {
                  const el = e.target as HTMLTextAreaElement;
                  setCommitMessage(el.value);
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(220, el.scrollHeight)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void commitCurrentFile();
                  }
                }}
              />
              <div class="gitPanelActions">
                <button
                  class="gitPanelBtn"
                  onClick={() => void (isMixedState ? discardUnstagedCurrentFile() : toggleTrackCurrentFile())}
                  title={leftActionTitle}
                >
                  {leftActionLabel}
                </button>
                <button
                  class={`gitPanelBtn ${isMixedState ? '' : 'danger'}`}
                  onClick={() => void (isMixedState ? toggleTrackCurrentFile() : setShowGitPanel(false))}
                  title={middleActionTitle}
                >
                  {isMixedState ? middleActionLabel : <X size={14} />}
                </button>
                <button class="gitPanelBtn primary" onClick={() => void commitCurrentFile()} title={rightActionTitle}>{rightActionLabel}</button>
              </div>
            </div>
          )}
        </div>
        <button class="iconBtn" onClick={() => setShowConfig(true)} title="Settings" aria-label="Settings">
          <Settings size={16} />
        </button>
        <button class="primary iconBtn" onClick={() => void loadNote()} title="Load from path" aria-label="Load from path">
          <FolderOpen size={16} />
        </button>
        {!isViewMode && (
          <button
            class={`ok iconBtn ${saveState === 'saving' ? 'isSaving' : ''} ${saveState === 'saved' ? 'isSaved' : ''} ${saveState === 'error' ? 'isError' : ''}`}
            onClick={() => void saveNote()}
            title="Save file"
            aria-label="Save file"
          >
            {saveState === 'saved' ? <Check size={16} /> : <Save size={16} />}
          </button>
        )}
        <button class="iconBtn" onClick={() => downloadNote()} title="Download file" aria-label="Download file">
          <Download size={16} />
        </button>
        {isViewMode ? (
          <a class="buttonLikeIcon" href={editorHref} title="Switch to edit mode" aria-label="Switch to edit mode">
            <Pencil size={16} />
          </a>
        ) : (
          <a class="buttonLikeIcon" href={viewHref} title="Switch to view mode" aria-label="Switch to view mode">
            <Eye size={16} />
          </a>
        )}
      </header>

      <div id="app">
        <main class={isViewMode ? "previewOnly" : ""}>
          <section id="editorPane" class="pane">
            <div id="editorMobileBar"><button>Editor</button></div>
            <textarea id="editor" spellcheck={false} value={content} onInput={(e) => setContent((e.target as HTMLTextAreaElement).value)} />
          </section>
          <section id="preview" class="pane">
            {error && <div class="errorBanner">{error}</div>}
            {content ? <div class={isViewMode ? "previewInner" : ""} dangerouslySetInnerHTML={{ __html: previewHtml }} /> : <div class="emptyState">No content loaded. Press the <strong>Load</strong> button to fetch a file.</div>}
          </section>
        </main>

                <section id="drawer" class={drawerOpen ? 'open' : ''}>
          <div id="drawerHead">
            <strong>File Selector</strong>
            <div style="display:flex; gap:8px; align-items:center;">
              <button class="iconBtn" title="Refresh file selector" aria-label="Refresh file selector" onClick={() => void loadTree(false)}>
                <RefreshCw size={14} />
              </button>
              <button class="iconBtn" title="Focus current file in selector" aria-label="Focus current file in selector" onClick={() => focusCurrentFileInBrowser()}>
                <FolderOpen size={14} />
              </button>
              <button class="iconBtn" title="Hide file selector" aria-label="Hide file selector" onClick={() => setDrawerOpen(false)}>
                <ChevronDown size={14} />
              </button>
            </div>
          </div>
          <div id="browser">
            <div id="roots">
              {rootFolders.map((f) => (
                <div class={`row ${f.path === currentRootPath ? 'active' : ''}`} onClick={() => setActiveFolder(f.path)}>
                  <span class="rowIcon"><Folder size={13} /></span>
                  <span class="name">{f.name}</span>
                </div>
              ))}
            </div>
            <div id="subfolders">
              <div class="paneLabel" title={`/${(activeFolder || "").split("/").slice(1).join("/") || ""}` || "/"}>
                <span class="paneLabelText">{currentSubpathLabel}</span>
              </div>
              {active?.parentPath && (
                <div class="row" onClick={() => setActiveFolder(active.parentPath)}>
                  <span class="rowIcon"><ChevronLeft size={13} /></span>
                  <span class="name">..</span>
                </div>
              )}
              {childFolders.map((f) => (
                <div class={`row ${f.path === activeFolder ? 'active' : ''}`} onClick={() => setActiveFolder(f.path)}>
                  <span class="rowIcon"><Folder size={13} /></span>
                  <span class="name">{f.name}</span>
                  <span class="meta">{f.count}</span>
                </div>
              ))}
              {childFolders.length === 0 && <div class="emptyHint">No subfolders</div>}
            </div>
            <div id="files">
              {(active?.files || []).map((file) => {
                const { title, stamp } = compactName(file.name);
                return (
                  <div class={`row ${file.path === path ? 'selected' : ''}`} title={file.path} onClick={() => void loadNote(file.path, 'push')}>
                    <span class="rowIcon"><FileText size={13} /></span>
                    <span class="name">{title}</span>
                    <span
                      class={`gitSymbol state-${gitStatuses[file.path] || 'clean'}`}
                      title={`Git status: ${gitStateLabel(gitStatuses[file.path])}`}
                      aria-hidden="true"
                    />
                    <span class="meta">{stamp || file.updatedAt.slice(0, 16).replace('T', ' ')}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
      <footer
        id="bottomBar"
        title={drawerOpen ? 'Hide file selector' : 'Show file selector'}
        onClick={async () => {
          if (drawerOpen) {
            setDrawerOpen(false);
          } else {
            await openDrawerAndSync(true);
          }
        }}
      >
        <span class="handleIcon">≡</span>
        <div id="breadcrumbBar">
          <button
            class="crumb"
            title="Go to root folder"
            onClick={async (e) => {
              e.stopPropagation();
              setActiveFolder(currentRootPath || '');
              await openDrawerAndSync(false);
            }}
          >
            root
          </button>
          {breadcrumbParts.map((part, idx) => {
            const target = breadcrumbParts.slice(0, idx + 1).join('/');
            return (
              <span class="crumbWrap">
                <span class="crumbSep">/</span>
                <button
                  class="crumb"
                  title={`Go to ${target}`}
                  onClick={async (e) => {
                    e.stopPropagation();
                    setActiveFolder(target);
                    await openDrawerAndSync(false);
                  }}
                >
                  {part}
                </button>
              </span>
            );
          })}
        </div>
      </footer>

      {showConfig && (
        <div class="modalOverlay" onClick={() => setShowConfig(false)}>
          <div class="modalCard" onClick={(e) => e.stopPropagation()}>
            <h3>Settings</h3>
            <label class="fieldRow">
              <span>Git refresh interval (seconds)</span>
              <input
                type="number"
                min={5}
                max={300}
                value={config.refreshSeconds}
                onInput={(e) => {
                  const n = Number((e.target as HTMLInputElement).value || DEFAULT_REFRESH_SECONDS);
                  const next = { refreshSeconds: Math.max(5, Math.min(300, Math.round(n))) };
                  setConfig(next);
                  persistConfig(next);
                }}
              />
            </label>
            <div class="modalActions">
              <button onClick={() => setShowConfig(false)}>Close</button>
              <button class="primary" onClick={() => { void refreshGitStatuses(); setShowConfig(false); }}>Refresh now</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div class={`toast ${toast.type}`}>{toast.message}</div>}
    </>
  );
}

render(<App />, document.getElementById('root')!);
