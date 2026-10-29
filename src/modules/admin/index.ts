import type { AppSocket } from '../../core/types/index.js';
import type { Router } from 'express';
import BroadcastService from '../../core/services/broadcast.js';
import ConnectionManager from '../../core/services/connectionManager.js';
import logger from '../../core/services/logger.js';
import { createTimestamp } from '../../core/utils/helpers.js';
import AdminHandlers from './handlers/adminHandlers.js';
import AdminRoutes from './routes/adminRoutes.js';

class AdminModule {
    private readonly handlers: AdminHandlers;
    private readonly routes: AdminRoutes;

    constructor(connectionManager: ConnectionManager, broadcastService: BroadcastService) {
        this.handlers = new AdminHandlers(connectionManager, broadcastService);
        this.routes = new AdminRoutes(connectionManager, broadcastService);
        logger.info('🛡️ Admin module initialized');
    }

    registerSocketHandlers(socket: AppSocket): void {
        socket.on('refresh-all-displays', (data) => {
            this.handlers.handleRefreshAllDisplays(socket, data);
        });
        socket.on('admin-broadcast-message', (data) => {
            this.handlers.handleBroadcastMessage(socket, data);
        });
        socket.on('admin-get-active-displays', () => {
            this.handlers.handleGetActiveDisplays(socket);
        });
        socket.on('join-admin', () => {
            socket.join('admin');
            socket.emit('admin-joined', {
                success: true,
                message: 'Successfully joined admin room',
                timestamp: createTimestamp(),
                socketId: socket.id
            });
            logger.info(`🛡️ Socket ${socket.id} joined admin room`);
        });
        socket.on('leave-admin', () => {
            socket.leave('admin');
            socket.emit('admin-left', {
                success: true,
                message: 'Successfully left admin room',
                timestamp: createTimestamp()
            });
            logger.info(`🛡️ Socket ${socket.id} left admin room`);
        });
        logger.debug(`🛡️ Admin handlers registered for socket ${socket.id}`);
    }

    getRoutes(): Router {
        return this.routes.getRouter();
    }

    handleDisconnection(socket: AppSocket): void {
        logger.debug(`🛡️ Admin module handling disconnection for socket ${socket.id}`);
    }

    async shutdown(): Promise<void> {
        logger.info('🛡️ Admin module shutting down');
    }
}

export default AdminModule;
