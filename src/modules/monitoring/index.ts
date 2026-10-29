import express, { type Router } from 'express';
import type { AppServer, AppSocket, MonitoringSuccessPayload, MonitoringUpdatePayload, MysqlConfig } from '../../core/types/index.js';
import logger from '../../core/services/logger.js';
import ConnectionManager from '../../core/services/connectionManager.js';
import { errorMessage } from '../../core/utils/helpers.js';
import UserDirectory from './userDirectory.js';

class MonitoringModule {
    private readonly io: AppServer;
    private readonly connectionManager: ConnectionManager;
    private readonly userDirectory: UserDirectory;
    private readonly router: Router;
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(io: AppServer, connectionManager: ConnectionManager, mysql: MysqlConfig | null) {
        this.io = io;
        this.connectionManager = connectionManager;
        this.userDirectory = new UserDirectory(mysql);
        this.router = express.Router();
        this.router.get('/clients', (_req, res) => {
            void this.clients(res);
        });
        logger.info('Monitoring module initialized');
    }

    registerSocketHandlers(socket: AppSocket): void {
        socket.on('join-monitoring', () => {
            socket.join('monitoring');
            socket.data.monitoring = true;
            this.schedule();
        });

        socket.on('monitoring:refresh', () => {
            if (!socket.data.monitoring) {
                return;
            }
            this.schedule();
        });

        socket.on('join-notification', () => {
            this.schedule();
        });
        socket.on('leave-notification', () => {
            this.schedule();
        });
        socket.on('join-prescription', () => {
            this.schedule();
        });
        socket.on('leave-prescription', () => {
            this.schedule();
        });
        socket.on('join-user-room', () => {
            this.schedule();
        });
        socket.on('join-group', () => {
            this.schedule();
        });
        socket.on('leave-group', () => {
            this.schedule();
        });
        socket.on('register-display', () => {
            this.schedule();
        });
    }

    private schedule(): void {
        if (this.timer) {
            return;
        }
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.push();
        }, 200);
    }

    private async push(): Promise<void> {
        try {
            const room = this.io.sockets.adapter.rooms.get('monitoring');
            if (!room || room.size === 0) {
                return;
            }
            const payload = await this.buildPayload();
            this.io.to('monitoring').emit('monitoring:update', successPayload(payload));
        } catch (error: unknown) {
            logger.error('Error pushing monitoring snapshot:', error);
        }
    }

    private async clients(res: express.Response): Promise<void> {
        try {
            const payload = await this.buildPayload();
            res.json(successPayload(payload));
        } catch (error: unknown) {
            logger.error('Error building monitoring snapshot:', error);
            res.status(500).json({
                success: false,
                error: 'Gagal mengambil klien websocket',
                message: errorMessage(error)
            });
        }
    }

    private async buildPayload(): Promise<MonitoringUpdatePayload> {
        const snapshot = await this.connectionManager.buildMonitoringSnapshot();
        return this.userDirectory.enrich(snapshot);
    }

    getRoutes(): Router {
        return this.router;
    }

    handleDisconnection(socket: AppSocket): void {
        void socket;
        this.schedule();
    }

    async shutdown(): Promise<void> {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        await this.userDirectory.shutdown();
        logger.info('Monitoring module shutting down');
    }
}

function successPayload(payload: MonitoringUpdatePayload): MonitoringSuccessPayload {
    return {
        success: true,
        notifications: payload.notifications,
        prescriptions: payload.prescriptions,
        displays: payload.displays,
        timestamp: payload.timestamp,
        updated_at: payload.updated_at,
        summary: payload.summary
    };
}

export default MonitoringModule;
