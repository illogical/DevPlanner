/**
 * store/types.ts
 *
 * Central type definitions for the Zustand store.
 * Defines all slice interfaces and assembles the combined DevPlannerStore type.
 * Slice creator files import from here to avoid circular dependencies.
 */
import type {
  ProjectSummary,
  CardSummary,
  Card,
  LaneConfig,
  HistoryEvent,
  UpdateCardInput,
  CardCreatedData,
  CardUpdatedData,
  CardMovedData,
  CardDeletedData,
  TaskToggledData,
  LaneReorderedData,
  ProjectUpdatedData,
  ProjectDeletedData,
  SearchResult,
  CreateLinkInput,
  UpdateLinkInput,
  CardLink,
  LinkAddedData,
  LinkUpdatedData,
  LinkDeletedData,
  PaletteSearchResult,
  PaletteFilterTab,
  DetailScrollTarget,
} from '../types';

// ─── Change Indicator types (used by UISlice + animations) ───────────────────

export type ChangeIndicatorType =
  | 'task:toggled'
  | 'card:created'
  | 'card:moved'
  | 'card:updated';

export interface ChangeIndicator {
  id: string;
  type: ChangeIndicatorType;
  timestamp: number;
  cardSlug: string;
  lane?: string;
  taskIndex?: number;
  expiresAt: number;
}

// ─── Slice type definitions ──────────────────────────────────────────────────

export interface ProjectSlice {
  isLoadingProjects: boolean;
  isLoadingCards: boolean;
  projects: ProjectSummary[];
  activeProjectSlug: string | null;
  cardsByLane: Record<string, CardSummary[]>;
  projectTags: string[];

  loadProjects: () => Promise<void>;
  createProject: (name: string, description?: string) => Promise<void>;
  archiveProject: (slug: string) => Promise<void>;
  setActiveProject: (slug: string, skipHistory?: boolean) => void;
  loadCards: () => Promise<void>;
  createCard: (title: string, lane?: string) => Promise<void>;
  archiveCard: (cardSlug: string) => Promise<void>;
  deleteCard: (cardSlug: string) => Promise<void>;
  moveCard: (cardSlug: string, targetLane: string, position?: number) => Promise<void>;
  reorderCards: (laneSlug: string, order: string[]) => Promise<void>;
  loadProjectTags: () => Promise<void>;
}

export interface CardSlice {
  activeCard: Card | null;
  isDetailPanelOpen: boolean;
  isLoadingCardDetail: boolean;

  openCardDetail: (cardSlug: string, skipHistory?: boolean) => Promise<void>;
  closeCardDetail: (skipHistory?: boolean) => void;
  updateCard: (cardSlug: string, updates: UpdateCardInput) => Promise<void>;
  toggleTask: (cardSlug: string, taskIndex: number, checked: boolean) => Promise<void>;
  addTask: (cardSlug: string, text: string) => Promise<void>;
  updateTaskText: (cardSlug: string, taskIndex: number, text: string) => Promise<void>;
  deleteTask: (cardSlug: string, taskIndex: number) => Promise<void>;
  addLink: (cardSlug: string, input: CreateLinkInput) => Promise<void>;
  updateLink: (cardSlug: string, linkId: string, input: UpdateLinkInput) => Promise<void>;
  deleteLink: (cardSlug: string, linkId: string) => Promise<void>;
  createVaultArtifact: (cardSlug: string, file: File, label: string, kind: CardLink['kind']) => Promise<void>;
}

export interface UISlice {
  expandedCardTasks: Set<string>;
  laneCollapsedState: Record<string, boolean>;
  isSidebarOpen: boolean;
  isActivitySidebarOpen: boolean;
  isActivityPanelOpen: boolean;
  changeIndicators: Map<string, ChangeIndicator>;
  lastDocMode: 'viewer' | 'editor';

  toggleCardTaskExpansion: (cardSlug: string) => void;
  toggleLaneCollapsed: (laneSlug: string) => void;
  initializeLaneState: (lanes: Record<string, LaneConfig>) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleActivitySidebar: () => void;
  toggleActivityPanel: () => void;
  setActivityPanelOpen: (open: boolean) => void;
  addChangeIndicator: (indicator: Omit<ChangeIndicator, 'id' | 'timestamp' | 'expiresAt'>) => string;
  removeChangeIndicator: (id: string) => void;
  clearExpiredIndicators: () => void;
  getCardIndicators: (cardSlug: string) => ChangeIndicator[];
  getTaskIndicator: (cardSlug: string, taskIndex: number) => ChangeIndicator | null;
  setLastDocMode: (mode: 'viewer' | 'editor') => void;
}

export interface HistorySlice {
  historyEvents: HistoryEvent[];

  loadHistory: () => Promise<void>;
  addHistoryEvent: (event: HistoryEvent) => void;
}

export interface SearchSlice {
  searchQuery: string;
  searchResults: SearchResult[];
  isSearching: boolean;
  isPaletteOpen: boolean;
  paletteQuery: string;
  paletteResults: PaletteSearchResult[];
  isPaletteSearching: boolean;
  isPaletteGlobal: boolean;
  paletteTab: PaletteFilterTab;
  selectedPaletteIndex: number;
  detailScrollTarget: DetailScrollTarget | null;

  setSearchQuery: (query: string) => void;
  clearSearch: () => void;
  isCardHighlighted: (cardSlug: string) => boolean;
  getMatchedTaskIndices: (cardSlug: string) => number[];
  openPalette: () => void;
  closePalette: () => void;
  setPaletteQuery: (query: string) => void;
  setPaletteTab: (tab: PaletteFilterTab) => void;
  togglePaletteGlobal: () => void;
  setSelectedPaletteIndex: (index: number) => void;
  activatePaletteResult: (result: PaletteSearchResult) => Promise<void>;
  setDetailScrollTarget: (target: DetailScrollTarget | null) => void;
}

export interface WSSlice {
  wsConnected: boolean;
  wsReconnecting: boolean;
  _recentLocalActions: Map<string, number>;
  _lastRefetchTime: Map<string, number>;
  _creatingCards: Set<string>;
  _lastLoadCardsTime: number;

  setWsConnected: (connected: boolean) => void;
  setWsReconnecting: (reconnecting: boolean) => void;
  _recordLocalAction: (key: string) => void;
  _isRecentLocalAction: (key: string) => boolean;
  _debouncedLoadCards: () => void;

  wsHandleCardCreated?: (data: CardCreatedData) => void;
  wsHandleCardUpdated?: (data: CardUpdatedData) => void;
  wsHandleCardMoved?: (data: CardMovedData) => void;
  wsHandleCardDeleted?: (data: CardDeletedData) => void;
  wsHandleTaskToggled?: (data: TaskToggledData) => void;
  wsHandleLaneReordered?: (data: LaneReorderedData) => void;
  wsHandleProjectUpdated?: (data: ProjectUpdatedData) => void;
  wsHandleProjectDeleted?: (data: ProjectDeletedData) => void;
  wsHandleLinkAdded?: (data: LinkAddedData) => void;
  wsHandleLinkUpdated?: (data: LinkUpdatedData) => void;
  wsHandleLinkDeleted?: (data: LinkDeletedData) => void;
}

// ─── Doc Slice ───────────────────────────────────────────────────────────────

export type GitState =
  | 'clean'
  | 'modified'
  | 'staged'
  | 'modified-staged'
  | 'untracked'
  | 'ignored'
  | 'outside-repo'
  | 'unknown';

export interface TreeFile { name: string; path: string; updatedAt: string; }
export interface TreeFolder { name: string; path: string; parentPath: string | null; count: number; files: TreeFile[]; }
export interface TreeError { path: string; error: string; }

export interface DocSlice {
  docFilePath: string | null;
  docContent: string | null;
  docIsLoading: boolean;
  docError: string | null;
  docEditContent: string | null;
  docLastSavedContent: string | null;
  docIsDirty: boolean;
  docSaveState: 'idle' | 'saving' | 'saved' | 'error';

  loadDocFile: (filePath: string) => Promise<void>;
  clearDoc: () => void;
  setDocEditContent: (content: string) => void;
  saveDocFile: () => Promise<void>;
  /** mode='push' records history via navSlice; mode='replace' skips history (used by back/forward) */
  navigateToFile: (filePath: string, mode?: 'push' | 'replace') => void;
}

// ─── File Browser Slice ──────────────────────────────────────────────────────

export interface FileBrowserSlice {
  fbIsOpen: boolean;
  fbFolders: TreeFolder[];
  fbActiveRoot: string | null;
  fbActivePath: string;
  fbIsLoading: boolean;
  fbError: string | null;

  toggleFileBrowser: () => void;
  openFileBrowser: () => void;
  closeFileBrowser: () => void;
  loadFileTree: () => Promise<void>;
  setFbActiveRoot: (root: string | null) => void;
  setFbActivePath: (path: string) => void;
  focusCurrentFile: () => void;
}

// ─── Git Slice ───────────────────────────────────────────────────────────────

export interface GitSlice {
  gitStatuses: Record<string, GitState>;
  gitCurrentState: GitState | null;
  gitIsLoading: boolean;
  gitCommitPanelOpen: boolean;
  gitCommitMessage: string;
  gitActionLoading: boolean;
  gitRefreshInterval: number;

  refreshGitStatus: (filePath: string) => Promise<void>;
  refreshGitStatuses: (paths: string[]) => Promise<void>;
  stageFile: (filePath: string) => Promise<void>;
  unstageFile: (filePath: string) => Promise<void>;
  discardUnstaged: (filePath: string) => Promise<void>;
  commitFile: (filePath: string, message: string) => Promise<void>;
  setGitCommitMessage: (msg: string) => void;
  toggleCommitPanel: () => void;
  setGitRefreshInterval: (seconds: number) => void;
}

// ─── Nav Slice ───────────────────────────────────────────────────────────────

export type NavEntry =
  | { type: 'kanban'; cardSlug?: string; projectSlug?: string }
  | { type: 'file'; filePath: string };

export interface NavSlice {
  navBackStack: NavEntry[];
  navForwardStack: NavEntry[];

  pushNavEntry: (entry: NavEntry) => void;
  clearNavForward: () => void;
  consumeNavBack: () => NavEntry | undefined;
  consumeNavForward: () => NavEntry | undefined;
}

// ─── Combined store type ─────────────────────────────────────────────────────

export type DevPlannerStore =
  ProjectSlice &
  CardSlice &
  UISlice &
  HistorySlice &
  SearchSlice &
  WSSlice &
  DocSlice &
  FileBrowserSlice &
  GitSlice &
  NavSlice;
