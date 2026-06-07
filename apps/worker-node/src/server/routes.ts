import { Router } from 'express';
import { ActionController } from '../controllers/action.controller';
import type { TlxRuntimeContext } from '../services/runtime-context.service';

export function createApiRoutes(context: TlxRuntimeContext): Router {
  const router: Router = Router();
  const controller = new ActionController(context);

  router.get('/status', controller.getStatus);
  router.get('/project', controller.getProject);
  router.get('/graph', controller.getGraph);
  router.get('/cache/diff', controller.getCacheDiff);
  router.get('/report/latest', controller.getLatestReport);
  router.get('/auth/status', controller.getAuthStatus);
  router.post('/actions/auth/start', controller.startAuth);
  router.post('/actions/auth/clear', controller.clearAuth);
  router.post('/actions/scan', controller.triggerScan);

  return router;
}
