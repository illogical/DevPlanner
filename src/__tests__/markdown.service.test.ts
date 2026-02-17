import { describe, expect, test } from 'bun:test';
import { MarkdownService } from '../services/markdown.service';

describe('MarkdownService', () => {
  describe('parse', () => {
    test('parses frontmatter and content', () => {
      const raw = `---
title: Test Card
priority: high
assignee: user
created: 2026-02-04T10:00:00Z
updated: 2026-02-04T10:00:00Z
tags:
  - feature
  - test
---

This is the card content.

- [ ] Task 1
- [x] Task 2
`;

      const result = MarkdownService.parse(raw);

      expect(result.frontmatter.title).toBe('Test Card');
      expect(result.frontmatter.priority).toBe('high');
      expect(result.frontmatter.assignee).toBe('user');
      expect(result.frontmatter.tags).toEqual(['feature', 'test']);
      expect(result.content).toContain('This is the card content.');
      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0]).toEqual({ index: 0, text: 'Task 1', checked: false });
      expect(result.tasks[1]).toEqual({ index: 1, text: 'Task 2', checked: true });
    });

    test('handles empty content', () => {
      const raw = `---
title: Empty Card
created: 2026-02-04T10:00:00Z
updated: 2026-02-04T10:00:00Z
---
`;

      const result = MarkdownService.parse(raw);

      expect(result.frontmatter.title).toBe('Empty Card');
      expect(result.content).toBe('');
      expect(result.tasks).toHaveLength(0);
    });

    test('handles optional frontmatter fields', () => {
      const raw = `---
title: Minimal Card
created: 2026-02-04T10:00:00Z
updated: 2026-02-04T10:00:00Z
---

Content here.
`;

      const result = MarkdownService.parse(raw);

      expect(result.frontmatter.title).toBe('Minimal Card');
      expect(result.frontmatter.priority).toBeUndefined();
      expect(result.frontmatter.assignee).toBeUndefined();
      expect(result.frontmatter.tags).toBeUndefined();
    });
  });

  describe('serialize', () => {
    test('serializes frontmatter and content', () => {
      const frontmatter = {
        title: 'Test Card',
        priority: 'high' as const,
        assignee: 'user' as const,
        created: '2026-02-04T10:00:00Z',
        updated: '2026-02-04T10:00:00Z',
        tags: ['feature', 'test'],
      };
      const content = 'This is the content.\n\n- [ ] Task 1';

      const result = MarkdownService.serialize(frontmatter, content);

      expect(result).toContain('---');
      expect(result).toContain('title: Test Card');
      expect(result).toContain('priority: high');
      expect(result).toContain('assignee: user');
      expect(result).toContain('This is the content.');
      expect(result).toContain('- [ ] Task 1');
    });
  });

  describe('parseTasks', () => {
    test('parses unchecked tasks', () => {
      const content = `
Some content here.

- [ ] Task 1
- [ ] Task 2
`;

      const tasks = MarkdownService.parseTasks(content);

      expect(tasks).toHaveLength(2);
      expect(tasks[0]).toEqual({ index: 0, text: 'Task 1', checked: false });
      expect(tasks[1]).toEqual({ index: 1, text: 'Task 2', checked: false });
    });

    test('parses checked tasks', () => {
      const content = `
- [x] Completed task
- [X] Another completed task
`;

      const tasks = MarkdownService.parseTasks(content);

      expect(tasks).toHaveLength(2);
      expect(tasks[0]).toEqual({ index: 0, text: 'Completed task', checked: true });
      expect(tasks[1]).toEqual({ index: 1, text: 'Another completed task', checked: true });
    });

    test('parses mixed tasks', () => {
      const content = `
## Tasks

- [ ] Not started
- [x] Complete
- [ ] Another pending
`;

      const tasks = MarkdownService.parseTasks(content);

      expect(tasks).toHaveLength(3);
      expect(tasks[0].checked).toBe(false);
      expect(tasks[1].checked).toBe(true);
      expect(tasks[2].checked).toBe(false);
    });

    test('handles indented tasks', () => {
      const content = `
  - [ ] Indented task
    - [ ] More indented
`;

      const tasks = MarkdownService.parseTasks(content);

      expect(tasks).toHaveLength(2);
      expect(tasks[0].text).toBe('Indented task');
      expect(tasks[1].text).toBe('More indented');
    });

    test('ignores non-task list items', () => {
      const content = `
- Regular list item
- Another item
- [ ] Actual task
`;

      const tasks = MarkdownService.parseTasks(content);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].text).toBe('Actual task');
    });

    test('returns empty array for no tasks', () => {
      const content = `
Just some content.
No tasks here.
`;

      const tasks = MarkdownService.parseTasks(content);

      expect(tasks).toHaveLength(0);
    });
  });

  describe('setTaskChecked', () => {
    test('checks an unchecked task', () => {
      const content = `
- [ ] Task 1
- [ ] Task 2
`;

      const result = MarkdownService.setTaskChecked(content, 0, true);

      expect(result).toContain('- [x] Task 1');
      expect(result).toContain('- [ ] Task 2');
    });

    test('unchecks a checked task', () => {
      const content = `
- [x] Task 1
- [x] Task 2
`;

      const result = MarkdownService.setTaskChecked(content, 1, false);

      expect(result).toContain('- [x] Task 1');
      expect(result).toContain('- [ ] Task 2');
    });

    test('handles indented tasks', () => {
      const content = `
  - [ ] Indented task
  - [x] Another indented
`;

      const result = MarkdownService.setTaskChecked(content, 0, true);

      expect(result).toContain('- [x] Indented task');
    });

    test('throws error for invalid task index', () => {
      const content = `
- [ ] Task 1
`;

      expect(() => {
        MarkdownService.setTaskChecked(content, 5, true);
      }).toThrow('Task index 5 not found');
    });

    test('preserves surrounding content', () => {
      const content = `
## Header

Some text before.

- [ ] Task 1
- [ ] Task 2

Some text after.
`;

      const result = MarkdownService.setTaskChecked(content, 0, true);

      expect(result).toContain('## Header');
      expect(result).toContain('Some text before.');
      expect(result).toContain('- [x] Task 1');
      expect(result).toContain('- [ ] Task 2');
      expect(result).toContain('Some text after.');
    });
  });

  describe('appendTask', () => {
    test('appends task to existing content with ## Tasks heading', () => {
      const content = `Existing content.

## Tasks
- [ ] Existing task`;

      const result = MarkdownService.appendTask(content, 'New task');

      expect(result).toContain('Existing content.');
      expect(result).toContain('## Tasks');
      expect(result).toContain('- [ ] Existing task');
      expect(result).toContain('- [ ] New task');
      // Should not create duplicate heading
      expect(result.match(/## Tasks/g)?.length).toBe(1);
    });

    test('creates ## Tasks heading when adding first task to content without heading', () => {
      const content = 'Existing description without tasks.';

      const result = MarkdownService.appendTask(content, 'First task');

      expect(result).toContain('Existing description without tasks.');
      expect(result).toContain('## Tasks');
      expect(result).toContain('- [ ] First task');
      expect(result).toBe('Existing description without tasks.\n\n## Tasks\n- [ ] First task');
    });

    test('creates ## Tasks heading for empty content', () => {
      const result = MarkdownService.appendTask('', 'First task');

      expect(result).toBe('## Tasks\n- [ ] First task');
    });

    test('handles content without trailing newline', () => {
      const content = 'Content without newline';

      const result = MarkdownService.appendTask(content, 'New task');

      expect(result).toBe('Content without newline\n\n## Tasks\n- [ ] New task');
      expect(result).toContain('## Tasks');
    });
  });

  describe('taskProgress', () => {
    test('calculates progress for mixed tasks', () => {
      const tasks = [
        { index: 0, text: 'Task 1', checked: true },
        { index: 1, text: 'Task 2', checked: false },
        { index: 2, text: 'Task 3', checked: true },
        { index: 3, text: 'Task 4', checked: false },
      ];

      const progress = MarkdownService.taskProgress(tasks);

      expect(progress.total).toBe(4);
      expect(progress.checked).toBe(2);
    });

    test('handles all checked', () => {
      const tasks = [
        { index: 0, text: 'Task 1', checked: true },
        { index: 1, text: 'Task 2', checked: true },
      ];

      const progress = MarkdownService.taskProgress(tasks);

      expect(progress.total).toBe(2);
      expect(progress.checked).toBe(2);
    });

    test('handles no tasks', () => {
      const progress = MarkdownService.taskProgress([]);

      expect(progress.total).toBe(0);
      expect(progress.checked).toBe(0);
    });
  });
});
