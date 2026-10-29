import express, { type Router } from 'express';
import type { JsonObject } from '../../../core/types/index.js';
import BroadcastService from '../../../core/services/broadcast.js';
import ConnectionManager from '../../../core/services/connectionManager.js';
import logger from '../../../core/services/logger.js';
import { createTimestamp, errorMessage, isTruthyJson, requireJsonObject } from '../../../core/utils/helpers.js';

class AdminRoutes {
    private readonly connectionManager: ConnectionManager;
    private readonly broadcastService: BroadcastService;
    private readonly router: Router;

    constructor(connectionManager: ConnectionManager, broadcastService: BroadcastService) {
        this.connectionManager = connectionManager;
        this.broadcastService = broadcastService;
        this.router = express.Router();
        this.setupRoutes();
    }

    private setupRoutes(): void {
        this.router.get('/displays/active', (_req, res) => {
            try {
                const activeDisplays = this.connectionManager.getActiveDisplays();
                res.json({
                    success: true,
                    totalActiveDisplays: activeDisplays.length,
                    displays: activeDisplays,
                    timestamp: createTimestamp()
                });
                logger.info(`📊 Admin API: Active displays requested - ${activeDisplays.length} displays found`);
            } catch (error: unknown) {
                logger.error('❌ Admin API: Error getting active displays:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to get active displays',
                    message: errorMessage(error),
                    timestamp: createTimestamp()
                });
            }
        });

        this.router.post('/displays/refresh', (req, res) => {
            try {
                const body = requireJsonObject(req.body);
                const source = body['source'] === undefined ? 'admin-api' : body['source'];
                const payload: JsonObject = {
                    action: 'refresh',
                    timestamp: createTimestamp(),
                    source,
                    requestId: `api_refresh_${Date.now()}`
                };
                if (body['message'] !== undefined) {
                    payload['message'] = body['message'];
                }

                const broadcastResult = this.broadcastService.broadcastToAllDisplays('refresh-all-displays', payload);
                res.json({
                    success: true,
                    message: 'Refresh command sent to all display clients',
                    totalClientsReached: broadcastResult.totalClientsReached,
                    displayRoomsCount: broadcastResult.displayRoomsCount,
                    broadcastResults: broadcastResult.broadcastResults,
                    timestamp: createTimestamp()
                });
                logger.info('✅ Admin API: Refresh command broadcasted', broadcastResult);
            } catch (error: unknown) {
                logger.error('❌ Admin API: Error broadcasting refresh:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to broadcast refresh command',
                    message: errorMessage(error),
                    timestamp: createTimestamp()
                });
            }
        });

        this.router.post('/displays/broadcast', (req, res) => {
            try {
                const body = requireJsonObject(req.body);
                const event = body['event'];
                const message = body['message'];
                if (!isTruthyJson(event) || typeof event !== 'string' || !isTruthyJson(message)) {
                    res.status(400).json({
                        success: false,
                        error: 'Event and message are required',
                        timestamp: createTimestamp()
                    });
                    return;
                }

                const extra = body['data'] === undefined ? {} : requireJsonObject(body['data']);
                const payload: JsonObject = {
                    message,
                    timestamp: createTimestamp(),
                    source: 'admin-api',
                    requestId: `api_broadcast_${Date.now()}`,
                    ...extra
                };
                const broadcastResult = this.broadcastService.broadcastToAllDisplays(event, payload);
                res.json({
                    success: true,
                    message: 'Custom message broadcasted to all display clients',
                    totalClientsReached: broadcastResult.totalClientsReached,
                    displayRoomsCount: broadcastResult.displayRoomsCount,
                    broadcastResults: broadcastResult.broadcastResults,
                    timestamp: createTimestamp()
                });
                logger.info('✅ Admin API: Custom broadcast sent', {
                    event,
                    message,
                    ...broadcastResult
                });
            } catch (error: unknown) {
                logger.error('❌ Admin API: Error broadcasting custom message:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to broadcast custom message',
                    message: errorMessage(error),
                    timestamp: createTimestamp()
                });
            }
        });

        this.router.get('/system/stats', (_req, res) => {
            try {
                const activeDisplays = this.connectionManager.getActiveDisplays();
                const allConnections = this.connectionManager.getAllConnections();
                const timestamp = createTimestamp();
                const stats = {
                    totalConnections: allConnections.length,
                    totalActiveDisplays: activeDisplays.length,
                    displayGroups: activeDisplays.map((display) => ({
                        groupNumber: display.groupNumber,
                        clientCount: display.clientCount,
                        permalink: display.permalink
                    })),
                    uptime: process.uptime(),
                    memoryUsage: process.memoryUsage(),
                    timestamp
                };

                res.json({
                    success: true,
                    stats,
                    timestamp
                });
                logger.info('📊 Admin API: System stats requested');
            } catch (error: unknown) {
                logger.error('❌ Admin API: Error getting system stats:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to get system stats',
                    message: errorMessage(error),
                    timestamp: createTimestamp()
                });
            }
        });
    }

    getRouter(): Router {
        return this.router;
    }
}

export default AdminRoutes;
