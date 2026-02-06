import { Elysia } from 'elysia';
import { projectRoutes } from './routes/projects';
import { cardRoutes } from './routes/cards';
import { taskRoutes } from './routes/tasks';
import { ConfigService } from './services/config.service';

// Load and validate configuration
const config = ConfigService.getInstance();
const workspacePath = config.workspacePath;
const port = config.port;

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
  .listen(port);

console.log(`🚀 DevPlanner server running at http://localhost:${port}`);
console.log(`📁 Workspace: ${workspacePath}`);
