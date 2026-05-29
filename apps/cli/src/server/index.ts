import express from 'express';
import cors from 'cors';
import apiRoutes from './routes';

export function createServer(): any{
  const app = express();
  
  app.use(cors());
  app.use(express.json());

  // Gắn tất cả API vào tiền tố /api
  app.use('/api', apiRoutes);

  return app;
}