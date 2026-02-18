import { Elysia, t } from 'elysia';
import { FileService } from '../services/file.service';
import { CardService } from '../services/card.service';
import { ProjectService } from '../services/project.service';
import { WebSocketService } from '../services/websocket.service';
import { recordAndBroadcastHistory } from '../utils/history-helper';
import type {
  FileAddedData,
  FileDeletedData,
  FileUpdatedData,
  FileAssociatedData,
  FileDisassociatedData,
} from '../types';

export const fileRoutes = (workspacePath: string) => {
  const fileService = new FileService(workspacePath);
  const cardService = new CardService(workspacePath);
  const projectService = new ProjectService(workspacePath);
  const wsService = WebSocketService.getInstance();

  return new Elysia()
    // List all project files
    .get('/api/projects/:projectSlug/files', async ({ params }) => {
      const files = await fileService.listFiles(params.projectSlug);
      return { files };
    })

    // Upload file
    .post(
      '/api/projects/:projectSlug/files',
      async ({ params, body, set }) => {
        const { file, description } = body;
        
        // Read file buffer
        const buffer = await file.arrayBuffer();
        
        // Add file to project
        const fileEntry = await fileService.addFile(
          params.projectSlug,
          file.name,
          buffer,
          description || ''
        );
        
        set.status = 201;

        // Broadcast file:added event
        const eventData: FileAddedData = { file: fileEntry };
        wsService.broadcast(params.projectSlug, {
          type: 'event',
          event: {
            type: 'file:added',
            projectSlug: params.projectSlug,
            timestamp: new Date().toISOString(),
            data: eventData,
          },
        });

        // Record history
        recordAndBroadcastHistory(
          params.projectSlug,
          'file:uploaded',
          `File uploaded: ${fileEntry.originalName}`,
          { filename: fileEntry.filename }
        );

        return fileEntry;
      },
      {
        body: t.Object({
          file: t.File(),
          description: t.Optional(t.String()),
        }),
      }
    )

    // Get file metadata
    .get('/api/projects/:projectSlug/files/:filename', async ({ params }) => {
      const file = await fileService.getFile(params.projectSlug, params.filename);
      return file;
    })

    // Update file description
    .patch(
      '/api/projects/:projectSlug/files/:filename',
      async ({ params, body }) => {
        const file = await fileService.updateFileDescription(
          params.projectSlug,
          params.filename,
          body.description
        );

        // Broadcast file:updated event
        const eventData: FileUpdatedData = { file };
        wsService.broadcast(params.projectSlug, {
          type: 'event',
          event: {
            type: 'file:updated',
            projectSlug: params.projectSlug,
            timestamp: new Date().toISOString(),
            data: eventData,
          },
        });

        // Record history
        recordAndBroadcastHistory(
          params.projectSlug,
          'file:updated',
          `File description updated: ${params.filename}`,
          { filename: params.filename }
        );

        return file;
      },
      {
        body: t.Object({
          description: t.String(),
        }),
      }
    )

    // Delete file
    .delete('/api/projects/:projectSlug/files/:filename', async ({ params }) => {
      const result = await fileService.deleteFile(params.projectSlug, params.filename);

      // Broadcast file:deleted event
      const eventData: FileDeletedData = { filename: params.filename };
      wsService.broadcast(params.projectSlug, {
        type: 'event',
        event: {
          type: 'file:deleted',
          projectSlug: params.projectSlug,
          timestamp: new Date().toISOString(),
          data: eventData,
        },
      });

      // Record history
      recordAndBroadcastHistory(
        params.projectSlug,
        'file:deleted',
        `File deleted: ${params.filename}`,
        { filename: params.filename }
      );

      return result;
    })

    // Associate file with card
    .post(
      '/api/projects/:projectSlug/files/:filename/associate',
      async ({ params, body }) => {
        // Verify card exists
        await cardService.getCard(params.projectSlug, body.cardSlug);
        
        const file = await fileService.associateFile(
          params.projectSlug,
          params.filename,
          body.cardSlug
        );

        // Broadcast file:associated event
        const eventData: FileAssociatedData = {
          filename: params.filename,
          cardSlug: body.cardSlug,
        };
        wsService.broadcast(params.projectSlug, {
          type: 'event',
          event: {
            type: 'file:associated',
            projectSlug: params.projectSlug,
            timestamp: new Date().toISOString(),
            data: eventData,
          },
        });

        // Record history
        recordAndBroadcastHistory(
          params.projectSlug,
          'file:associated',
          `File "${params.filename}" associated with card "${body.cardSlug}"`,
          {
            filename: params.filename,
            cardSlug: body.cardSlug,
          }
        );

        return file;
      },
      {
        body: t.Object({
          cardSlug: t.String(),
        }),
      }
    )

    // Disassociate file from card
    .delete(
      '/api/projects/:projectSlug/files/:filename/associate/:cardSlug',
      async ({ params }) => {
        const file = await fileService.disassociateFile(
          params.projectSlug,
          params.filename,
          params.cardSlug
        );

        // Broadcast file:disassociated event
        const eventData: FileDisassociatedData = {
          filename: params.filename,
          cardSlug: params.cardSlug,
        };
        wsService.broadcast(params.projectSlug, {
          type: 'event',
          event: {
            type: 'file:disassociated',
            projectSlug: params.projectSlug,
            timestamp: new Date().toISOString(),
            data: eventData,
          },
        });

        // Record history
        recordAndBroadcastHistory(
          params.projectSlug,
          'file:disassociated',
          `File "${params.filename}" disassociated from card "${params.cardSlug}"`,
          {
            filename: params.filename,
            cardSlug: params.cardSlug,
          }
        );

        return file;
      }
    )

    // List files for a specific card
    .get('/api/projects/:projectSlug/cards/:cardSlug/files', async ({ params }) => {
      const files = await fileService.listCardFiles(params.projectSlug, params.cardSlug);
      return { files };
    })

    // Create file and associate with card (atomic operation)
    .post(
      '/api/projects/:projectSlug/cards/:cardSlug/files',
      async ({ params, body, set }) => {
        // Verify card exists first (fail-fast) and get card details
        const card = await cardService.getCard(params.projectSlug, params.cardSlug);
        
        // Get project to access prefix
        const project = await projectService.getProject(params.projectSlug);

        // Support both JSON content and multipart file upload
        let filename: string;
        let buffer: Buffer;
        let description = '';

        if ('file' in body && body.file) {
          // Multipart file upload
          const file = body.file;
          filename = file.name;
          buffer = Buffer.from(await file.arrayBuffer());
          description = body.description || '';
        } else if ('content' in body) {
          // JSON with text content
          filename = body.filename;
          buffer = Buffer.from(body.content, 'utf-8');
          description = body.description || '';
        } else {
          throw new Error('Either file or filename+content must be provided');
        }

        // Create file and associate with card (service handles filename formatting)
        const fileEntry = await fileService.addFileToCard(
          params.projectSlug,
          params.cardSlug,
          filename,
          buffer.toString('utf-8'),
          description,
          project.prefix,
          card.frontmatter.cardNumber
        );

        set.status = 201;

        // Broadcast file:added event
        const addedEventData: FileAddedData = { file: fileEntry };
        wsService.broadcast(params.projectSlug, {
          type: 'event',
          event: {
            type: 'file:added',
            projectSlug: params.projectSlug,
            timestamp: new Date().toISOString(),
            data: addedEventData,
          },
        });

        // Broadcast file:associated event
        const associatedEventData: FileAssociatedData = {
          filename: fileEntry.filename,
          cardSlug: params.cardSlug,
        };
        wsService.broadcast(params.projectSlug, {
          type: 'event',
          event: {
            type: 'file:associated',
            projectSlug: params.projectSlug,
            timestamp: new Date().toISOString(),
            data: associatedEventData,
          },
        });

        // Record history
        recordAndBroadcastHistory(
          params.projectSlug,
          'file:uploaded',
          `File created for card: ${fileEntry.originalName}`,
          {
            filename: fileEntry.filename,
            cardSlug: params.cardSlug,
          }
        );

        return fileEntry;
      },
      {
        body: t.Union([
          // JSON format with text content
          t.Object({
            filename: t.String(),
            content: t.String(),
            description: t.Optional(t.String()),
          }),
          // Multipart file upload
          t.Object({
            file: t.File(),
            description: t.Optional(t.String()),
          }),
        ]),
      }
    )

    // Download/serve file
    .get('/api/projects/:projectSlug/files/:filename/download', async ({ params }) => {
      const filePath = await fileService.getFilePath(params.projectSlug, params.filename);
      const file = await fileService.getFile(params.projectSlug, params.filename);
      
      // Serve file with proper headers
      return Bun.file(filePath, {
        type: file.mimeType,
      });
    });
};
