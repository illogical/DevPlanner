import { Elysia, t } from 'elysia';
import { PreferencesService } from '../services/preferences.service';

export const preferencesRoutes = (workspacePath: string) => {
  const preferencesService = new PreferencesService(workspacePath);

  return new Elysia({ prefix: '/api/preferences' })
    .get('/', async () => {
      const preferences = await preferencesService.getPreferences();
      return preferences;
    })
    .patch(
      '/',
      async ({ body }) => {
        const preferences = await preferencesService.updatePreferences(body);
        return preferences;
      },
      {
        body: t.Object({
          lastSelectedProject: t.Optional(t.Union([t.String(), t.Null()])),
          digestAnchor: t.Optional(t.Union([t.String(), t.Null()])),
        }),
      }
    );
};
