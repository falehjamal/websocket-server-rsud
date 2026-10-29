import express, { type Express } from 'express';
import { createServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import config from './core/config/index.js';
import logger from './core/services/logger.js';
import RedisService from './core/services/redis.js';
import BroadcastService from './core/services/broadcast.js';
import ConnectionManager from './core/services/connectionManager.js';
import mongoLog from './core/services/mongoLog.js';
import AntrianPoliModule from './modules/antrianpoli/index.js';
import PrescriptionModule from './modules/prescription/index.js';
import AdminModule from './modules/admin/index.js';
import NotificationModule from './modules/notification/index.js';
import MonitoringModule from './modules/monitoring/index.js';
import type { AppModule, AppServer, AppSocket } from './core/types/index.js';
import { cleanIp, errorMessage } from './core/utils/helpers.js';

class WebSocketServer {
    private readonly config = config;
    private readonly app: Express;
    private readonly server: HttpServer;
    private readonly io: AppServer;
    private readonly connectionManager: ConnectionManager;
    private readonly broadcastService: BroadcastService;
    private readonly redisService: RedisService;
    private readonly modules = new Map<string, AppModule>();
    private shuttingDown = false;

    constructor() {
        this.app = express();
        this.server = createServer(this.app);
        this.io = new Server(this.server, {
            cors: this.config.cors,
            transports: ['websocket', 'polling'],
            allowEIO3: true
        });

        this.connectionManager = new ConnectionManager(this.io);
        this.broadcastService = new BroadcastService(this.io);
        this.redisService = new RedisService(this.config, this.io, this.broadcastService);

        this.initializeModules();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
    }

    private initializeModules(): void {
        this.modules.set('antrianpoli', new AntrianPoliModule(this.io, this.connectionManager));
        this.modules.set('prescription', new PrescriptionModule(this.connectionManager));
        this.modules.set('admin', new AdminModule(this.connectionManager, this.broadcastService));
        this.modules.set('notification', new NotificationModule(this.connectionManager));
        this.modules.set('monitoring', new MonitoringModule(this.io, this.connectionManager, this.config.mysql));

        logger.info(`📦 Initialized ${this.modules.size} modules: ${Array.from(this.modules.keys()).join(', ')}`);
    }

    private setupMiddleware(): void {
        this.app.use(cors(this.config.cors));
        this.app.use(express.json());
        this.app.use((req, res, next) => {
            const started = Date.now();
            res.on('finish', () => {
                const meta: Record<string, unknown> = {
                    method: req.method,
                    status: res.statusCode,
                    durationMs: Date.now() - started,
                    query: req.query
                };
                mongoLog.enqueue({
                    type: 'http',
                    ip: cleanIp(req.socket.remoteAddress),
                    channel: req.path,
                    payload: req.body,
                    meta
                });
            });
            next();
        });
    }

    private setupRoutes(): void {
        this.modules.forEach((module, name) => {
            this.app.use(`/${name}`, module.getRoutes());
            logger.info(`🛣️ Registered routes for module: ${name}`);
        });

        const antrianpoli = this.modules.get('antrianpoli');
        if (antrianpoli) {
            this.app.use('/queue', antrianpoli.getRoutes());
            logger.info('🛣️ Registered legacy alias routes: /queue -> /antrianpoli');
        }

        this.app.get('/health', (_req, res) => {
            res.json({
                status: 'healthy',
                modules: Array.from(this.modules.keys()),
                timestamp: new Date().toISOString()
            });
        });

        this.app.get('/displays/active', (_req, res) => {
            try {
                const activeDisplays = this.connectionManager.getActiveDisplays();
                res.json({
                    success: true,
                    totalActiveDisplays: activeDisplays.length,
                    displays: activeDisplays,
                    timestamp: new Date().toISOString()
                });
            } catch (error: unknown) {
                logger.error('❌ Error getting active displays:', error);
                res.status(500).json({
                    error: 'Failed to get active displays',
                    message: errorMessage(error)
                });
            }
        });
    }

    private setupSocketHandlers(): void {
        this.io.on('connection', (socket) => {
            const ip = cleanIp(socket.handshake.address);
            logger.info(`✅ Client connected: ${socket.id} from ${socket.handshake.address}`);
            this.connectionManager.addConnection(socket.id, socket.handshake.address);
            mongoLog.enqueue({
                type: 'connect',
                socketId: socket.id,
                ip
            });

            this.modules.forEach((module) => {
                module.registerSocketHandlers(socket);
            });

            socket.onAny((eventName, ...args) => {
                const payloadArgs = args.filter((arg: unknown) => typeof arg !== 'function');
                const payload: unknown = payloadArgs.length <= 1 ? payloadArgs[0] : payloadArgs;
                setImmediate(() => {
                    mongoLog.enqueue({
                        type: 'socket',
                        socketId: socket.id,
                        ip,
                        event: eventName,
                        rooms: socketRooms(socket),
                        payload,
                        meta: socketMeta(socket)
                    });
                });
            });

            socket.on('ping', () => {
                socket.emit('pong', { timestamp: new Date().toISOString() });
            });

            socket.on('disconnect', (reason) => {
                logger.info(`❌ Client disconnected: ${socket.id}`, { reason });
                mongoLog.enqueue({
                    type: 'disconnect',
                    socketId: socket.id,
                    ip,
                    rooms: socketRooms(socket),
                    meta: {
                        reason,
                        ...socketMeta(socket)
                    }
                });

                this.modules.forEach((module) => {
                    module.handleDisconnection(socket);
                });

                this.connectionManager.cleanupEmptyGroups();
                this.connectionManager.removeConnection(socket.id);
            });
        });
    }

    async start(): Promise<void> {
        try {
            if (!fs.existsSync('logs')) {
                fs.mkdirSync('logs');
                logger.info('📁 Created logs directory');
            }

            await mongoLog.initialize();
            await this.redisService.initialize();

            this.server.listen(this.config.port, '0.0.0.0', () => {
                logger.info(`🔥 Universal WebSocket server running on port ${this.config.port}`);
                logger.info(`🖥️ Active displays: GET http://localhost:${this.config.port}/displays/active`);
                logger.info(`👀 Monitoring clients: GET http://localhost:${this.config.port}/monitoring/clients`);
                logger.info(`💚 Health check: GET http://localhost:${this.config.port}/health`);
            });
        } catch (error: unknown) {
            logger.error('🔥 Failed to start server:', error);
            process.exit(1);
        }
    }

    async shutdown(): Promise<void> {
        if (this.shuttingDown) {
            return;
        }
        this.shuttingDown = true;
        logger.info('🛑 Shutting down gracefully');

        for (const [name, module] of this.modules) {
            await module.shutdown();
            logger.info(`📦 Module ${name} shut down`);
        }

        await this.redisService.shutdown();

        await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 3000);
            this.server.close(() => {
                clearTimeout(timer);
                resolve();
            });
        });

        await mongoLog.shutdown();
        logger.info('✅ Server shut down successfully');
        process.exit(0);
    }
}

function socketRooms(socket: AppSocket): string[] {
    return Array.from(socket.rooms).filter((room) => room !== socket.id);
}

function socketMeta(socket: AppSocket): Record<string, unknown> {
    const data = socket.data;
    return {
        username: data.username || data.prescriptionUsername || null,
        path: data.path || null
    };
}

export { WebSocketServer };
