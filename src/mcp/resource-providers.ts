/**
 * MCP Resource Providers
 * 
 * Provides read-only access to DevPlanner data via MCP resources.
 */

import { ProjectService } from '../services/project.service.js';
import { CardService } from '../services/card.service.js';
import { MCPError } from './errors.js';

import type {
  ProjectsResourceContent,
  ProjectResourceContent,
  CardResourceContent,
} from './types.js';

// Initialize services
const projectService = new ProjectService();
const cardService = new CardService();

/**
 * Read a resource by URI
 */
export async function readResource(uri: string): Promise<unknown> {
  // Parse URI
  const match = uri.match(/^devplanner:\/\/(.+)$/);
  if (!match) {
    throw new MCPError(
      'INVALID_RESOURCE_URI',
      `Invalid resource URI: ${uri}. Must start with "devplanner://"`,
    );
  }

  const path = match[1];

  // Route to appropriate handler
  if (path === 'projects') {
    return await readProjectsResource();
  }

  // Match project detail: devplanner://projects/{slug}
  const projectMatch = path.match(/^projects\/([^/]+)$/);
  if (projectMatch) {
    return await readProjectResource(projectMatch[1]);
  }

  // Match card detail: devplanner://projects/{slug}/cards/{cardSlug}
  const cardMatch = path.match(/^projects\/([^/]+)\/cards\/([^/]+)$/);
  if (cardMatch) {
    return await readCardResource(cardMatch[1], cardMatch[2]);
  }

  throw new MCPError(
    'RESOURCE_NOT_FOUND',
    `Resource not found: ${uri}`,
  );
}

/**
 * devplanner://projects - List all projects
 */
async function readProjectsResource(): Promise<ProjectsResourceContent> {
  const projects = await projectService.listProjects();
  
  return {
    projects: projects.filter(p => !p.archived),
    total: projects.filter(p => !p.archived).length,
  };
}

/**
 * devplanner://projects/{slug} - Get project details with recent cards
 */
async function readProjectResource(projectSlug: string): Promise<ProjectResourceContent> {
  const project = await projectService.getProject(projectSlug);
  const allCards = await cardService.listCards(projectSlug);

  // Get recent cards (last 10 from in-progress and upcoming lanes)
  const recentCards = allCards
    .filter(c => c.lane === '02-in-progress' || c.lane === '01-upcoming')
    .slice(0, 10);

  return {
    project,
    recentCards,
  };
}

/**
 * devplanner://projects/{slug}/cards/{cardSlug} - Get full card details
 */
async function readCardResource(projectSlug: string, cardSlug: string): Promise<CardResourceContent> {
  const card = await cardService.getCard(projectSlug, cardSlug);
  
  return {
    card,
  };
}

/**
 * Export resource providers
 */
export const resourceProviders = {
  readResource,
};
