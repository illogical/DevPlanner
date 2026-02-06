import { useEffect } from 'react';
import { useStore } from '../../store';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';

export function ProjectSidebar() {
  const {
    projects,
    activeProjectSlug,
    isLoadingProjects,
    isSidebarOpen,
    loadProjects,
    setActiveProject,
  } = useStore();

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

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
          'h-[calc(100vh-3.5rem)] w-64',
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
            Projects
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
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{project.name}</span>
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

        {/* Footer with create button */}
        <div className="p-4 border-t border-gray-700">
          <Button
            variant="secondary"
            size="sm"
            className="w-full justify-center"
            onClick={() => {
              // TODO: Open create project modal
              console.log('Create project');
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Project
          </Button>
        </div>
      </aside>
    </>
  );
}
