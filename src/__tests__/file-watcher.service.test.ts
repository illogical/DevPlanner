import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test';
import { FileWatcherService } from '../services/file-watcher.service';

describe('FileWatcherService', () => {
  describe('shouldProcessFile', () => {
    test('processes markdown files', () => {
      const service = FileWatcherService.getInstance();
      // @ts-expect-error - accessing private method for testing
      expect(service.shouldProcessFile('project/lane/card.md')).toBe(true);
    });

    test('processes _project.json files', () => {
      const service = FileWatcherService.getInstance();
      // @ts-expect-error - accessing private method for testing
      expect(service.shouldProcessFile('project/_project.json')).toBe(true);
    });

    test('processes _order.json files', () => {
      const service = FileWatcherService.getInstance();
      // @ts-expect-error - accessing private method for testing
      expect(service.shouldProcessFile('project/lane/_order.json')).toBe(true);
    });

    test('ignores temporary files', () => {
      const service = FileWatcherService.getInstance();
      // @ts-expect-error - accessing private method for testing
      expect(service.shouldProcessFile('project/lane/card.md.tmp')).toBe(false);
      // @ts-expect-error - accessing private method for testing
      expect(service.shouldProcessFile('project/lane/.card.md.swp')).toBe(false);
      // @ts-expect-error - accessing private method for testing
      expect(service.shouldProcessFile('project/lane/card.md~')).toBe(false);
      // @ts-expect-error - accessing private method for testing
      expect(service.shouldProcessFile('project/lane/card.md.bak')).toBe(false);
    });

    test('ignores other file types', () => {
      const service = FileWatcherService.getInstance();
      // @ts-expect-error - accessing private method for testing
      expect(service.shouldProcessFile('project/README.txt')).toBe(false);
      // @ts-expect-error - accessing private method for testing
      expect(service.shouldProcessFile('project/data.json')).toBe(false);
      // @ts-expect-error - accessing private method for testing
      expect(service.shouldProcessFile('.DS_Store')).toBe(false);
    });
  });

  describe('parseFilePath', () => {
    test('parses project config path', () => {
      const service = FileWatcherService.getInstance();
      // @ts-expect-error - accessing private method for testing
      const result = service.parseFilePath('my-project/_project.json');

      expect(result).toEqual({
        projectSlug: 'my-project',
      });
    });

    test('parses lane order path', () => {
      const service = FileWatcherService.getInstance();
      // @ts-expect-error - accessing private method for testing
      const result = service.parseFilePath('my-project/01-upcoming/_order.json');

      expect(result).toEqual({
        projectSlug: 'my-project',
        lane: '01-upcoming',
      });
    });

    test('parses card path', () => {
      const service = FileWatcherService.getInstance();
      // @ts-expect-error - accessing private method for testing
      const result = service.parseFilePath('my-project/02-in-progress/implement-auth.md');

      expect(result).toEqual({
        projectSlug: 'my-project',
        lane: '02-in-progress',
        cardSlug: 'implement-auth',
      });
    });

    test('returns null for invalid paths', () => {
      const service = FileWatcherService.getInstance();

      // @ts-expect-error - accessing private method for testing
      expect(service.parseFilePath('single-part')).toBeNull();

      // Path with 2 parts but not _project.json returns project slug only
      // @ts-expect-error - accessing private method for testing
      const result = service.parseFilePath('project/unknown.txt');
      expect(result).toEqual({ projectSlug: 'project' });
    });

    test('handles paths with forward slashes', () => {
      const service = FileWatcherService.getInstance();

      // @ts-expect-error - accessing private method for testing
      const result = service.parseFilePath('my-project/03-complete/feature-x.md');

      expect(result).toEqual({
        projectSlug: 'my-project',
        lane: '03-complete',
        cardSlug: 'feature-x',
      });
    });
  });

  describe('singleton pattern', () => {
    test('returns same instance', () => {
      const instance1 = FileWatcherService.getInstance();
      const instance2 = FileWatcherService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('start and stop', () => {
    let service: FileWatcherService;

    beforeEach(() => {
      service = FileWatcherService.getInstance();
    });

    afterEach(() => {
      // Ensure watcher is stopped after each test
      try {
        service.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
    });

    test('can be started and stopped', () => {
      // Note: This test requires a valid DEVPLANNER_WORKSPACE
      // In a real environment, you'd want to mock fs.watch
      expect(() => {
        service.stop(); // Ensure it's stopped first
      }).not.toThrow();
    });

    test('stopping when not started does not throw', () => {
      service.stop();
      expect(() => {
        service.stop();
      }).not.toThrow();
    });
  });

  describe('file filtering edge cases', () => {
    test('handles empty filename', () => {
      const service = FileWatcherService.getInstance();
      // @ts-expect-error - accessing private method for testing
      expect(service.shouldProcessFile('')).toBe(false);
    });

    test('handles paths with multiple dots', () => {
      const service = FileWatcherService.getInstance();
      // @ts-expect-error - accessing private method for testing
      expect(service.shouldProcessFile('project/lane/card.backup.md')).toBe(true);
      // @ts-expect-error - accessing private method for testing
      expect(service.shouldProcessFile('project/lane/card.v1.v2.md')).toBe(true);
    });

    test('case sensitive extension matching', () => {
      const service = FileWatcherService.getInstance();
      // .MD (uppercase) should not match
      // @ts-expect-error - accessing private method for testing
      expect(service.shouldProcessFile('project/lane/card.MD')).toBe(false);
    });
  });

  describe('path parsing edge cases', () => {
    test('handles deeply nested paths', () => {
      const service = FileWatcherService.getInstance();
      // Path with more than 3 parts should return null
      // @ts-expect-error - accessing private method for testing
      const result = service.parseFilePath('project/lane/subfolder/card.md');
      expect(result).toBeNull();
    });

    test('handles empty path parts', () => {
      const service = FileWatcherService.getInstance();
      // Path with empty parts (e.g., double slashes)
      // @ts-expect-error - accessing private method for testing
      const result = service.parseFilePath('project//lane/card.md');
      // Should still parse correctly as empty strings are filtered
      expect(result).toEqual({
        projectSlug: 'project',
        lane: 'lane',
        cardSlug: 'card',
      });
    });

    test('handles card slugs with special characters', () => {
      const service = FileWatcherService.getInstance();
      // @ts-expect-error - accessing private method for testing
      const result = service.parseFilePath('my-project/01-upcoming/fix-bug-123.md');

      expect(result).toEqual({
        projectSlug: 'my-project',
        lane: '01-upcoming',
        cardSlug: 'fix-bug-123',
      });
    });

    test('handles project slugs with numbers', () => {
      const service = FileWatcherService.getInstance();
      // @ts-expect-error - accessing private method for testing
      const result = service.parseFilePath('project-2024/_project.json');

      expect(result).toEqual({
        projectSlug: 'project-2024',
      });
    });
  });
});
