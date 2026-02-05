import { rm } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { ProjectService } from './services/project.service';
import { CardService } from './services/card.service';
import { slugify } from './utils/slug';

const workspacePath = process.env.DEVPLANNER_WORKSPACE;

if (!workspacePath) {
  console.error('Error: DEVPLANNER_WORKSPACE environment variable is not set');
  process.exit(1);
}

const projectService = new ProjectService(workspacePath);
const cardService = new CardService(workspacePath);

const seedProjects = [
  {
    name: 'Media Manager',
    description: 'Media asset management application',
    cards: [
      {
        title: 'Video Upload Pipeline',
        lane: '01-upcoming',
        content: `Implement a robust video upload system with chunked uploads for large files.

## Tasks

- [ ] Implement chunked upload
- [ ] Add progress tracking
- [ ] Support MP4 and WebM`,
      },
      {
        title: 'Image Thumbnail Generation',
        lane: '02-in-progress',
        priority: 'high' as const,
        assignee: 'agent' as const,
        content: `Generate thumbnails for uploaded images in multiple sizes.

## Tasks

- [x] Set up Sharp library
- [x] Create thumbnail sizes config
- [ ] Generate on upload
- [ ] Cache generated thumbnails`,
      },
      {
        title: 'Media Library UI',
        lane: '01-upcoming',
        priority: 'medium' as const,
        tags: ['frontend', 'ui'],
        content: `Build the user interface for browsing and managing media assets.

## Tasks

- [ ] Design grid view
- [ ] Add search/filter bar
- [ ] Implement lazy loading`,
      },
      {
        title: 'File Storage Service',
        lane: '03-complete',
        priority: 'high' as const,
        assignee: 'user' as const,
        tags: ['backend', 'storage'],
        content: `Set up cloud storage for media files.

## Tasks

- [x] Configure S3 bucket
- [x] Implement upload service
- [x] Add download endpoint`,
      },
    ],
  },
  {
    name: 'LM API',
    description: 'Language model API service',
    cards: [
      {
        title: 'Prompt Template System',
        lane: '01-upcoming',
        priority: 'high' as const,
        tags: ['feature', 'prompt'],
        content: `Create a flexible system for managing and versioning prompt templates.

## Tasks

- [ ] Design template schema
- [ ] Implement variable substitution
- [ ] Add template versioning`,
      },
      {
        title: 'Streaming Response Handler',
        lane: '02-in-progress',
        priority: 'high' as const,
        assignee: 'user' as const,
        status: 'in-progress' as const,
        content: `Implement server-sent events for streaming LM responses.

## Tasks

- [x] Set up SSE endpoint
- [ ] Implement token streaming
- [ ] Add error recovery`,
      },
      {
        title: 'Rate Limiting',
        lane: '01-upcoming',
        priority: 'medium' as const,
        tags: ['backend', 'security'],
        content: `Implement rate limiting to prevent API abuse.

## Tasks

- [ ] Choose rate limit strategy
- [ ] Implement middleware
- [ ] Add per-user limits`,
      },
      {
        title: 'Authentication Middleware',
        lane: '03-complete',
        priority: 'high' as const,
        assignee: 'user' as const,
        tags: ['security', 'auth'],
        content: `Secure the API with authentication and authorization.

## Tasks

- [x] Implement API key validation
- [x] Add request signing
- [x] Create auth tests`,
      },
    ],
  },
  {
    name: 'Memory API',
    description: 'Conversation memory and context management API',
    cards: [
      {
        title: 'Vector Store Integration',
        lane: '02-in-progress',
        priority: 'high' as const,
        assignee: 'agent' as const,
        status: 'in-progress' as const,
        tags: ['vector-db', 'embeddings'],
        content: `Integrate a vector database for semantic memory search.

## Tasks

- [x] Choose embedding model
- [ ] Set up vector database
- [ ] Implement similarity search`,
      },
      {
        title: 'Memory CRUD Endpoints',
        lane: '01-upcoming',
        priority: 'high' as const,
        tags: ['api', 'crud'],
        content: `Create REST endpoints for managing conversation memories.

## Tasks

- [ ] Design memory schema
- [ ] Create REST endpoints
- [ ] Add pagination`,
      },
      {
        title: 'Conversation History',
        lane: '01-upcoming',
        priority: 'medium' as const,
        tags: ['history', 'context'],
        content: `Implement conversation history tracking with sliding window.

## Tasks

- [ ] Define history format
- [ ] Implement sliding window
- [ ] Add token counting`,
      },
    ],
  },
];

async function seed() {
  console.log('🌱 Seeding DevPlanner workspace...\n');

  let totalCards = 0;

  for (const projectData of seedProjects) {
    const slug = slugify(projectData.name);

    // Delete existing project if it exists
    const projectPath = join(workspacePath, slug);
    if (existsSync(projectPath)) {
      console.log(`  Removing existing project: ${projectData.name}`);
      await rm(projectPath, { recursive: true, force: true });
    }

    // Create project
    console.log(`  Creating project: ${projectData.name}`);
    await projectService.createProject(projectData.name, projectData.description);

    // Create cards
    for (const cardData of projectData.cards) {
      await cardService.createCard(slug, cardData);
      totalCards++;
    }

    console.log(`    ✓ Created ${projectData.cards.length} cards\n`);
  }

  console.log(`✨ Seed complete!`);
  console.log(`   Created ${seedProjects.length} projects with ${totalCards} cards total\n`);
}

seed().catch((error) => {
  console.error('Error seeding workspace:', error);
  process.exit(1);
});
