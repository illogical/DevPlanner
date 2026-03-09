import type { StateCreator } from 'zustand';
import type { DevPlannerStore, DocSlice } from '../types';
import { vaultApi } from '../../api/client';

export const createDocSlice: StateCreator<DevPlannerStore, [], [], DocSlice> = (set, get) => ({
  docFilePath: null,
  docContent: null,
  docIsLoading: false,
  docError: null,
  docEditContent: null,
  docLastSavedContent: null,
  docIsDirty: false,
  docSaveState: 'idle',

  loadDocFile: async (filePath: string) => {
    set({ docIsLoading: true, docError: null, docFilePath: filePath });
    try {
      const result = await vaultApi.getFile(filePath);
      set({
        docContent: result.content,
        docEditContent: result.content,
        docLastSavedContent: result.content,
        docIsLoading: false,
        docIsDirty: false,
        docSaveState: 'idle',
      });
    } catch (err: any) {
      set({ docError: err.message ?? 'Failed to load file', docIsLoading: false });
    }
  },

  clearDoc: () => {
    set({
      docFilePath: null,
      docContent: null,
      docEditContent: null,
      docLastSavedContent: null,
      docIsDirty: false,
      docSaveState: 'idle',
      docError: null,
    });
  },

  setDocEditContent: (content: string) => {
    const { docLastSavedContent } = get();
    set({ docEditContent: content, docIsDirty: content !== docLastSavedContent });
  },

  saveDocFile: async () => {
    const { docFilePath, docEditContent } = get();
    if (!docFilePath || docEditContent === null) return;
    set({ docSaveState: 'saving' });
    try {
      await vaultApi.saveFile(docFilePath, docEditContent);
      set({
        docContent: docEditContent,
        docLastSavedContent: docEditContent,
        docIsDirty: false,
        docSaveState: 'saved',
      });
      setTimeout(() => {
        if (get().docSaveState === 'saved') set({ docSaveState: 'idle' });
      }, 2000);
    } catch (err: any) {
      set({ docSaveState: 'error' });
    }
  },

  navigateToFile: (filePath: string, _mode: 'push' | 'replace' = 'push') => {
    get().loadDocFile(filePath);
  },
});
