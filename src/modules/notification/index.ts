import type { AppSocket } from '../../core/types/index.js';
import type { Router } from 'express';
import ConnectionManager from '../../core/services/connectionManager.js';
import logger from '../../core/services/logger.js';
import NotificationHandlers from './handlers/notificationHandlers.js';
import NotificationRoutes from './routes/notificationRoutes.js';

class NotificationModule {
    private readonly handlers: NotificationHandlers;
    private readonly routes: NotificationRoutes;

    constructor(connectionManager: ConnectionManager) {
        this.handlers = new NotificationHandlers();
        this.routes = new NotificationRoutes(connectionManager);
        logger.info('Notification module initialized');
    }

    registerSocketHandlers(socket: AppSocket): void {
        socket.on('join-notification', (data) => {
            this.handlers.handleJoinNotification(socket, data);
        });
        socket.on('leave-notification', () => {
            this.handlers.handleLeaveNotification(socket);
        });
    }

    getRoutes(): Router {
        return this.routes.getRouter();
    }

    handleDisconnection(socket: AppSocket): void {
        this.handlers.handleDisconnection(socket);
    }

    async shutdown(): Promise<void> {
        logger.info('Notification module shutting down');
    }
}

export default NotificationModule;
