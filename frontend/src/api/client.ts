import type {
  ProjectSummary,
  ProjectConfig,
  Card,
  CreateCardInput,
  UpdateCardInput,
  ProjectsResponse,
  CardsResponse,
  TaskToggleResponse,
  TaskDeleteResponse,
  ReorderResponse,
  ArchiveResponse,
  TagsResponse,
  Preferences,
  SearchResponse,
  CardLink,
  CreateLinkInput,
  UpdateLinkInput,
  PaletteSearchResponse,
  GlobalPaletteSearchResponse,
  DispatchRecord,
  DispatchRequest,
  CardDispatchOutputData,
} from '../types';

const API_BASE = '/api';

class ApiClientError extends Error {
  status: number;
  expected?: string;

  constructor(message: string, status: number, expected?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.expected = expected;
  }
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiClientError(
      error.message || `HTTP ${response.status}`,
      response.status,
      error.expected
    );
  }

  return response.json();
}

// Project endpoints
export const projectsApi = {
  list: (includeArchived = false) =>
    fetchJSON<ProjectsResponse>(
      `${API_BASE}/projects?includeArchived=${includeArchived}`
    ),

  get: (slug: string) =>
    fetchJSON<ProjectConfig>(`${API_BASE}/projects/${slug}`),

  create: (name: string, description?: string) =>
    fetchJSON<ProjectSummary>(`${API_BASE}/projects`, {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),

  update: (slug: string, updates: Partial<ProjectConfig>) =>
    fetchJSON<ProjectConfig>(`${API_BASE}/projects/${slug}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  archive: (slug: string) =>
    fetchJSON<ArchiveResponse>(`${API_BASE}/projects/${slug}`, {
      method: 'DELETE',
    }),
};

// Card endpoints
export const cardsApi = {
  list: (projectSlug: string, lane?: string) =>
    fetchJSON<CardsResponse>(
      `${API_BASE}/projects/${projectSlug}/cards${lane ? `?lane=${lane}` : ''}`
    ),

  get: (projectSlug: string, cardSlug: string) =>
    fetchJSON<Card>(`${API_BASE}/projects/${projectSlug}/cards/${cardSlug}`),

  create: (projectSlug: string, data: CreateCardInput) =>
    fetchJSON<Card>(`${API_BASE}/projects/${projectSlug}/cards`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  archive: (projectSlug: string, cardSlug: string) =>
    fetchJSON<ArchiveResponse>(
      `${API_BASE}/projects/${projectSlug}/cards/${cardSlug}`,
      { method: 'DELETE' }
    ),

  delete: (projectSlug: string, cardSlug: string) =>
    fetchJSON<{ slug: string; deleted: boolean }>(
      `${API_BASE}/projects/${projectSlug}/cards/${cardSlug}?hard=true`,
      { method: 'DELETE' }
    ),

  move: (
    projectSlug: string,
    cardSlug: string,
    lane: string,
    position?: number
  ) =>
    fetchJSON<Card>(
      `${API_BASE}/projects/${projectSlug}/cards/${cardSlug}/move`,
      {
        method: 'PATCH',
        body: JSON.stringify({ lane, position }),
      }
    ),

  reorder: (projectSlug: string, laneSlug: string, order: string[]) =>
    fetchJSON<ReorderResponse>(
      `${API_BASE}/projects/${projectSlug}/lanes/${laneSlug}/order`,
      {
        method: 'PATCH',
        body: JSON.stringify({ order }),
      }
    ),

  update: (projectSlug: string, cardSlug: string, updates: UpdateCardInput) =>
    fetchJSON<Card>(`${API_BASE}/projects/${projectSlug}/cards/${cardSlug}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  listTags: (projectSlug: string) =>
    fetchJSON<TagsResponse>(`${API_BASE}/projects/${projectSlug}/tags`),

  search: (projectSlug: string, query: string) =>
    fetchJSON<SearchResponse>(
      `${API_BASE}/projects/${projectSlug}/cards/search?q=${encodeURIComponent(query)}`
    ),
};

// Task endpoints
export const tasksApi = {
  add: (projectSlug: string, cardSlug: string, text: string) =>
    fetchJSON<TaskToggleResponse>(
      `${API_BASE}/projects/${projectSlug}/cards/${cardSlug}/tasks`,
      {
        method: 'POST',
        body: JSON.stringify({ text }),
      }
    ),

  toggle: (
    projectSlug: string,
    cardSlug: string,
    taskIndex: number,
    checked: boolean
  ) =>
    fetchJSON<TaskToggleResponse>(
      `${API_BASE}/projects/${projectSlug}/cards/${cardSlug}/tasks/${taskIndex}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ checked }),
      }
    ),

  updateText: (
    projectSlug: string,
    cardSlug: string,
    taskIndex: number,
    text: string
  ) =>
    fetchJSON<TaskToggleResponse>(
      `${API_BASE}/projects/${projectSlug}/cards/${cardSlug}/tasks/${taskIndex}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ text }),
      }
    ),

  delete: (
    projectSlug: string,
    cardSlug: string,
    taskIndex: number
  ) =>
    fetchJSON<TaskDeleteResponse>(
      `${API_BASE}/projects/${projectSlug}/cards/${cardSlug}/tasks/${taskIndex}`,
      { method: 'DELETE' }
    ),
};

// Vault artifact endpoints
export const artifactsApi = {
  create: (
    projectSlug: string,
    cardSlug: string,
    data: { content: string; label: string; kind?: CardLink['kind'] }
  ) =>
    fetchJSON<{ link: CardLink; filePath: string }>(
      `${API_BASE}/projects/${projectSlug}/cards/${cardSlug}/artifacts`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),
};

// Link endpoints
export const linksApi = {
  add: (projectSlug: string, cardSlug: string, input: CreateLinkInput) =>
    fetchJSON<{ link: CardLink }>(
      `${API_BASE}/projects/${projectSlug}/cards/${cardSlug}/links`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    ),

  update: (
    projectSlug: string,
    cardSlug: string,
    linkId: string,
    input: UpdateLinkInput
  ) =>
    fetchJSON<{ link: CardLink }>(
      `${API_BASE}/projects/${projectSlug}/cards/${cardSlug}/links/${linkId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      }
    ),

  delete: (projectSlug: string, cardSlug: string, linkId: string) =>
    fetchJSON<{ success: boolean }>(
      `${API_BASE}/projects/${projectSlug}/cards/${cardSlug}/links/${linkId}`,
      { method: 'DELETE' }
    ),
};

// Preferences endpoints
export const preferencesApi = {
  get: () => fetchJSON<Preferences>(`${API_BASE}/preferences`),

  update: (updates: Partial<Preferences>) =>
    fetchJSON<Preferences>(`${API_BASE}/preferences`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
};

// Search (palette) endpoints
export const searchApi = {
  palette: (projectSlug: string, query: string) =>
    fetchJSON<PaletteSearchResponse>(
      `${API_BASE}/projects/${projectSlug}/search?q=${encodeURIComponent(query)}`
    ),

  global: (query: string, projects?: string[]) => {
    const projectsParam = projects?.length
      ? `&projects=${encodeURIComponent(projects.join(','))}`
      : '';
    return fetchJSON<GlobalPaletteSearchResponse>(
      `${API_BASE}/search?q=${encodeURIComponent(query)}${projectsParam}`
    );
  },
};

export { ApiClientError };

// Vault content endpoint (for Diff Viewer)
export type GitState = 'clean' | 'modified' | 'staged' | 'staged-new' | 'modified-staged' | 'untracked' | 'ignored' | 'outside-repo' | 'unknown';
export interface TreeFile { name: string; path: string; updatedAt: string; }
export interface TreeFolder { name: string; path: string; parentPath: string | null; count: number; files: TreeFile[]; }
export interface TreeError { path: string; error: string; }

export const vaultApi = {
  getContent: (relativePath: string): Promise<string> =>
    fetch(`/api/vault/content?path=${encodeURIComponent(relativePath)}`).then((r) => {
      if (!r.ok) throw new Error(`Failed to load file: ${r.status}`);
      return r.text();
    }),

  getFile: async (filePath: string): Promise<{ path: string; content: string; updatedAt: string }> => {
    const content = await fetch(`/api/vault/content?path=${encodeURIComponent(filePath)}`).then((r) => {
      if (!r.ok) throw new Error(`Failed to load file: ${r.status}`);
      return r.text();
    });
    return { path: filePath, content, updatedAt: new Date().toISOString() };
  },

  saveFile: (filePath: string, content: string): Promise<{ ok: boolean; path: string }> =>
    fetchJSON<{ ok: boolean; path: string }>(`/api/vault/file`, {
      method: 'PUT',
      body: JSON.stringify({ path: filePath, content }),
    }),

  getTree: (): Promise<{ folders: TreeFolder[]; errors: TreeError[] }> =>
    fetchJSON<{ folders: TreeFolder[]; errors: TreeError[] }>(`/api/vault/tree`),
};

export const gitApi = {
  getStatus: (filePath: string): Promise<{ path: string; state: GitState }> =>
    fetchJSON<{ path: string; state: GitState }>(`/api/vault/git/status?path=${encodeURIComponent(filePath)}`),

  getStatuses: (paths: string[]): Promise<{ statuses: Record<string, GitState> }> =>
    fetchJSON<{ statuses: Record<string, GitState> }>(`/api/vault/git/statuses`, {
      method: 'POST',
      body: JSON.stringify({ paths }),
    }),

  stage: (filePath: string): Promise<{ ok: boolean; path: string; state: GitState }> =>
    fetchJSON<{ ok: boolean; path: string; state: GitState }>(`/api/vault/git/stage`, {
      method: 'POST',
      body: JSON.stringify({ path: filePath }),
    }),

  unstage: (filePath: string): Promise<{ ok: boolean; path: string; state: GitState }> =>
    fetchJSON<{ ok: boolean; path: string; state: GitState }>(`/api/vault/git/unstage`, {
      method: 'POST',
      body: JSON.stringify({ path: filePath }),
    }),

  discard: (filePath: string): Promise<{ ok: boolean; path: string; state: GitState }> =>
    fetchJSON<{ ok: boolean; path: string; state: GitState }>(`/api/vault/git/discard`, {
      method: 'POST',
      body: JSON.stringify({ path: filePath }),
    }),

  commit: (filePath: string, message: string): Promise<{ ok: boolean; path: string; state: GitState; output: string }> =>
    fetchJSON<{ ok: boolean; path: string; state: GitState; output: string }>(`/api/vault/git/commit`, {
      method: 'POST',
      body: JSON.stringify({ path: filePath, message }),
    }),

  getDiff: (filePath: string, mode: 'working' | 'staged'): Promise<string> =>
    fetch(`/api/vault/git/diff?path=${encodeURIComponent(filePath)}&mode=${mode}`).then((r) => {
      if (!r.ok) throw new Error(`Failed to get diff: ${r.status}`);
      return r.text();
    }),

  getFileAtRef: (filePath: string, ref: string): Promise<string> =>
    fetch(`/api/vault/git/show?path=${encodeURIComponent(filePath)}&ref=${encodeURIComponent(ref)}`).then((r) => {
      if (!r.ok) throw new Error(`Failed to get file at ref ${ref}: ${r.status}`);
      return r.text();
    }),
};

// Public config endpoint — exposes safe server-side config values to the frontend.
// Currently returns artifactBaseUrl so the frontend can detect vault artifact links
// (links whose URL starts with artifactBaseUrl) and show the "Open in Diff Viewer" button.
export const publicConfigApi = {
  get: (): Promise<{ artifactBaseUrl: string | null }> =>
    fetch('/api/config/public').then((r) => r.json()),
};

// ─── Dispatch API ─────────────────────────────────────────────────────────────

export const dispatchApi = {
  /** Start a dispatch for the given card. */
  dispatch: (
    projectSlug: string,
    cardSlug: string,
    request: DispatchRequest
  ): Promise<{ dispatch: DispatchRecord }> =>
    fetchJSON<{ dispatch: DispatchRecord }>(
      `${API_BASE}/projects/${projectSlug}/cards/${cardSlug}/dispatch`,
      { method: 'POST', body: JSON.stringify(request) }
    ),

  /** Get the active or most recent dispatch for a card. */
  getDispatch: (
    projectSlug: string,
    cardSlug: string
  ): Promise<{ dispatch: DispatchRecord | null }> =>
    fetchJSON<{ dispatch: DispatchRecord | null }>(
      `${API_BASE}/projects/${projectSlug}/cards/${cardSlug}/dispatch`
    ),

  /** Cancel a running dispatch. */
  cancel: (
    projectSlug: string,
    cardSlug: string
  ): Promise<{ success: boolean }> =>
    fetchJSON<{ success: boolean }>(
      `${API_BASE}/projects/${projectSlug}/cards/${cardSlug}/dispatch/cancel`,
      { method: 'POST' }
    ),

  /** Get the buffered output for an active dispatch. */
  getOutput: (
    projectSlug: string,
    cardSlug: string
  ): Promise<{ events: CardDispatchOutputData[] }> =>
    fetchJSON<{ events: CardDispatchOutputData[] }>(
      `${API_BASE}/projects/${projectSlug}/cards/${cardSlug}/dispatch/output`
    ),

  /** List all active dispatches across all projects. */
  listActive: (): Promise<{ dispatches: DispatchRecord[] }> =>
    fetchJSON<{ dispatches: DispatchRecord[] }>(`${API_BASE}/dispatches`),
};
