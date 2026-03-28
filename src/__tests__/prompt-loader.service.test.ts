import { describe, expect, test, beforeEach } from 'bun:test';
import { PromptLoader } from '../services/prompt-loader.service';

describe('PromptLoader', () => {
  beforeEach(() => {
    PromptLoader.clearCache();
  });

  describe('render', () => {
    test('replaces a single token', () => {
      const result = PromptLoader.render('Hello, {{name}}!', { name: 'World' });
      expect(result).toBe('Hello, World!');
    });

    test('replaces multiple different tokens', () => {
      const result = PromptLoader.render('{{a}} + {{b}} = {{c}}', {
        a: '1',
        b: '2',
        c: '3',
      });
      expect(result).toBe('1 + 2 = 3');
    });

    test('replaces repeated tokens', () => {
      const result = PromptLoader.render('{{x}} and {{x}}', { x: 'foo' });
      expect(result).toBe('foo and foo');
    });

    test('leaves unknown tokens unchanged', () => {
      const result = PromptLoader.render('{{known}} {{unknown}}', { known: 'ok' });
      expect(result).toBe('ok {{unknown}}');
    });

    test('handles empty tokens map', () => {
      const result = PromptLoader.render('No tokens here.', {});
      expect(result).toBe('No tokens here.');
    });

    test('handles empty string template', () => {
      const result = PromptLoader.render('', { key: 'val' });
      expect(result).toBe('');
    });

    test('handles multi-line template', () => {
      const template = `Line 1: {{a}}\nLine 2: {{b}}\nLine 3: {{a}}`;
      const result = PromptLoader.render(template, { a: 'alpha', b: 'beta' });
      expect(result).toBe('Line 1: alpha\nLine 2: beta\nLine 3: alpha');
    });

    test('preserves double-brace tokens that are not word-only', () => {
      // Only word chars (\w+) are matched; special chars inside braces are untouched
      const result = PromptLoader.render('{{valid}} {{in-valid}}', { valid: 'yes' });
      expect(result).toBe('yes {{in-valid}}');
    });
  });

  describe('load', () => {
    test('loads and renders the dispatch-system.md template', async () => {
      const result = await PromptLoader.load('dispatch-system', {
        projectSlug: 'my-project',
        cardSlug: 'my-card',
        branch: 'card/my-card',
        devplannerHost: 'localhost',
        devplannerPort: '17103',
        projectContextSection: '',
      });

      expect(result).toContain('my-project');
      expect(result).toContain('my-card');
      expect(result).toContain('card/my-card');
      expect(result).toContain('mcp__devplanner__get_card');
      expect(result).toContain('curl');
    });

    test('loads and renders the dispatch-user.md template', async () => {
      const result = await PromptLoader.load('dispatch-user', {
        cardId: 'HX-5',
        title: 'My Feature',
        description: 'Do the thing.',
        content: 'Some body.',
        taskSection: '- [ ] 0: Write code',
        artifactSection: '',
      });

      expect(result).toContain('HX-5');
      expect(result).toContain('My Feature');
      expect(result).toContain('Do the thing.');
      expect(result).toContain('Write code');
    });

    test('caches the template on subsequent loads', async () => {
      // First load reads from disk
      const r1 = await PromptLoader.load('dispatch-user', {
        cardId: 'A',
        title: 'T',
        description: 'D',
        content: 'C',
        taskSection: '',
        artifactSection: '',
      });
      // Second load should return same result (cached)
      const r2 = await PromptLoader.load('dispatch-user', {
        cardId: 'A',
        title: 'T',
        description: 'D',
        content: 'C',
        taskSection: '',
        artifactSection: '',
      });
      expect(r1).toBe(r2);
    });

    test('throws for unknown template', async () => {
      await expect(PromptLoader.load('nonexistent-template', {})).rejects.toThrow();
    });
  });
});
