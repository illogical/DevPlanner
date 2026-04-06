import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProjectService } from '../services/project.service';
import { CardService } from '../services/card.service';
import { TaskService } from '../services/task.service';
import { LinkService } from '../services/link.service';

describe('LinkService', () => {
  let testWorkspace: string;
  let projectService: ProjectService;
  let cardService: CardService;
  let taskService: TaskService;
  let linkService: LinkService;
  const projectSlug = 'test-project';
  const cardSlug = 'test-card';

  beforeEach(async () => {
    testWorkspace = await mkdtemp(join(tmpdir(), 'devplanner-link-test-'));
    projectService = new ProjectService(testWorkspace);
    cardService = new CardService(testWorkspace);
    taskService = new TaskService(testWorkspace);
    linkService = new LinkService(testWorkspace);

    await projectService.createProject('Test Project');
    await cardService.createCard(projectSlug, { title: 'Test Card' });
    // Add a task so we can verify card content is not corrupted by link operations
    await taskService.addTask(projectSlug, cardSlug, 'Existing task');
  });

  afterEach(async () => {
    try {
      await rm(testWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('addLink', () => {
    test('adds a valid link and returns CardLink with UUID id', async () => {
      const link = await linkService.addLink(projectSlug, cardSlug, {
        label: 'DevPlanner README',
        url: 'https://github.com/illogical/DevPlanner',
      });

      expect(link.id).toBeTruthy();
      expect(link.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(link.label).toBe('DevPlanner README');
      expect(link.url).toBe('https://github.com/illogical/DevPlanner');
      expect(link.kind).toBe('other'); // default
      expect(link.createdAt).toBeTruthy();
      expect(link.updatedAt).toBeTruthy();
    });

    test('defaults kind to "other" when not provided', async () => {
      const link = await linkService.addLink(projectSlug, cardSlug, {
        label: 'Test',
        url: 'https://example.com',
      });
      expect(link.kind).toBe('other');
    });

    test('accepts explicit kind values', async () => {
      const kinds = ['doc', 'spec', 'ticket', 'repo', 'reference', 'other'] as const;
      for (const kind of kinds) {
        const lbl = `link-${kind}`;
        const link = await linkService.addLink(projectSlug, cardSlug, {
          label: lbl,
          url: `https://example.com/${kind}`,
          kind,
        });
        expect(link.kind).toBe(kind);
      }
    });

    test('sets timestamps on creation', async () => {
      const before = new Date().toISOString();
      const link = await linkService.addLink(projectSlug, cardSlug, {
        label: 'TS test',
        url: 'https://example.com/ts',
      });
      const after = new Date().toISOString();
      expect(link.createdAt >= before).toBe(true);
      expect(link.createdAt <= after).toBe(true);
      expect(link.updatedAt).toBe(link.createdAt);
    });

    test('bumps frontmatter.updated on add', async () => {
      const original = await cardService.getCard(projectSlug, cardSlug);
      await new Promise((r) => setTimeout(r, 10));

      await linkService.addLink(projectSlug, cardSlug, {
        label: 'Bump test',
        url: 'https://example.com/bump',
      });

      const updated = await cardService.getCard(projectSlug, cardSlug);
      expect(new Date(updated.frontmatter.updated).getTime()).toBeGreaterThanOrEqual(
        new Date(original.frontmatter.updated).getTime()
      );
    });

    test('persists link to card frontmatter', async () => {
      const link = await linkService.addLink(projectSlug, cardSlug, {
        label: 'Persist test',
        url: 'https://example.com/persist',
      });

      const card = await cardService.getCard(projectSlug, cardSlug);
      const links = (card.frontmatter as { links?: typeof link[] }).links ?? [];
      expect(links).toHaveLength(1);
      expect(links[0].id).toBe(link.id);
      expect(links[0].label).toBe('Persist test');
    });

    test('does not corrupt existing tasks / card content', async () => {
      await linkService.addLink(projectSlug, cardSlug, {
        label: 'Corrupt check',
        url: 'https://example.com/corrupt',
      });
      const card = await cardService.getCard(projectSlug, cardSlug);
      expect(card.tasks).toHaveLength(1);
      expect(card.tasks[0].text).toBe('Existing task');
    });

    test('handles URL with query string and special characters', async () => {
      const complexUrl = 'https://example.com/search?q=hello+world&page=2&x=a%3Db';
      const link = await linkService.addLink(projectSlug, cardSlug, {
        label: 'Complex URL',
        url: complexUrl,
      });
      expect(link.url).toContain('example.com');
    });
  });

  describe('URL validation', () => {
    test('rejects URL without protocol', async () => {
      await expect(
        linkService.addLink(projectSlug, cardSlug, {
          label: 'No protocol',
          url: 'example.com',
        })
      ).rejects.toMatchObject({ error: 'INVALID_URL' });
    });

    test('rejects ftp:// protocol', async () => {
      await expect(
        linkService.addLink(projectSlug, cardSlug, {
          label: 'FTP',
          url: 'ftp://example.com',
        })
      ).rejects.toMatchObject({ error: 'INVALID_URL' });
    });

    test('rejects empty URL', async () => {
      await expect(
        linkService.addLink(projectSlug, cardSlug, {
          label: 'Empty URL',
          url: '',
        })
      ).rejects.toMatchObject({ error: 'INVALID_URL' });
    });

    test('rejects whitespace-only URL', async () => {
      await expect(
        linkService.addLink(projectSlug, cardSlug, {
          label: 'Whitespace URL',
          url: '   ',
        })
      ).rejects.toMatchObject({ error: 'INVALID_URL' });
    });

    test('trims URL whitespace before validation', async () => {
      const link = await linkService.addLink(projectSlug, cardSlug, {
        label: 'Trimmed',
        url: '  https://example.com/trimmed  ',
      });
      expect(link.url).toBe('https://example.com/trimmed');
    });

    test('accepts http:// URLs', async () => {
      const link = await linkService.addLink(projectSlug, cardSlug, {
        label: 'HTTP',
        url: 'http://example.com',
      });
      expect(link.url).toContain('http://');
    });
  });

  describe('label validation', () => {
    test('rejects empty label', async () => {
      await expect(
        linkService.addLink(projectSlug, cardSlug, {
          label: '',
          url: 'https://example.com',
        })
      ).rejects.toMatchObject({ error: 'INVALID_LABEL' });
    });

    test('rejects whitespace-only label', async () => {
      await expect(
        linkService.addLink(projectSlug, cardSlug, {
          label: '   ',
          url: 'https://example.com',
        })
      ).rejects.toMatchObject({ error: 'INVALID_LABEL' });
    });

    test('trims label whitespace', async () => {
      const link = await linkService.addLink(projectSlug, cardSlug, {
        label: '  Trimmed Label  ',
        url: 'https://example.com/label-trim',
      });
      expect(link.label).toBe('Trimmed Label');
    });
  });

  describe('duplicate detection', () => {
    test('rejects duplicate URL on same card', async () => {
      await linkService.addLink(projectSlug, cardSlug, {
        label: 'First',
        url: 'https://example.com/dup',
      });

      await expect(
        linkService.addLink(projectSlug, cardSlug, {
          label: 'Second',
          url: 'https://example.com/dup',
        })
      ).rejects.toMatchObject({ error: 'DUPLICATE_LINK' });
    });

    test('allows same URL on different cards', async () => {
      await cardService.createCard(projectSlug, { title: 'Card Two', content: '' });
      await linkService.addLink(projectSlug, cardSlug, {
        label: 'Card1 link',
        url: 'https://example.com/shared',
      });
      const link2 = await linkService.addLink(projectSlug, 'card-two', {
        label: 'Card2 link',
        url: 'https://example.com/shared',
      });
      expect(link2.url).toBe('https://example.com/shared');
    });
  });

  describe('updateLink', () => {
    test('partial update: label only', async () => {
      const link = await linkService.addLink(projectSlug, cardSlug, {
        label: 'Original',
        url: 'https://example.com/update',
      });

      const updated = await linkService.updateLink(projectSlug, cardSlug, link.id, {
        label: 'Updated Label',
      });

      expect(updated.label).toBe('Updated Label');
      expect(updated.url).toBe(link.url);
      expect(updated.kind).toBe(link.kind);
      expect(updated.id).toBe(link.id);
    });

    test('partial update: url only', async () => {
      const link = await linkService.addLink(projectSlug, cardSlug, {
        label: 'URL Update',
        url: 'https://example.com/old',
      });

      const updated = await linkService.updateLink(projectSlug, cardSlug, link.id, {
        url: 'https://example.com/new',
      });

      expect(updated.url).toBe('https://example.com/new');
      expect(updated.label).toBe(link.label);
    });

    test('partial update: kind only', async () => {
      const link = await linkService.addLink(projectSlug, cardSlug, {
        label: 'Kind Update',
        url: 'https://example.com/kind',
      });

      const updated = await linkService.updateLink(projectSlug, cardSlug, link.id, {
        kind: 'doc',
      });

      expect(updated.kind).toBe('doc');
      expect(updated.label).toBe(link.label);
    });

    test('bumps updatedAt on update', async () => {
      const link = await linkService.addLink(projectSlug, cardSlug, {
        label: 'Timestamps',
        url: 'https://example.com/ts2',
      });
      await new Promise((r) => setTimeout(r, 10));

      const updated = await linkService.updateLink(projectSlug, cardSlug, link.id, {
        label: 'Timestamps Updated',
      });

      expect(updated.updatedAt > link.updatedAt).toBe(true);
      expect(updated.createdAt).toBe(link.createdAt);
    });

    test('rejects invalid URL on update', async () => {
      const link = await linkService.addLink(projectSlug, cardSlug, {
        label: 'URL val',
        url: 'https://example.com/urlval',
      });

      await expect(
        linkService.updateLink(projectSlug, cardSlug, link.id, {
          url: 'not-a-url',
        })
      ).rejects.toMatchObject({ error: 'INVALID_URL' });
    });

    test('duplicate check excludes self on update', async () => {
      const link = await linkService.addLink(projectSlug, cardSlug, {
        label: 'Self dup',
        url: 'https://example.com/selfdup',
      });

      // Updating the URL to the same URL (no-op) should not throw DUPLICATE_LINK
      const updated = await linkService.updateLink(projectSlug, cardSlug, link.id, {
        url: 'https://example.com/selfdup',
      });
      expect(updated.url).toBe('https://example.com/selfdup');
    });

    test('duplicate check on update catches conflict with other links', async () => {
      const link1 = await linkService.addLink(projectSlug, cardSlug, {
        label: 'Link 1',
        url: 'https://example.com/one',
      });
      await linkService.addLink(projectSlug, cardSlug, {
        label: 'Link 2',
        url: 'https://example.com/two',
      });

      await expect(
        linkService.updateLink(projectSlug, cardSlug, link1.id, {
          url: 'https://example.com/two',
        })
      ).rejects.toMatchObject({ error: 'DUPLICATE_LINK' });
    });

    test('throws LINK_NOT_FOUND for bad ID', async () => {
      await expect(
        linkService.updateLink(projectSlug, cardSlug, 'non-existent-id', {
          label: 'Ghost',
        })
      ).rejects.toMatchObject({ error: 'LINK_NOT_FOUND' });
    });
  });

  describe('deleteLink', () => {
    test('removes link from card', async () => {
      const link = await linkService.addLink(projectSlug, cardSlug, {
        label: 'To Delete',
        url: 'https://example.com/delete',
      });

      await linkService.deleteLink(projectSlug, cardSlug, link.id);

      const card = await cardService.getCard(projectSlug, cardSlug);
      const links = (card.frontmatter as { links?: typeof link[] }).links ?? [];
      expect(links).toHaveLength(0);
    });

    test('only removes the specified link', async () => {
      const link1 = await linkService.addLink(projectSlug, cardSlug, {
        label: 'Keep',
        url: 'https://example.com/keep',
      });
      const link2 = await linkService.addLink(projectSlug, cardSlug, {
        label: 'Delete me',
        url: 'https://example.com/deleteme',
      });

      await linkService.deleteLink(projectSlug, cardSlug, link2.id);

      const card = await cardService.getCard(projectSlug, cardSlug);
      const links = (card.frontmatter as { links?: typeof link1[] }).links ?? [];
      expect(links).toHaveLength(1);
      expect(links[0].id).toBe(link1.id);
    });

    test('throws LINK_NOT_FOUND for bad ID', async () => {
      await expect(
        linkService.deleteLink(projectSlug, cardSlug, 'bad-id')
      ).rejects.toMatchObject({ error: 'LINK_NOT_FOUND' });
    });

    test('bumps frontmatter.updated on delete', async () => {
      const link = await linkService.addLink(projectSlug, cardSlug, {
        label: 'Bump delete',
        url: 'https://example.com/bumpdelete',
      });
      const afterAdd = await cardService.getCard(projectSlug, cardSlug);
      await new Promise((r) => setTimeout(r, 10));

      await linkService.deleteLink(projectSlug, cardSlug, link.id);

      const afterDelete = await cardService.getCard(projectSlug, cardSlug);
      expect(
        new Date(afterDelete.frontmatter.updated).getTime()
      ).toBeGreaterThanOrEqual(new Date(afterAdd.frontmatter.updated).getTime());
    });

    test('does not corrupt card content on delete', async () => {
      const link = await linkService.addLink(projectSlug, cardSlug, {
        label: 'Content check',
        url: 'https://example.com/content',
      });
      await linkService.deleteLink(projectSlug, cardSlug, link.id);

      const card = await cardService.getCard(projectSlug, cardSlug);
      expect(card.tasks).toHaveLength(1);
      expect(card.tasks[0].text).toBe('Existing task');
    });
  });

  describe('ID-based card lookup', () => {
    // 'Test Project' generates prefix 'TP'; the card created in beforeEach is card #1 → TP-1

    test('addLink with card ID (TP-1) adds link successfully', async () => {
      const link = await linkService.addLink(projectSlug, 'TP-1', {
        label: 'Via ID',
        url: 'https://example.com/via-id',
      });
      expect(link.label).toBe('Via ID');
      const card = await cardService.getCard(projectSlug, cardSlug);
      expect(card.frontmatter.links).toHaveLength(1);
    });

    test('addLink with lowercase id without dash (tp1) adds link successfully', async () => {
      const link = await linkService.addLink(projectSlug, 'tp1', {
        label: 'Via lowercase ID',
        url: 'https://example.com/lowercase',
      });
      expect(link.label).toBe('Via lowercase ID');
    });

    test('deleteLink with card ID removes link successfully', async () => {
      const link = await linkService.addLink(projectSlug, cardSlug, {
        label: 'To delete',
        url: 'https://example.com/to-delete',
      });
      await linkService.deleteLink(projectSlug, 'TP-1', link.id);
      const card = await cardService.getCard(projectSlug, cardSlug);
      expect((card.frontmatter.links ?? []).length).toBe(0);
    });

    test('addLink with non-existent card ID throws informative error', async () => {
      await expect(
        linkService.addLink(projectSlug, 'TP-999', { label: 'X', url: 'https://example.com' })
      ).rejects.toThrow(`Card 'TP-999' not found in project '${projectSlug}'`);
    });
  });
});
