/**
 * MCP Error Handling Utilities
 * 
 * Provides standardized error responses with LLM-friendly messages and actionable suggestions.
 */

import type { MCPErrorResponse, MCPErrorSuggestion } from './types.js';

/**
 * Custom error class for MCP-specific errors
 */
export class MCPError extends Error {
  public readonly code: string;
  public readonly suggestions: MCPErrorSuggestion[];

  constructor(code: string, message: string, suggestions: MCPErrorSuggestion[] = []) {
    super(message);
    this.name = 'MCPError';
    this.code = code;
    this.suggestions = suggestions;
  }

  toJSON(): MCPErrorResponse {
    return {
      error: this.code,
      message: this.message,
      suggestions: this.suggestions.length > 0 ? this.suggestions : undefined,
    };
  }
}

/**
 * Common error constructors with helpful suggestions
 */

export function projectNotFoundError(projectSlug: string, availableProjects?: string[]): MCPError {
  const suggestions: MCPErrorSuggestion[] = [];

  if (availableProjects && availableProjects.length > 0) {
    suggestions.push({
      action: `Call list_projects to see all available projects`,
      reason: 'The project you specified does not exist',
    });
    
    // Suggest similar project names
    const similar = availableProjects.filter(p => 
      p.includes(projectSlug.toLowerCase()) || projectSlug.toLowerCase().includes(p)
    );
    if (similar.length > 0) {
      suggestions.push({
        action: `Try one of these similar projects: ${similar.slice(0, 3).join(', ')}`,
        reason: 'These project slugs contain similar characters',
      });
    }
  }

  return new MCPError(
    'PROJECT_NOT_FOUND',
    `Project "${projectSlug}" not found. Use list_projects to see available projects.`,
    suggestions
  );
}

export function cardNotFoundError(
  cardSlug: string,
  projectSlug: string,
  availableCards?: string[]
): MCPError {
  const suggestions: MCPErrorSuggestion[] = [
    {
      action: `Call list_cards with projectSlug="${projectSlug}" to see all cards`,
      reason: 'The card you specified does not exist in this project',
    },
  ];

  if (availableCards && availableCards.length > 0) {
    // Suggest similar card slugs
    const similar = availableCards.filter(c => 
      c.includes(cardSlug.toLowerCase()) || cardSlug.toLowerCase().includes(c)
    );
    if (similar.length > 0) {
      suggestions.push({
        action: `Try one of these similar cards: ${similar.slice(0, 3).join(', ')}`,
        reason: 'These card slugs contain similar characters',
      });
    }
  }

  return new MCPError(
    'CARD_NOT_FOUND',
    `Card "${cardSlug}" not found in project "${projectSlug}".`,
    suggestions
  );
}

export function invalidLaneError(lane: string, validLanes: string[]): MCPError {
  return new MCPError(
    'INVALID_LANE',
    `Invalid lane "${lane}". Valid lanes are: ${validLanes.join(', ')}`,
    [
      {
        action: `Use one of these lane slugs: ${validLanes.join(', ')}`,
        reason: 'Lane slugs must match the exact folder names in the project',
      },
    ]
  );
}

export function taskIndexOutOfRangeError(
  taskIndex: number,
  maxIndex: number,
  cardSlug: string
): MCPError {
  return new MCPError(
    'TASK_INDEX_OUT_OF_RANGE',
    `Task index ${taskIndex} is out of range. Card "${cardSlug}" has ${maxIndex + 1} tasks (indices 0-${maxIndex}).`,
    [
      {
        action: `Call get_card with cardSlug="${cardSlug}" to see all tasks`,
        reason: 'You need to know the valid task indices for this card',
      },
      {
        action: `Use taskIndex between 0 and ${maxIndex}`,
        reason: 'Task indices are 0-based',
      },
    ]
  );
}

export function validationError(field: string, issue: string, expected?: string): MCPError {
  const suggestions: MCPErrorSuggestion[] = [];

  if (expected) {
    suggestions.push({
      action: expected,
      reason: `The ${field} parameter has an invalid value`,
    });
  }

  return new MCPError(
    'VALIDATION_ERROR',
    `Validation failed for "${field}": ${issue}`,
    suggestions
  );
}

export function emptyTaskTextError(): MCPError {
  return new MCPError(
    'EMPTY_TASK_TEXT',
    'Task text cannot be empty',
    [
      {
        action: 'Provide a non-empty string for the "text" parameter',
        reason: 'Tasks must have descriptive text',
      },
    ]
  );
}

export function taskTextTooLongError(maxLength: number): MCPError {
  return new MCPError(
    'TASK_TEXT_TOO_LONG',
    `Task text exceeds maximum length of ${maxLength} characters`,
    [
      {
        action: `Shorten the task text to ${maxLength} characters or less`,
        reason: 'Long task descriptions should be in the card content, not in tasks',
      },
    ]
  );
}

export function fileNotFoundError(
  filename: string,
  projectSlug: string,
  availableFiles?: string[]
): MCPError {
  const suggestions: MCPErrorSuggestion[] = [
    {
      action: `Call list_project_files with projectSlug="${projectSlug}" to see all files`,
      reason: 'The file you specified does not exist in this project',
    },
  ];

  if (availableFiles && availableFiles.length > 0) {
    // Suggest similar filenames
    const similar = availableFiles.filter(f => 
      f.includes(filename.toLowerCase()) || filename.toLowerCase().includes(f)
    );
    if (similar.length > 0) {
      suggestions.push({
        action: `Try one of these similar files: ${similar.slice(0, 3).join(', ')}`,
        reason: 'These filenames contain similar characters',
      });
    }
  }

  return new MCPError(
    'FILE_NOT_FOUND',
    `File "${filename}" not found in project "${projectSlug}".`,
    suggestions
  );
}

export function binaryFileError(filename: string, mimeType: string, size: number): MCPError {
  const sizeKB = (size / 1024).toFixed(1);
  return new MCPError(
    'BINARY_FILE_ERROR',
    `File "${filename}" is binary (${mimeType}, ${sizeKB} KB). Cannot read as text. Please rely on the file description instead.`,
    [
      {
        action: `Use list_project_files or list_card_files to see the file description`,
        reason: 'Binary files like PDFs and images cannot be read as text. Use their descriptions to understand their content.',
      },
      {
        action: 'If this file should be readable, ensure it has a text-based format (.txt, .md, .json, etc.)',
        reason: 'Only text-based files can be read through the read_file_content tool',
      },
    ]
  );
}

/**
 * Convert any error to an MCP error response
 */
export function toMCPError(error: unknown): MCPErrorResponse {
  if (error instanceof MCPError) {
    return error.toJSON();
  }

  if (error instanceof Error) {
    return {
      error: 'INTERNAL_ERROR',
      message: error.message,
    };
  }

  return {
    error: 'UNKNOWN_ERROR',
    message: String(error),
  };
}
