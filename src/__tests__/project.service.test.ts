import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProjectService } from '../services/project.service';

describe('ProjectService', () => {
  let testWorkspace: string;
  let service: ProjectService;

  beforeEach(async () => {
    // Create a temporary workspace for each test
    testWorkspace = await mkdtemp(join(tmpdir(), 'devplanner-test-'));
    service = new ProjectService(testWorkspace);
  });

  afterEach(async () => {
    // Clean up the temporary workspace
    try {
      await rm(testWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createProject', () => {
    test('creates a new project with all required folders', async () => {
      const config = await service.createProject('Test Project', 'A test project');

      expect(config.name).toBe('Test Project');
      expect(config.description).toBe('A test project');
      expect(config.archived).toBe(false);
      expect(config.lanes).toBeDefined();
      expect(config.lanes['01-upcoming']).toBeDefined();
      expect(config.lanes['02-in-progress']).toBeDefined();
      expect(config.lanes['03-complete']).toBeDefined();
      expect(config.lanes['04-archive']).toBeDefined();

      // Verify timestamps are ISO 8601 format
      expect(config.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(config.updated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('creates correct lane configurations', async () => {
      const config = await service.createProject('Test');

      expect(config.lanes['01-upcoming'].displayName).toBe('Upcoming');
      expect(config.lanes['01-upcoming'].color).toBe('#6b7280');
      expect(config.lanes['01-upcoming'].collapsed).toBe(false);

      expect(config.lanes['02-in-progress'].displayName).toBe('In Progress');
      expect(config.lanes['02-in-progress'].color).toBe('#3b82f6');

      expect(config.lanes['03-complete'].displayName).toBe('Complete');
      expect(config.lanes['03-complete'].collapsed).toBe(true);

      expect(config.lanes['04-archive'].displayName).toBe('Archive');
      expect(config.lanes['04-archive'].collapsed).toBe(true);
    });

    test('slugifies project name', async () => {
      await service.createProject('My Test Project!');

      const projects = await service.listProjects();
      expect(projects[0].slug).toBe('my-test-project');
    });

    test('throws error if project name is empty', async () => {
      await expect(service.createProject('')).rejects.toThrow('Project name is required');
      await expect(service.createProject('   ')).rejects.toThrow('Project name is required');
    });

    test('throws error if project already exists', async () => {
      await service.createProject('Test Project');

      await expect(service.createProject('Test Project')).rejects.toThrow(
        'Project already exists'
      );
    });

    test('creates project without description', async () => {
      const config = await service.createProject('Test');

      expect(config.name).toBe('Test');
      expect(config.description).toBeUndefined();
    });
  });

  describe('listProjects', () => {
    test('returns empty array for empty workspace', async () => {
      const projects = await service.listProjects();

      expect(projects).toHaveLength(0);
    });

    test('lists all non-archived projects', async () => {
      await service.createProject('Project 1');
      await service.createProject('Project 2');
      await service.createProject('Project 3');

      const projects = await service.listProjects();

      expect(projects).toHaveLength(3);
      expect(projects.map((p) => p.name)).toContain('Project 1');
      expect(projects.map((p) => p.name)).toContain('Project 2');
      expect(projects.map((p) => p.name)).toContain('Project 3');
    });

    test('excludes archived projects by default', async () => {
      await service.createProject('Active Project');
      await service.createProject('Archived Project');
      await service.archiveProject('archived-project');

      const projects = await service.listProjects();

      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe('Active Project');
    });

    test('includes archived projects when requested', async () => {
      await service.createProject('Active Project');
      await service.createProject('Archived Project');
      await service.archiveProject('archived-project');

      const projects = await service.listProjects(true);

      expect(projects).toHaveLength(2);
    });

    test('includes card counts for each lane', async () => {
      await service.createProject('Test Project');

      const projects = await service.listProjects();

      expect(projects[0].cardCounts).toBeDefined();
      expect(projects[0].cardCounts['01-upcoming']).toBe(0);
      expect(projects[0].cardCounts['02-in-progress']).toBe(0);
      expect(projects[0].cardCounts['03-complete']).toBe(0);
      expect(projects[0].cardCounts['04-archive']).toBe(0);
    });

    test('sorts projects by created date (newest first)', async () => {
      await service.createProject('Project 1');
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      await service.createProject('Project 2');
      await new Promise((resolve) => setTimeout(resolve, 10));
      await service.createProject('Project 3');

      const projects = await service.listProjects();

      expect(projects[0].name).toBe('Project 3');
      expect(projects[1].name).toBe('Project 2');
      expect(projects[2].name).toBe('Project 1');
    });
  });

  describe('getProject', () => {
    test('retrieves a project by slug', async () => {
      await service.createProject('Test Project', 'Description');

      const project = await service.getProject('test-project');

      expect(project.name).toBe('Test Project');
      expect(project.description).toBe('Description');
    });

    test('throws error for non-existent project', async () => {
      await expect(service.getProject('non-existent')).rejects.toThrow(
        'Project not found'
      );
    });
  });

  describe('updateProject', () => {
    test('updates project name', async () => {
      await service.createProject('Test Project');

      const updated = await service.updateProject('test-project', {
        name: 'Updated Name',
      });

      expect(updated.name).toBe('Updated Name');
    });

    test('updates project description', async () => {
      await service.createProject('Test Project');

      const updated = await service.updateProject('test-project', {
        description: 'New description',
      });

      expect(updated.description).toBe('New description');
    });

    test('updates the updated timestamp', async () => {
      const original = await service.createProject('Test Project');
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await service.updateProject('test-project', {
        name: 'Updated',
      });

      expect(updated.updated).not.toBe(original.updated);
      expect(new Date(updated.updated).getTime()).toBeGreaterThan(
        new Date(original.updated).getTime()
      );
    });

    test('preserves other fields when updating', async () => {
      const original = await service.createProject('Test', 'Description');

      const updated = await service.updateProject('test', {
        name: 'Updated Name',
      });

      expect(updated.description).toBe('Description');
      expect(updated.created).toBe(original.created);
      expect(updated.lanes).toEqual(original.lanes);
    });
  });

  describe('archiveProject', () => {
    test('sets archived to true', async () => {
      await service.createProject('Test Project');

      await service.archiveProject('test-project');

      const project = await service.getProject('test-project');
      expect(project.archived).toBe(true);
    });

    test('archived project not in default list', async () => {
      await service.createProject('Test Project');
      await service.archiveProject('test-project');

      const projects = await service.listProjects();

      expect(projects).toHaveLength(0);
    });
  });
});
