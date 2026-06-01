import type { ProjectMetadata } from './detector.service';

export interface TlxRuntimeContext {
  dashboardPort: number;
  projectUrl: string;
  startedAt: string;
  project: ProjectMetadata;
}
