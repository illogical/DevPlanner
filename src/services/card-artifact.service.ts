/**
 * CardArtifactService — resolve, read, and update card-attached artifacts.
 *
 * This is the single shared resolver used by both the REST API and the MCP server.
 * Terminology: "card artifact" = a DevPlanner-managed markdown file attached to a
 * card as a link. The backing implementation (VaultService / local filesystem) is
 * intentionally not exposed in agent-facing names.
 *
 * Supported artifact reference styles (most → least preferred):
 *   - link.id  (stable UUID — always prefer when known)
 *   - viewer/editor URL  (the URL the user has from a prior artifact create)
 *   - relative vault path  (fallback for backward compat)
 *   - label  (only when unique on the card)
 *
 * All path traversal protection lives inside VaultService — this service does not
 * need to repeat it.
 */

import { ProjectService } from './project.service.js';
import { CardService } from './card.service.js';
import { LinkService } from './link.service.js';
import { VaultService } from './vault.service.js';
import { WebSocketService } from './websocket.service.js';
import { recordAndBroadcastHistory } from '../utils/history-helper.js';
import { extractVaultPath } from '../utils/card-context.js';
import type { CardLink } from '../types/index.js';

// ============================================================================
// Public types
// ============================================================================

export interface ResolvedCardArtifact {
  projectSlug: string;
  cardSlug: string;
  cardId: string | null;
  cardTitle: string;
  link: CardLink;
  relativePath: string;
  viewerUrl: string;
  hash: string;
  sizeBytes: number;
  lineCount: number;
  content?: string;
}

export interface CardArtifactUpdateResult {
  projectSlug: string;
  cardSlug: string;
  cardId: string | null;
  link: CardLink;
  relativePath: string;
  viewerUrl: string;
  hash: string;
  updatedAt: string;
}

export interface AmbiguousCandidate {
  linkId: string;
  label: string;
  url: string;
  updatedAt: string;
}

// ============================================================================
// Internal types
// ============================================================================

interface ResolvedCard {
  projectSlug: string;
  cardSlug: string;
  cardId: string | null;
  cardTitle: string;
  links: CardLink[];
}

// ============================================================================
// CardArtifactService
// ============================================================================

export class CardArtifactService {
  constructor(
    private readonly vaultService: VaultService,
    private readonly linkService: LinkService,
    private readonly cardService: CardService,
    private readonly projectService: ProjectService,
    private readonly artifactBaseUrl: string
  ) {}

  // --------------------------------------------------------------------------
  // Public: resolveCardArtifact
  // --------------------------------------------------------------------------

  /**
   * Resolve an artifact reference to a fully-populated ResolvedCardArtifact.
   *
   * Input priority:
   *   1. url     — viewer/editor URL for the artifact
   *   2. cardId  — scans all projects to locate the card
   *   3. projectSlug + cardSlug  — direct card reference
   *
   * artifactRef is matched (in order): link.id → path → URL → unique label.
   */
  async resolveCardArtifact(
    input: {
      url?: string;
      cardId?: string;
      projectSlug?: string;
      cardSlug?: string;
      artifactRef?: string;
    },
    includeContent = false
  ): Promise<ResolvedCardArtifact> {
    if (input.url) {
      return this._resolveByUrl(input.url, includeContent);
    }

    const resolved = await this._resolveCardRef(input);
    const vaultLinks = resolved.links.filter(l => l.url.startsWith(this.artifactBaseUrl));

    let matched: CardLink;

    if (input.artifactRef) {
      matched = this._matchArtifactRef(input.artifactRef, vaultLinks, resolved.links, resolved.cardId ?? resolved.cardSlug);
    } else if (vaultLinks.length === 1) {
      matched = vaultLinks[0];
    } else if (vaultLinks.length === 0) {
      throw {
        error: 'ARTIFACT_NOT_FOUND',
        message: `Card "${resolved.cardId ?? resolved.cardSlug}" has no local card artifacts attached.`,
        available: resolved.links.map(l => ({ linkId: l.id, label: l.label, url: l.url })),
      };
    } else {
      throw {
        error: 'AMBIGUOUS_ARTIFACT_REF',
        message: `Card "${resolved.cardId ?? resolved.cardSlug}" has ${vaultLinks.length} artifacts. Specify artifactRef (link ID or unique label).`,
        candidates: vaultLinks.map(l => ({
          linkId: l.id,
          label: l.label,
          url: l.url,
          updatedAt: l.updatedAt,
        })) as AmbiguousCandidate[],
      };
    }

    return this._buildResolved(resolved, matched, includeContent);
  }

  // --------------------------------------------------------------------------
  // Public: updateCardArtifact
  // --------------------------------------------------------------------------

  /**
   * Update an existing card artifact in place.
   *
   * Writes new content to the same backing file (viewer URL stays valid).
   * Optionally updates link label / kind via LinkService.
   * Broadcasts link:updated WebSocket event and records history.
   */
  async updateCardArtifact(input: {
    projectSlug: string;
    cardSlug: string;
    cardId: string | null;
    link: CardLink;
    relativePath: string;
    content?: string;
    label?: string;
    kind?: string;
    expectedHash?: string;
  }): Promise<CardArtifactUpdateResult> {
    const { projectSlug, cardSlug, link, relativePath } = input;

    // --- Optional optimistic concurrency check ---
    if (input.expectedHash !== undefined) {
      const currentContent = await this.vaultService.readArtifactContent(relativePath);
      const currentHash = this.vaultService.computeContentHash(currentContent);
      if (currentHash !== input.expectedHash) {
        throw {
          error: 'ARTIFACT_CONFLICT',
          message: 'Artifact content changed since it was last read. Re-read the artifact and retry with the current hash.',
          currentHash,
          suggestedNextCall: {
            tool: 'read_card_artifact',
            input: { cardId: input.cardId, artifactRef: link.id },
          },
        };
      }
    }

    // --- Write new content ---
    if (input.content !== undefined) {
      await this.vaultService.writeArtifactContent(relativePath, input.content);
    }

    // --- Update link metadata and/or bump updatedAt ---
    const linkUpdate: Record<string, string> = {};
    if (input.label !== undefined) linkUpdate.label = input.label;
    if (input.kind !== undefined) linkUpdate.kind = input.kind;
    const updatedLink = await this.linkService.updateLink(projectSlug, cardSlug, link.id, linkUpdate as any);

    // --- Broadcast WebSocket event ---
    const wsService = WebSocketService.getInstance();
    wsService.broadcast(projectSlug, {
      type: 'event',
      event: {
        type: 'link:updated',
        projectSlug,
        timestamp: new Date().toISOString(),
        data: { cardSlug, link: updatedLink },
      },
    });

    // --- Record history ---
    recordAndBroadcastHistory(
      projectSlug,
      'link:updated',
      `Artifact "${updatedLink.label}" updated on card "${cardSlug}"`,
      { cardSlug, linkId: link.id, label: updatedLink.label }
    );

    // --- Compute hash of new content ---
    const finalContent = input.content !== undefined
      ? input.content
      : await this.vaultService.readArtifactContent(relativePath);
    const hash = this.vaultService.computeContentHash(finalContent);

    return {
      projectSlug,
      cardSlug,
      cardId: input.cardId,
      link: updatedLink,
      relativePath,
      viewerUrl: updatedLink.url,
      hash,
      updatedAt: updatedLink.updatedAt,
    };
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Resolve a card artifact from a viewer/editor URL.
   * Tries fast path (infer project+card from URL path structure) then falls back
   * to a full scan across all projects.
   */
  private async _resolveByUrl(url: string, includeContent: boolean): Promise<ResolvedCardArtifact> {
    const relativePath = extractVaultPath(url, this.artifactBaseUrl);
    if (relativePath === null) {
      throw {
        error: 'UNSUPPORTED_ARTIFACT_SOURCE',
        message: `The URL does not point to a DevPlanner-managed artifact. Expected a URL starting with "${this.artifactBaseUrl}".`,
        url,
        readable: false,
        writable: false,
      };
    }

    // Path structure: [10-Projects/]{project}/{card}/{filename}
    const pathParts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
    let segments = pathParts;
    if (segments[0]?.toLowerCase() === '10-projects') {
      segments = segments.slice(1);
    }

    // Fast path: infer project+card from path structure
    if (segments.length >= 3) {
      const [inferredProject, inferredCard] = segments;
      try {
        const card = await this.cardService.getCard(inferredProject, inferredCard);
        const links: CardLink[] = card.frontmatter.links ?? [];
        const link = links.find(l => l.url === url);
        if (link) {
          const resolved: ResolvedCard = {
            projectSlug: inferredProject,
            cardSlug: card.slug,
            cardId: (card as any).cardId ?? null,
            cardTitle: card.frontmatter.title,
            links,
          };
          return this._buildResolved(resolved, link, includeContent, relativePath);
        }
      } catch {
        // Fall through to scan
      }
    }

    // Fallback: scan all projects
    const projects = await this.projectService.listProjects();
    for (const project of projects) {
      const cardSummaries = await this.cardService.listCards(project.slug);
      for (const summary of cardSummaries) {
        const card = await this.cardService.getCard(project.slug, summary.slug);
        const links: CardLink[] = card.frontmatter.links ?? [];
        const link = links.find(l => l.url === url);
        if (link) {
          const resolved: ResolvedCard = {
            projectSlug: project.slug,
            cardSlug: card.slug,
            cardId: (card as any).cardId ?? null,
            cardTitle: card.frontmatter.title,
            links,
          };
          return this._buildResolved(resolved, link, includeContent, relativePath);
        }
      }
    }

    throw {
      error: 'ARTIFACT_NOT_FOUND',
      message: `No card artifact found with URL "${url}". The URL may belong to a file not yet attached to any card.`,
    };
  }

  /**
   * Resolve a card from { cardId } or { projectSlug + cardSlug }.
   * Returns a ResolvedCard with projectSlug included.
   */
  private async _resolveCardRef(input: {
    cardId?: string;
    projectSlug?: string;
    cardSlug?: string;
  }): Promise<ResolvedCard> {
    if (input.cardId) {
      const projects = await this.projectService.listProjects();
      for (const project of projects) {
        const cards = await this.cardService.listCards(project.slug);
        const match = cards.find(c => (c as any).cardId?.toLowerCase() === input.cardId!.toLowerCase());
        if (match) {
          const card = await this.cardService.getCard(project.slug, match.slug);
          return {
            projectSlug: project.slug,
            cardSlug: card.slug,
            cardId: (card as any).cardId ?? null,
            cardTitle: card.frontmatter.title,
            links: card.frontmatter.links ?? [],
          };
        }
      }
      throw {
        error: 'ARTIFACT_NOT_FOUND',
        message: `No card found with ID "${input.cardId}".`,
      };
    }

    if (input.projectSlug && input.cardSlug) {
      try {
        const card = await this.cardService.getCard(input.projectSlug, input.cardSlug);
        return {
          projectSlug: input.projectSlug,
          cardSlug: card.slug,
          cardId: (card as any).cardId ?? null,
          cardTitle: card.frontmatter.title,
          links: card.frontmatter.links ?? [],
        };
      } catch {
        throw {
          error: 'ARTIFACT_NOT_FOUND',
          message: `Card "${input.cardSlug}" not found in project "${input.projectSlug}".`,
        };
      }
    }

    throw {
      error: 'INVALID_INPUT',
      message: 'Provide url, cardId, or projectSlug + cardSlug to resolve an artifact.',
    };
  }

  /**
   * Match an artifactRef string against the card's links.
   * Priority: exact link.id → decoded vault path → exact URL → unique label.
   */
  private _matchArtifactRef(
    artifactRef: string,
    vaultLinks: CardLink[],
    allLinks: CardLink[],
    cardRef: string
  ): CardLink {
    // 1. Exact link ID match
    const byId = allLinks.find(l => l.id === artifactRef);
    if (byId) {
      if (!byId.url.startsWith(this.artifactBaseUrl)) {
        throw {
          error: 'UNSUPPORTED_ARTIFACT_SOURCE',
          message: `Link "${byId.label}" on card "${cardRef}" points to an external URL. DevPlanner currently supports local card artifacts only.`,
          url: byId.url,
          readable: false,
          writable: false,
        };
      }
      return byId;
    }

    // 2. Vault path match (exact or suffix)
    const byPath = vaultLinks.find(l => {
      const lp = extractVaultPath(l.url, this.artifactBaseUrl);
      return lp === artifactRef || lp?.endsWith('/' + artifactRef);
    });
    if (byPath) return byPath;

    // 3. Exact URL match
    const byUrl = vaultLinks.find(l => l.url === artifactRef);
    if (byUrl) return byUrl;

    // 4. Unique label match
    const byLabel = vaultLinks.filter(l => l.label === artifactRef);
    if (byLabel.length === 1) return byLabel[0];
    if (byLabel.length > 1) {
      throw {
        error: 'AMBIGUOUS_ARTIFACT_REF',
        message: `Multiple artifacts on card "${cardRef}" match label "${artifactRef}". Use a link ID instead.`,
        candidates: byLabel.map(l => ({
          linkId: l.id,
          label: l.label,
          url: l.url,
          updatedAt: l.updatedAt,
        })) as AmbiguousCandidate[],
        suggestedNextCall: {
          tool: 'read_card_artifact',
          input: { artifactRef: byLabel[0].id },
        },
      };
    }

    // Check if it matches an external link label for a better error message
    const externalByLabel = allLinks.filter(
      l => !l.url.startsWith(this.artifactBaseUrl) && l.label === artifactRef
    );
    if (externalByLabel.length > 0) {
      throw {
        error: 'UNSUPPORTED_ARTIFACT_SOURCE',
        message: `Link "${artifactRef}" on card "${cardRef}" points to an external URL. DevPlanner currently supports local card artifacts only.`,
        url: externalByLabel[0].url,
        readable: false,
        writable: false,
      };
    }

    throw {
      error: 'ARTIFACT_NOT_FOUND',
      message: `No artifact matching "${artifactRef}" found on card "${cardRef}". Available: ${vaultLinks.map(l => `"${l.label}"`).join(', ') || '(none)'}`,
      available: vaultLinks.map(l => ({ linkId: l.id, label: l.label })),
    };
  }

  /**
   * Build a ResolvedCardArtifact from resolved parts.
   * overrideRelativePath: provide when path was already extracted (URL-first flow).
   */
  private async _buildResolved(
    resolved: ResolvedCard,
    link: CardLink,
    includeContent: boolean,
    overrideRelativePath?: string
  ): Promise<ResolvedCardArtifact> {
    const relativePath = overrideRelativePath ?? extractVaultPath(link.url, this.artifactBaseUrl);
    if (!relativePath) {
      throw {
        error: 'UNSUPPORTED_ARTIFACT_SOURCE',
        message: `Cannot determine vault path for artifact "${link.label}". The link URL does not match the configured ARTIFACT_BASE_URL.`,
        url: link.url,
        readable: false,
        writable: false,
      };
    }

    if (includeContent) {
      const content = await this.vaultService.readArtifactContent(relativePath);
      const hash = this.vaultService.computeContentHash(content);
      return {
        projectSlug: resolved.projectSlug,
        cardSlug: resolved.cardSlug,
        cardId: resolved.cardId,
        cardTitle: resolved.cardTitle,
        link,
        relativePath,
        viewerUrl: link.url,
        hash,
        sizeBytes: Buffer.byteLength(content, 'utf-8'),
        lineCount: content.split('\n').length,
        content,
      };
    }

    const meta = await this.vaultService.getArtifactMetadata(relativePath);
    return {
      projectSlug: resolved.projectSlug,
      cardSlug: resolved.cardSlug,
      cardId: resolved.cardId,
      cardTitle: resolved.cardTitle,
      link,
      relativePath,
      viewerUrl: link.url,
      ...meta,
    };
  }
}
