import { existsSync } from 'fs';

/**
 * Configuration service that centralizes environment variable loading and validation
 */
export class ConfigService {
  private static instance: ConfigService;

  public readonly workspacePath: string;
  public readonly port: number;

  private constructor() {
    // Load and validate DEVPLANNER_WORKSPACE
    const workspacePath = process.env.DEVPLANNER_WORKSPACE;

    if (!workspacePath) {
      console.error('Error: DEVPLANNER_WORKSPACE environment variable is not set');
      console.error('Please set it to the absolute path of your workspace directory');
      process.exit(1);
    }

    if (!existsSync(workspacePath)) {
      console.error(`Error: Workspace directory does not exist: ${workspacePath}`);
      console.error('Please create the directory or set DEVPLANNER_WORKSPACE to a valid path');
      process.exit(1);
    }

    this.workspacePath = workspacePath;

    // Load PORT with default value
    this.port = process.env.PORT ? parseInt(process.env.PORT) : 17103;
  }

  /**
   * Get the singleton instance of ConfigService
   */
  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }
}
