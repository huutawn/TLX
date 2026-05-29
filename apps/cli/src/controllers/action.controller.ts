import {Request, Response} from 'express';
import {EngineService} from '../services/engine.service';

const engineService = new EngineService();

export class ActionController{
    static async getStatus(req: Request, res: Response) {
        try {
            const status = await engineService.getSystemStatus();
            res.json(status);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get system status' });
        }
    }
    static async triggerScan(req: Request, res: Response) {
        try{
            const result = await engineService.runProjectScan();
            res.json(result);
        }catch(error){
            res.status(500).json({ error: 'Failed to trigger project scan' });
        }
    }
}