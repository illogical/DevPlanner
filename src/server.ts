import { Elysia } from 'elysia';
import { projectRoutes } from './routes/projects';
import { cardRoutes } from './routes/cards';
import { taskRoutes } from './routes/tasks';
import { fileRoutes } from './routes/files';
import { preferencesRoutes } from './routes/preferences';
import { websocketRoutes } from './routes/websocket';
import { historyRoutes } from './routes/history';
import { activityRoutes } from './routes/activity';
import { statsRoutes } from './routes/stats';
import { ConfigService } from './services/config.service';
import { WebSocketService } from './services/websocket.service';
import { FileWatcherService } from './services/file-watcher.service';
import { HistoryService } from './services/history.service';

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
  .use(fileRoutes(workspacePath))
  .use(preferencesRoutes(workspacePath))
  .use(websocketRoutes)
  .use(historyRoutes)
  .use(activityRoutes(workspacePath))
  .use(statsRoutes(workspacePath))
  .listen(port);

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
