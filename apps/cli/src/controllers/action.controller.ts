import { Request, Response } from 'express';
import { EngineService } from '../services/engine.service';
import type { TlxRuntimeContext } from '../services/runtime-context.service';

export class ActionController {
  private readonly engineService = new EngineService();

  constructor(private readonly context: TlxRuntimeContext) {}

  getStatus = async (_req: Request, res: Response) => {
    try {
      const status = await this.engineService.getSystemStatus();
      res.json({
        ...status,
        dashboardPort: this.context.dashboardPort,
        projectUrl: this.context.projectUrl,
        framework: this.context.project.framework,
        rootDir: this.context.project.rootDir,
        startedAt: this.context.startedAt,
      });
    } catch {
      res.status(500).json({ error: 'Failed to get system status' });
    }
  };

  getProject = (_req: Request, res: Response) => {
    const { scanGraph: _scanGraph, ...project } = this.context.project;

    res.json({
      ...project,
      projectUrl: this.context.projectUrl,
      dashboardPort: this.context.dashboardPort,
    });
  };

  getGraph = (_req: Request, res: Response) => {
    res.json(this.context.project.scanGraph);
  };

  triggerScan = async (_req: Request, res: Response) => {
    try {
      const result = await this.engineService.runProjectScan(this.context.projectUrl);
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Failed to trigger project scan' });
    }
  };
}
