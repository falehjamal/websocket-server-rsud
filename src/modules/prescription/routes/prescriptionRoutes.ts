import express, { type Router } from 'express';
import ConnectionManager from '../../../core/services/connectionManager.js';
import logger from '../../../core/services/logger.js';
import { createTimestamp, errorMessage, isJsonObject } from '../../../core/utils/helpers.js';

class PrescriptionRoutes {
    private readonly connectionManager: ConnectionManager;
    private readonly router: Router;

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
        this.router = express.Router();
        this.setupRoutes();
    }

    private setupRoutes(): void {
        this.router.get('/active', (_req, res) => {
            try {
                const roomName = 'prescription';
                const room = this.connectionManager.io.sockets.adapter.rooms.get(roomName);
                const clientCount = room ? room.size : 0;

                res.json({
                    success: true,
                    roomName,
                    activeConnections: clientCount,
                    timestamp: createTimestamp()
                });
            } catch (error: unknown) {
                logger.error('❌ Error getting prescription connections:', error);
                res.status(500).json({
                    error: 'Failed to get prescription connections',
                    message: errorMessage(error)
                });
            }
        });

        this.router.post('/broadcast', (req, res) => {
            try {
                if (!isJsonObject(req.body)) {
                    throw new TypeError('Payload must be an object');
                }
                const message = req.body['message'];
                if (typeof message !== 'string' || message === '') {
                    res.status(400).json({
                        error: 'Message is required'
                    });
                    return;
                }

                const timestamp = createTimestamp();
                this.connectionManager.io.to('prescription').emit('prescription-broadcast', {
                    message,
                    data: req.body['data'],
                    timestamp
                });

                res.json({
                    success: true,
                    message: 'Broadcast sent successfully',
                    timestamp
                });
            } catch (error: unknown) {
                logger.error('❌ Error broadcasting to prescription:', error);
                res.status(500).json({
                    error: 'Failed to broadcast message',
                    message: errorMessage(error)
                });
            }
        });
    }

    getRouter(): Router {
        return this.router;
    }
}

export default PrescriptionRoutes;
