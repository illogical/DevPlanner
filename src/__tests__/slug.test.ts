import { describe, expect, test } from 'bun:test';
import { slugify } from '../utils/slug';

describe('slugify', () => {
  test('converts to lowercase', () => {
    expect(slugify('My Card Title')).toBe('my-card-title');
    expect(slugify('USER AUTHENTICATION')).toBe('user-authentication');
  });

  test('replaces spaces with hyphens', () => {
    expect(slugify('user auth system')).toBe('user-auth-system');
    expect(slugify('api endpoints')).toBe('api-endpoints');
  });

  test('removes special characters', () => {
    expect(slugify('My Card Title!')).toBe('my-card-title');
    expect(slugify('API/Endpoints (v2)')).toBe('api-endpoints-v2');
    expect(slugify('User@Auth#System')).toBe('user-auth-system');
  });

  test('handles multiple spaces', () => {
    expect(slugify('user   auth   system')).toBe('user-auth-system');
  });

  test('removes leading and trailing spaces', () => {
    expect(slugify('  user auth  ')).toBe('user-auth');
  });

  test('removes leading and trailing hyphens', () => {
    expect(slugify('-user-auth-')).toBe('user-auth');
  });

  test('handles underscores', () => {
    expect(slugify('user_auth_system')).toBe('user-auth-system');
  });

  test('handles multiple hyphens', () => {
    expect(slugify('user---auth')).toBe('user-auth');
  });

  test('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  test('handles only special characters', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('---')).toBe('');
  });

  test('preserves numbers', () => {
    expect(slugify('Project 123')).toBe('project-123');
    expect(slugify('v2.0 Release')).toBe('v2-0-release');
  });

  test('handles complex real-world examples', () => {
    expect(slugify('User Authentication System')).toBe('user-authentication-system');
    expect(slugify('Video Upload Pipeline')).toBe('video-upload-pipeline');
    expect(slugify('Image Thumbnail Generation')).toBe('image-thumbnail-generation');
    expect(slugify('Media Library UI')).toBe('media-library-ui');
  });
});
