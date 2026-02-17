import type {
  ProjectSummary,
  ProjectConfig,
  Card,
  CreateCardInput,
  UpdateCardInput,
  ProjectsResponse,
  CardsResponse,
  TaskToggleResponse,
  ReorderResponse,
  ArchiveResponse,
  TagsResponse,
  Preferences,
  SearchResponse,
  ProjectFileEntry,
  FilesResponse,
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
};

// File endpoints
export const filesApi = {
  list: (projectSlug: string) =>
    fetchJSON<FilesResponse>(`${API_BASE}/projects/${projectSlug}/files`),

  get: (projectSlug: string, filename: string) =>
    fetchJSON<ProjectFileEntry>(
      `${API_BASE}/projects/${projectSlug}/files/${encodeURIComponent(filename)}`
    ),

  listForCard: (projectSlug: string, cardSlug: string) =>
    fetchJSON<FilesResponse>(
      `${API_BASE}/projects/${projectSlug}/cards/${cardSlug}/files`
    ),

  upload: async (
    projectSlug: string,
    file: File,
    description?: string
  ): Promise<ProjectFileEntry> => {
    const formData = new FormData();
    formData.append('file', file);
    if (description) {
      formData.append('description', description);
    }

    const response = await fetch(
      `${API_BASE}/projects/${projectSlug}/files`,
      {
        method: 'POST',
        body: formData,
        // Do NOT set Content-Type header - the browser automatically sets it to
        // 'multipart/form-data' with the correct boundary parameter required for file uploads
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ApiClientError(
        error.message || `HTTP ${response.status}`,
        response.status,
        error.expected
      );
    }

    return response.json();
  },

  delete: (projectSlug: string, filename: string) =>
    fetchJSON<{ associatedCards: string[] }>(
      `${API_BASE}/projects/${projectSlug}/files/${encodeURIComponent(filename)}`,
      {
        method: 'DELETE',
      }
    ),

  updateDescription: (
    projectSlug: string,
    filename: string,
    description: string
  ) =>
    fetchJSON<ProjectFileEntry>(
      `${API_BASE}/projects/${projectSlug}/files/${encodeURIComponent(filename)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ description }),
      }
    ),

  associate: (projectSlug: string, filename: string, cardSlug: string) =>
    fetchJSON<ProjectFileEntry>(
      `${API_BASE}/projects/${projectSlug}/files/${encodeURIComponent(filename)}/associate`,
      {
        method: 'POST',
        body: JSON.stringify({ cardSlug }),
      }
    ),

  disassociate: (projectSlug: string, filename: string, cardSlug: string) =>
    fetchJSON<ProjectFileEntry>(
      `${API_BASE}/projects/${projectSlug}/files/${encodeURIComponent(filename)}/associate/${cardSlug}`,
      {
        method: 'DELETE',
      }
    ),

  getDownloadUrl: (projectSlug: string, filename: string) =>
    `${API_BASE}/projects/${projectSlug}/files/${encodeURIComponent(filename)}/download`,
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

export { ApiClientError };
