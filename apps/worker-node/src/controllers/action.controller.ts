import { Request, Response } from 'express';
import type { TlxCacheDiffResponse, TlxGraphResponse, TlxProjectResponse, TlxScanActionRequest, TlxScanReport, TlxScanResultResponse, TlxStatusResponse } from '@tlx/contracts';
import { EngineService } from '../services/engine.service';
import type { TlxRuntimeContext } from '../services/runtime-context.service';

export class ActionController {
  private readonly engineService = new EngineService();

  constructor(private readonly context: TlxRuntimeContext) {}

  getStatus = async (_req: Request, res: Response) => {
    try {
      const status = await this.engineService.getSystemStatus();
      const response: TlxStatusResponse = {
        ...status,
        dashboardPort: this.context.dashboardPort,
        projectUrl: this.context.projectUrl,
        framework: this.context.project.framework,
        rootDir: this.context.project.rootDir,
        startedAt: this.context.startedAt,
      };

      res.json(response);
    } catch {
      res.status(500).json({ error: 'Failed to get system status' });
    }
  };

  getProject = (_req: Request, res: Response) => {
    const { scanGraph: _scanGraph, ...project } = this.context.project;

    const response: TlxProjectResponse = {
      ...project,
      projectUrl: this.context.projectUrl,
      dashboardPort: this.context.dashboardPort,
    };

    res.json(response);
  };

  getGraph = (_req: Request, res: Response) => {
    const response: TlxGraphResponse = this.context.project.scanGraph;
    res.json(response);
  };

  getCacheDiff = async (_req: Request, res: Response) => {
    try {
      const response: TlxCacheDiffResponse = await this.engineService.getCacheDiff(this.context.project);
      res.json(response);
    } catch {
      res.status(500).json({ error: 'Failed to get cache diff' });
    }
  };

  getLatestReport = async (_req: Request, res: Response) => {
    try {
      const report = await this.engineService.getLatestReport(this.context.project);
      const response: TlxScanReport | { empty: true; issues: [] } = report ?? { empty: true, issues: [] };
      res.json(response);
    } catch {
      res.status(500).json({ error: 'Failed to get latest report' });
    }
  };

  triggerScan = async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as TlxScanActionRequest;
      const result: TlxScanResultResponse = await this.engineService.runProjectScan({
        project: this.context.project,
        projectUrl: this.context.projectUrl,
        scope: body.scope,
        route: body.route,
      });
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Failed to trigger project scan' });
    }
  };
}
