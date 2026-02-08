import type {
  ProjectSummary,
  ProjectConfig,
  Card,
  CreateCardInput,
  ProjectsResponse,
  CardsResponse,
  TaskToggleResponse,
  ReorderResponse,
  ArchiveResponse,
  Preferences,
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
