import type { AppSocket } from '../../core/types/index.js';
import type { Router } from 'express';
import ConnectionManager from '../../core/services/connectionManager.js';
import logger from '../../core/services/logger.js';
import PrescriptionHandlers from './handlers/prescriptionHandlers.js';
import PrescriptionRoutes from './routes/prescriptionRoutes.js';

class PrescriptionModule {
    private readonly handlers: PrescriptionHandlers;
    private readonly routes: PrescriptionRoutes;

    constructor(connectionManager: ConnectionManager) {
        this.handlers = new PrescriptionHandlers();
        this.routes = new PrescriptionRoutes(connectionManager);
        logger.info('📦 Prescription module initialized');
    }

    registerSocketHandlers(socket: AppSocket): void {
        socket.on('join-user-room', (data) => {
            this.handlers.handleJoinUserRoom(socket, data);
        });
        socket.on('join-prescription', () => {
            this.handlers.handleJoinPrescription(socket);
        });
        socket.on('leave-prescription', () => {
            this.handlers.handleLeavePrescription(socket);
        });
    }

    getRoutes(): Router {
        return this.routes.getRouter();
    }

    handleDisconnection(socket: AppSocket): void {
        this.handlers.handleDisconnection(socket);
    }

    async shutdown(): Promise<void> {
        logger.info('📦 Prescription module shutting down');
    }
}

export default PrescriptionModule;
