import type { AppServer, AppSocket } from '../../core/types/index.js';
import type { Router } from 'express';
import ConnectionManager from '../../core/services/connectionManager.js';
import logger from '../../core/services/logger.js';
import AntrianPoliHandlers from './handlers/antrianpoliHandlers.js';
import AntrianPoliRoutes from './routes/antrianpoliRoutes.js';

class AntrianPoliModule {
    private readonly handlers: AntrianPoliHandlers;
    private readonly routes: AntrianPoliRoutes;

    constructor(io: AppServer, connectionManager: ConnectionManager) {
        this.handlers = new AntrianPoliHandlers(io, connectionManager);
        this.routes = new AntrianPoliRoutes(connectionManager);
        logger.info('📦 AntrianPoli module initialized');
    }

    registerSocketHandlers(socket: AppSocket): void {
        socket.on('join-group', (data) => {
            this.handlers.handleJoinGroup(socket, data);
        });
        socket.on('leave-group', (data) => {
            this.handlers.handleLeaveGroup(socket, data);
        });
        socket.on('register-display', (data) => {
            this.handlers.handleRegisterDisplay(socket, data);
        });
    }

    getRoutes(): Router {
        return this.routes.getRouter();
    }

    handleDisconnection(socket: AppSocket): void {
        this.handlers.handleDisconnection(socket);
    }

    async shutdown(): Promise<void> {
        logger.info('📦 AntrianPoli module shutting down');
    }
}

export default AntrianPoliModule;
