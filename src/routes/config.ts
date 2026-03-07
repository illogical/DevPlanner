import { Elysia } from 'elysia';
import { ConfigService } from '../services/config.service';

export const configRoutes = new Elysia()
  .get('/api/config/public', () => {
    const config = ConfigService.getInstance();
    return {
      obsidianBaseUrl: config.obsidianBaseUrl ?? null,
    };
  });
