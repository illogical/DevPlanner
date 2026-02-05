import { Elysia } from 'elysia';
import { existsSync } from 'fs';
import { projectRoutes } from './routes/projects';
import { cardRoutes } from './routes/cards';
import { taskRoutes } from './routes/tasks';

// Validate workspace path
const workspacePath = process.env.DEVPLANNER_WORKSPACE;

if (!workspacePath) {
  console.error('Error: DEVPLANNER_WORKSPACE environment variable is not set');
  console.error('Please set it to the absolute path of your workspace directory');
  process.exit(1);
}

if (!existsSync(workspacePath)) {
  console.error(`Error: Workspace directory does not exist: ${workspacePath}`);
  console.error('Please create the directory or set DEVPLANNER_WORKSPACE to a valid path');
  process.exit(1);
}

const port = process.env.PORT ? parseInt(process.env.PORT) : 17103;

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
