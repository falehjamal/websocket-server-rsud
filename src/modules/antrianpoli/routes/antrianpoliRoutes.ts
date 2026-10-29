import express, { type Router } from 'express';
import ConnectionManager from '../../../core/services/connectionManager.js';
import logger from '../../../core/services/logger.js';
import { createTimestamp, errorMessage } from '../../../core/utils/helpers.js';

class AntrianPoliRoutes {
    private readonly connectionManager: ConnectionManager;
    private readonly router: Router;

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
        this.router = express.Router();
        this.setupRoutes();
    }

    private setupRoutes(): void {
        this.router.get('/groups/active', (_req, res) => {
            try {
                const activeDisplays = this.connectionManager.getActiveDisplays();
                res.json({
                    success: true,
                    totalActiveGroups: activeDisplays.length,
                    groups: activeDisplays,
                    timestamp: createTimestamp()
                });
            } catch (error: unknown) {
                logger.error('❌ Error getting active antrianpoli groups:', error);
                res.status(500).json({
                    error: 'Failed to get active antrianpoli groups',
                    message: errorMessage(error)
                });
            }
        });

        this.router.get('/groups/:groupId', (req, res) => {
            try {
                const groupId = req.params['groupId'];
                if (groupId === undefined) {
                    throw new TypeError('groupId missing');
                }
                const roomName = `group_${groupId}`;
                const room = this.connectionManager.io.sockets.adapter.rooms.get(roomName);
                const clientCount = room ? room.size : 0;

                res.json({
                    success: true,
                    groupId,
                    roomName,
                    clientCount,
                    timestamp: createTimestamp()
                });
            } catch (error: unknown) {
                logger.error('❌ Error getting antrianpoli group info:', error);
                res.status(500).json({
                    error: 'Failed to get group info',
                    message: errorMessage(error)
                });
            }
        });
    }

    getRouter(): Router {
        return this.router;
    }
}

export default AntrianPoliRoutes;
