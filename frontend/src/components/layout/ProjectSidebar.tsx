import { useEffect, useState, useRef } from 'react';
import { useStore } from '../../store';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { Collapsible } from '../ui/Collapsible';
import { Spinner } from '../ui/Spinner';
import { ProjectSettingsModal } from '../projects/ProjectSettingsModal';
import type { ProjectSummary } from '../../types';

export function ProjectSidebar() {
  const {
    projects,
    activeProjectSlug,
    isLoadingProjects,
    isSidebarOpen,
    loadProjects,
    setActiveProject,
    createProject,
  } = useStore();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [settingsProject, setSettingsProject] = useState<ProjectSummary | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (isFormOpen) {
      const timer = setTimeout(() => nameInputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isFormOpen]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = projectName.trim();
    if (!trimmedName || isCreating) return;

    setIsCreating(true);
    try {
      await createProject(trimmedName, projectDescription.trim() || undefined);
      setProjectName('');
      setProjectDescription('');
      setIsFormOpen(false);
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancelCreate = () => {
    setProjectName('');
    setProjectDescription('');
    setIsFormOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancelCreate();
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => useStore.getState().setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:relative z-30 lg:z-0',
          'h-[calc(100vh-6.5rem)] lg:h-full w-64',
          'bg-gray-900 border-r border-gray-700',
          'transition-transform duration-300 ease-out',
          'flex flex-col',
          isSidebarOpen
            ? 'translate-x-0'
            : '-translate-x-full lg:translate-x-0 lg:w-0 lg:border-0 lg:overflow-hidden'
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            BOARDS
          </h2>
        </div>

        {/* Project list */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoadingProjects ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : projects.length === 0 ? (
            <p className="text-center text-gray-500 py-8 text-sm">
              No projects yet
            </p>
          ) : (
            <nav className="space-y-1">
              {projects.map((project) => (
                <button
                  key={project.slug}
                  onClick={() => setActiveProject(project.slug)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-md',
                    'transition-colors duration-150',
                    'group',
                    activeProjectSlug === project.slug
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-gray-100'
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium truncate">{project.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={cn(
                          'text-xs',
                          activeProjectSlug === project.slug
                            ? 'text-blue-400/70'
                            : 'text-gray-500'
                        )}
                      >
                        {Object.values(project.cardCounts).reduce(
                          (a, b) => a + b,
                          0
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSettingsProject(project);
                        }}
                        title="Project settings"
                        className={cn(
                          'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
                          'p-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700'
                        )}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {project.description && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {project.description}
                    </p>
                  )}
                </button>
              ))}
            </nav>
          )}
        </div>

        {/* Footer with create form + button */}
        <div className="border-t border-gray-700">
          <Collapsible isOpen={isFormOpen}>
            <form onSubmit={handleCreateProject} className="p-4 space-y-3">
              <div>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Project name"
                  disabled={isCreating}
                  className={cn(
                    'w-full bg-gray-800 border border-gray-600 rounded-md',
                    'px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                    'disabled:opacity-50'
                  )}
                />
              </div>
              <div>
                <textarea
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Description (optional)"
                  rows={2}
                  disabled={isCreating}
                  className={cn(
                    'w-full bg-gray-800 border border-gray-600 rounded-md',
                    'px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                    'disabled:opacity-50 resize-none'
                  )}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCancelCreate}
                  disabled={isCreating}
                  className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!projectName.trim() || isCreating}
                  className={cn(
                    'text-xs px-3 py-1 rounded',
                    'bg-blue-600 text-white hover:bg-blue-500',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'transition-colors duration-150'
                  )}
                >
                  {isCreating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </Collapsible>

          <div className="p-4">
            <Button
              variant="secondary"
              size="sm"
              className="w-full justify-center"
              onClick={() => {
                if (isFormOpen) {
                  handleCancelCreate();
                } else {
                  setIsFormOpen(true);
                }
              }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={isFormOpen ? 'M6 18L18 6M6 6l12 12' : 'M12 4v16m8-8H4'}
                />
              </svg>
              {isFormOpen ? 'Cancel' : 'New Project'}
            </Button>
          </div>
        </div>
      </aside>

      {settingsProject && (
        <ProjectSettingsModal
          project={settingsProject}
          onClose={() => setSettingsProject(null)}
        />
      )}
    </>
  );
}
