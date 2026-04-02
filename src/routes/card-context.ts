import { Elysia } from 'elysia';
import { CardService } from '../services/card.service';
import { VaultService } from '../services/vault.service';
import { ConfigService } from '../services/config.service';
import { buildCardContext } from '../utils/card-context';

export const cardContextRoutes = (workspacePath: string) => {
  const cardService = new CardService(workspacePath);

  return new Elysia()
    .get(
      '/api/projects/:projectSlug/cards/:cardSlug/context',
      async ({ params, set }) => {
        let card;
        try {
          card = await cardService.getCard(params.projectSlug, params.cardSlug);
        } catch {
          set.status = 404;
          return { error: 'not_found', message: `Card not found: ${params.cardSlug}` };
        }

        const config = ConfigService.getInstance();
        const vaultService =
          config.artifactBasePath && config.artifactBaseUrl
            ? new VaultService(workspacePath, config.artifactBasePath, config.artifactBaseUrl)
            : null;

        return await buildCardContext(card, vaultService, config.artifactBaseUrl ?? null);
      }
    );
};
