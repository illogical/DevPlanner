import type { StateCreator } from 'zustand';
import type { DevPlannerStore, FileBrowserSlice } from '../types';
import { vaultApi } from '../../api/client';

const RECENT_FILES_STORAGE_KEY = 'devplanner.recentFilesOpen';

function loadRecentFilesOpen(): boolean {
  try {
    const stored = localStorage.getItem(RECENT_FILES_STORAGE_KEY);
    if (stored !== null) return stored === 'true';
  } catch { /* ignore storage errors */ }
  return true; // default: open
}

export const createFileBrowserSlice: StateCreator<DevPlannerStore, [], [], FileBrowserSlice> = (set, get) => ({
  fbIsOpen: false,
  fbFolders: [],
  fbActiveRoot: null,
  fbActivePath: '',
  fbIsLoading: false,
  fbError: null,
  recentFilesOpen: loadRecentFilesOpen(),

  toggleFileBrowser: () => set((s) => ({ fbIsOpen: !s.fbIsOpen })),
  openFileBrowser: () => set({ fbIsOpen: true }),
  closeFileBrowser: () => set({ fbIsOpen: false }),

  loadFileTree: async () => {
    set({ fbIsLoading: true, fbError: null });
    try {
      const result = await vaultApi.getTree();
      set({ fbFolders: result.folders, fbIsLoading: false });
    } catch (err: any) {
      set({ fbError: err.message ?? 'Failed to load file tree', fbIsLoading: false });
    }
  },

  setFbActiveRoot: (root: string | null) => set({ fbActiveRoot: root, fbActivePath: root ?? '' }),

  setFbActivePath: (path: string) => set({ fbActivePath: path }),

  focusCurrentFile: () => {
    const { docFilePath, fbFolders } = get();
    if (!docFilePath) return;
    for (const folder of fbFolders) {
      const file = folder.files.find((f) => f.path === docFilePath);
      if (file) {
        const rootFolder = fbFolders.find((f) => f.parentPath === null && (folder.path === f.path || folder.path.startsWith(f.path + '/')));
        set({
          fbActiveRoot: rootFolder?.path ?? folder.path,
          fbActivePath: folder.path,
        });
        return;
      }
    }
  },

  toggleRecentFiles: () => {
    const next = !get().recentFilesOpen;
    try { localStorage.setItem(RECENT_FILES_STORAGE_KEY, String(next)); } catch { /* ignore */ }
    set({ recentFilesOpen: next });
  },
});
