import { describe, test, expect } from 'bun:test';
import { generatePrefix } from '../utils/prefix';

describe('generatePrefix', () => {
  test('multi-word names use first letters', () => {
    expect(generatePrefix('Memory API')).toBe('MA');
    expect(generatePrefix('Media Manager')).toBe('MM');
  });

  test('single-word names use first 2 letters', () => {
    expect(generatePrefix('DevPlanner')).toBe('DE');
  });

  test('max 4 characters', () => {
    expect(generatePrefix('My Very Long Project Name')).toBe('MVLP');
  });

  test('collision avoidance with more letters', () => {
    expect(generatePrefix('Memory API', ['MA'])).not.toBe('MA');
  });

  test('collision avoidance with digit suffix', () => {
    const existing = ['MA', 'MEAP', 'MEMA'];
    const result = generatePrefix('Memory API', existing);
    expect(result).toBe('MA2');
  });

  test('handles empty existing prefixes array', () => {
    expect(generatePrefix('Test Project', [])).toBe('TP');
  });

  test('handles three-word names', () => {
    expect(generatePrefix('My Awesome Project')).toBe('MAP');
  });

  test('handles names with extra whitespace', () => {
    expect(generatePrefix('  My  Project  ')).toBe('MP');
  });

  test('collision resolution uses more letters before digits', () => {
    const result = generatePrefix('Memory API', ['MA']);
    // Should try "MEAP" first (2 letters from each word: ME + AP)
    expect(result).toBe('MEAP');
  });

  test('eventually uses digit suffix when variations exhausted', () => {
    const existing = ['MA', 'MEAP', 'MEMA'];
    const result = generatePrefix('Memory API', existing);
    expect(result).toBe('MA2');
  });

  test('increments digit suffix when multiple taken', () => {
    const existing = ['MA', 'MEAP', 'MEMA', 'MA2', 'MA3'];
    const result = generatePrefix('Memory API', existing);
    expect(result).toBe('MA4');
  });
});
