import express from 'express';
import cors from 'cors';
import { createApiRoutes } from './routes';
import type { TlxRuntimeContext } from '../services/runtime-context.service';

export function createServer(context: TlxRuntimeContext): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TLX Dashboard</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 40px; background: #0a0a0a; color: #f5f5f5; }
      code, pre { background: #1f2937; border-radius: 6px; padding: 2px 6px; }
      a { color: #67e8f9; }
      .grid { display: grid; gap: 12px; max-width: 760px; }
      .card { border: 1px solid #262626; border-radius: 8px; padding: 16px; background: #111827; }
    </style>
  </head>
  <body>
    <main class="grid">
      <h1>TLX Dashboard</h1>
      <section class="card">
        <p><strong>Framework:</strong> ${context.project.framework}</p>
        <p><strong>Project URL:</strong> <code>${context.projectUrl}</code></p>
        <p><strong>Root:</strong> <code>${context.project.rootDir}</code></p>
      </section>
      <section class="card">
        <p><strong>Pages:</strong> ${context.project.scanGraph.pages.length}</p>
        <p><strong>Components:</strong> ${context.project.scanGraph.components.length}</p>
        <p><strong>APIs:</strong> ${context.project.scanGraph.apis.length}</p>
      </section>
      <section class="card">
        <p>API giai đoạn đầu:</p>
        <p><a href="/api/status">/api/status</a></p>
        <p><a href="/api/project">/api/project</a></p>
        <p><a href="/api/graph">/api/graph</a></p>
      </section>
    </main>
  </body>
</html>`);
  });

  app.use('/api', createApiRoutes(context));

  return app;
}
