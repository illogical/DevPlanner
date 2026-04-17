import { Elysia } from 'elysia';
import { openapi } from '@elysiajs/openapi';
import { resolve, join, sep } from 'path';
import { projectRoutes } from './routes/projects';
import { cardRoutes } from './routes/cards';
import { taskRoutes } from './routes/tasks'; // task edit/delete support
import { artifactRoutes } from './routes/artifacts';
import { linkRoutes } from './routes/links';
import { preferencesRoutes } from './routes/preferences';
import { websocketRoutes } from './routes/websocket';
import { historyRoutes } from './routes/history';
import { activityRoutes } from './routes/activity';
import { statsRoutes } from './routes/stats';
import { backupRoutes } from './routes/backup';
import { searchRoutes } from './routes/search';
import { vaultRoutes } from './routes/vault';
import { vaultGitRoutes } from './routes/vault-git';
import { configRoutes } from './routes/config';
import { dispatchRoutes } from './routes/dispatch';
import { cardContextRoutes } from './routes/card-context';
import { ConfigService } from './services/config.service';
import { WebSocketService } from './services/websocket.service';
import { FileWatcherService } from './services/file-watcher.service';
import { HistoryService } from './services/history.service';
import { ResourceBusyError } from './utils/resource-lock';

// Load and validate configuration
const config = ConfigService.getInstance();
const workspacePath = config.workspacePath;
const port = config.port;

// Initialize services
WebSocketService.getInstance();
HistoryService.getInstance();

// Initialize and start FileWatcher service
const fileWatcher = FileWatcherService.getInstance();
fileWatcher.start();

const app = new Elysia()
  .use(openapi({
    path: '/swagger',
    documentation: {
      info: {
        title: 'DevPlanner API',
        description:
          'File-based Kanban board API. All project data is stored as plain-text Markdown ' +
          'and JSON files — no database. Provides CRUD for projects, cards, tasks, links, ' +
          'vault artifacts, and more. A separate MCP server (stdio transport) exposes the ' +
          'same functionality to AI agents — run `bun run mcp` for details.',
        version: '1.0.0',
      },
      tags: [
        { name: 'Projects', description: 'Project CRUD and management' },
        { name: 'Cards', description: 'Card CRUD, search, and lane management' },
        { name: 'Tasks', description: 'Checklist item management within cards' },
        { name: 'Links', description: 'URL link management on cards' },
        { name: 'Artifacts', description: 'Vault artifact creation and linking' },
        { name: 'History', description: 'Per-project activity log' },
        { name: 'Activity', description: 'Cross-project activity feed' },
        { name: 'Stats', description: 'Project health statistics' },
        { name: 'Search', description: 'Full-text search across projects and cards' },
        { name: 'Preferences', description: 'Global workspace preferences' },
        { name: 'Backup', description: 'Workspace backup management' },
        { name: 'Vault', description: 'Vault artifact file operations' },
        { name: 'Vault Git', description: 'Git operations on vault artifacts' },
        { name: 'Config', description: 'Public configuration' },
        { name: 'Dispatch', description: 'AI agent dispatch (Claude CLI / Gemini CLI)' },
        { name: 'Card Context', description: 'Full card context for AI agents' },
      ],
    },
    exclude: {
      paths: [/^\/swagger/, /^\/openapi/],
      methods: ['OPTIONS'],
    },
  }))
  .onError(({ code, error, set }) => {
    console.error('Error:', error);

    if (code === 'NOT_FOUND') {
      set.status = 404;
      return {
        error: 'not_found',
        message: 'Resource not found',
      };
    }

    if (code === 'VALIDATION') {
      set.status = 400;
      return {
        error: 'validation_error',
        message: error.message,
      };
    }

    // Handle ResourceBusyError (lock timeout)
    if (error instanceof ResourceBusyError) {
      set.status = 503;
      set.headers['Retry-After'] = '1';
      return {
        error: 'RESOURCE_BUSY',
        message: error.message,
        retryAfterMs: error.retryAfterMs,
      };
    }

    // Handle custom errors thrown by services
    if (error.message.includes('not found')) {
      set.status = 404;
      return {
        error: 'not_found',
        message: error.message,
      };
    }

    if (
      error.message.includes('required') ||
      error.message.includes('already exists') ||
      error.message.includes('Invalid')
    ) {
      set.status = 400;
      return {
        error: 'bad_request',
        message: error.message,
      };
    }

    set.status = 500;
    return {
      error: 'internal_server_error',
      message: 'An unexpected error occurred',
    };
  })
  .use(projectRoutes(workspacePath))
  .use(cardRoutes(workspacePath))
  .use(taskRoutes(workspacePath))
  .use(linkRoutes(workspacePath))
  .use(artifactRoutes(workspacePath))
  .use(preferencesRoutes(workspacePath))
  .use(websocketRoutes)
  .use(historyRoutes)
  .use(activityRoutes(workspacePath))
  .use(statsRoutes(workspacePath))
  .use(backupRoutes(workspacePath, config.backupDir))
  .use(searchRoutes(workspacePath))
  .use(vaultRoutes)
  .use(vaultGitRoutes)
  .use(configRoutes)
  .use(dispatchRoutes(workspacePath))
  .use(cardContextRoutes(workspacePath));

// In production (Docker), serve the pre-built frontend on the same port as the API.
// The frontend must be built first (`bun run build`) — the Dockerfile does this automatically.
// IMPORTANT: this wildcard must be registered after all /api routes so it only
// catches non-API paths (Elysia matches registered routes in order).
if (process.env.NODE_ENV === 'production') {
  const distPath = resolve('./frontend/dist');
  app.get('*', async ({ request }) => {
    const url = new URL(request.url);
    // Strip leading slashes so path.join doesn't treat the segment as absolute
    const pathname = url.pathname.replace(/^\/+/, '');
    const safePath = resolve(join(distPath, pathname));
    // Guard against path-traversal attacks (use path.sep for cross-platform safety)
    if (!safePath.startsWith(distPath + sep) && safePath !== distPath) {
      return new Response('Not Found', { status: 404 });
    }
    const file = Bun.file(safePath);
    if (await file.exists()) {
      return file;
    }
    // Fall back to index.html for client-side (SPA) routing
    return Bun.file(join(distPath, 'index.html'));
  });
}

app.listen(port);

console.log(`🚀 DevPlanner server running at http://localhost:${port}`);
console.log(`📁 Workspace: ${workspacePath}`);

// Graceful shutdown handler
const shutdown = () => {
  console.log('\n⏹️  Shutting down gracefully...');
  fileWatcher.stop();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
