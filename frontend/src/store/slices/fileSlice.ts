import type { StateCreator } from 'zustand';
import { filesApi } from '../../api/client';
import type { ProjectFileEntry } from '../../types';
import type { DevPlannerStore, FileSlice } from '../types';

export const createFileSlice: StateCreator<
  DevPlannerStore,
  [],
  [],
  FileSlice
> = (set, get) => ({
  projectFiles: [],
  isLoadingFiles: false,
  isUploadingFile: false,
  isFilesPanelOpen: false,

  loadProjectFiles: async () => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    set({ isLoadingFiles: true });
    try {
      const { files } = await filesApi.list(activeProjectSlug);
      set({ projectFiles: files });
    } catch (error) {
      console.error('Failed to load project files:', error);
    } finally {
      set({ isLoadingFiles: false });
    }
  },

  uploadFile: async (file, description, autoAssociateCardSlug) => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    set({ isUploadingFile: true });

    const optimisticFile: ProjectFileEntry = {
      filename: file.name,
      originalName: file.name,
      description: description || '',
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      created: new Date().toISOString(),
      cardSlugs: autoAssociateCardSlug ? [autoAssociateCardSlug] : [],
    };

    set((state) => ({ projectFiles: [optimisticFile, ...state.projectFiles] }));

    try {
      const uploadedFile = await filesApi.upload(activeProjectSlug, file, description);
      get()._recordLocalAction(`file:added:${uploadedFile.filename}`);

      if (autoAssociateCardSlug) {
        get()._recordLocalAction(`file:associated:${uploadedFile.filename}:${autoAssociateCardSlug}`);
        await filesApi.associate(activeProjectSlug, uploadedFile.filename, autoAssociateCardSlug);
        uploadedFile.cardSlugs = [...uploadedFile.cardSlugs, autoAssociateCardSlug];
      }

      set((state) => ({
        projectFiles: [
          uploadedFile,
          ...state.projectFiles.filter(f =>
            f.filename !== optimisticFile.filename && f.filename !== uploadedFile.filename
          ),
        ],
      }));
    } catch (error) {
      console.error('Failed to upload file:', error);
      set((state) => ({
        projectFiles: state.projectFiles.filter(f => f.filename !== optimisticFile.filename),
      }));
      throw error;
    } finally {
      set({ isUploadingFile: false });
    }
  },

  deleteFile: async (filename) => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    get()._recordLocalAction(`file:deleted:${filename}`);
    const previousFiles = get().projectFiles;
    set((state) => ({
      projectFiles: state.projectFiles.filter(f => f.filename !== filename),
    }));

    try {
      await filesApi.delete(activeProjectSlug, filename);
    } catch (error) {
      console.error('Failed to delete file:', error);
      set({ projectFiles: previousFiles });
      throw error;
    }
  },

  updateFileDescription: async (filename, description) => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    get()._recordLocalAction(`file:updated:${filename}`);
    const previousFiles = get().projectFiles;
    set((state) => ({
      projectFiles: state.projectFiles.map(f =>
        f.filename === filename ? { ...f, description } : f
      ),
    }));

    try {
      await filesApi.updateDescription(activeProjectSlug, filename, description);
    } catch (error) {
      console.error('Failed to update file description:', error);
      set({ projectFiles: previousFiles });
      throw error;
    }
  },

  associateFile: async (filename, cardSlug) => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    get()._recordLocalAction(`file:associated:${filename}:${cardSlug}`);
    const previousFiles = get().projectFiles;
    set((state) => ({
      projectFiles: state.projectFiles.map(f =>
        f.filename === filename && !f.cardSlugs.includes(cardSlug)
          ? { ...f, cardSlugs: [...f.cardSlugs, cardSlug] }
          : f
      ),
    }));

    try {
      await filesApi.associate(activeProjectSlug, filename, cardSlug);
    } catch (error) {
      console.error('Failed to associate file:', error);
      set({ projectFiles: previousFiles });
      throw error;
    }
  },

  disassociateFile: async (filename, cardSlug) => {
    const { activeProjectSlug } = get();
    if (!activeProjectSlug) return;

    get()._recordLocalAction(`file:disassociated:${filename}:${cardSlug}`);
    const previousFiles = get().projectFiles;
    set((state) => ({
      projectFiles: state.projectFiles.map(f =>
        f.filename === filename
          ? { ...f, cardSlugs: f.cardSlugs.filter(s => s !== cardSlug) }
          : f
      ),
    }));

    try {
      await filesApi.disassociate(activeProjectSlug, filename, cardSlug);
    } catch (error) {
      console.error('Failed to disassociate file:', error);
      set({ projectFiles: previousFiles });
      throw error;
    }
  },

  toggleFilesPanel: () => {
    set((state) => ({ isFilesPanelOpen: !state.isFilesPanelOpen }));
  },

  setFilesPanelOpen: (open) => {
    set({ isFilesPanelOpen: open });
  },
});
