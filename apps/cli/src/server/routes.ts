import { Router } from 'express';
import { ActionController } from '../controllers/action.controller';

const router:Router = Router();

// Định nghĩa các endpoint rõ ràng
router.get('/status', ActionController.getStatus);
router.post('/actions/scan', ActionController.triggerScan);

export default router;