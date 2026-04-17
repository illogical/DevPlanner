import { Elysia } from 'elysia';
import { ConfigService } from '../services/config.service';

/**
 * Exposes safe public configuration values to the frontend.
 *
 * `artifactBaseUrl` is the base URL of the artifact viewer (e.g. VaultPad) used
 * to construct links to vault artifact files. The frontend uses this value to:
 *   1. Detect which card links are vault artifact links (by checking if the link
 *      URL starts with artifactBaseUrl).
 *   2. Build the `/diff?left=<path>` URL by stripping the base path prefix from
 *      the vault link's `path` query parameter.
 *
 * Exposing this via an API endpoint keeps configuration centralised on the backend
 * and avoids baking env vars into the frontend bundle at build time.
 */
export const configRoutes = new Elysia({ detail: { tags: ['Config'] } })
  .get('/api/config/public', () => {
    const config = ConfigService.getInstance();
    return {
      artifactBaseUrl: config.artifactBaseUrl ?? null,
    };
  }, {
    detail: { summary: 'Get public config', description: 'Returns safe public configuration values for the frontend.' },
  });
