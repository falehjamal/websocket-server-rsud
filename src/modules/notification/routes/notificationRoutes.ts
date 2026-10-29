import express, { type Request, type Response, type Router } from 'express';
import ConnectionManager from '../../../core/services/connectionManager.js';
import logger from '../../../core/services/logger.js';
import { createTimestamp, errorMessage, getRoomClientCount, isTruthyJson, requireJsonObject } from '../../../core/utils/helpers.js';
import type { JsonValue, NotificationPayload } from '../../../core/types/index.js';
import { normalizePath, normalizeUsername, roomNameFor } from '../handlers/notificationHandlers.js';

function queryStrings(value: unknown): string[] {
    const values = Array.isArray(value) ? value : [value];
    return values.filter((item): item is string => typeof item === 'string');
}

class NotificationRoutes {
    private readonly connectionManager: ConnectionManager;
    private readonly router: Router;

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
        this.router = express.Router();
        this.router.post('/send', (req, res) => {
            this.send(req, res);
        });
        this.router.get('/active-users', (req, res) => {
            void this.activeUsers(req, res);
        });
    }

    private send(req: Request, res: Response): void {
        try {
            const body = requireJsonObject(req.body);
            const username = normalizeUsername(body['username']);
            const title = rawTrimmed(body['title']);
            const message = rawTrimmed(body['message']);

            if (!username || !title || !message) {
                res.status(400).json({
                    success: false,
                    error: 'username, title, dan message wajib diisi'
                });
                return;
            }

            const roomName = roomNameFor(username);
            const clientCount = getRoomClientCount(this.connectionManager.io, roomName);
            const payload: NotificationPayload = {
                id: isTruthyJson(body['id']) ? body['id'] : null,
                title,
                message,
                url: isTruthyJson(body['url']) ? body['url'] : null,
                username,
                created_at: isTruthyJson(body['created_at']) ? body['created_at'] : null,
                timestamp: createTimestamp()
            };

            this.connectionManager.io.to(roomName).emit('notification', payload);
            logger.info(`Notification sent to ${roomName} (${clientCount} clients)`, payload);

            res.json({
                success: true,
                message: 'Notifikasi terkirim',
                roomName,
                clientCount,
                timestamp: payload.timestamp
            });
        } catch (error: unknown) {
            logger.error('Error sending notification:', error);
            res.status(500).json({
                success: false,
                error: 'Gagal mengirim notifikasi',
                message: errorMessage(error)
            });
        }
    }

    private async activeUsers(req: Request, res: Response): Promise<void> {
        try {
            const prefixes = queryStrings(req.query['prefix'])
                .filter((prefix) => prefix.trim() !== '')
                .map((prefix) => normalizePath(prefix).replace(/\/+$/, ''))
                .filter((prefix) => prefix !== '');

            if (prefixes.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'prefix wajib diisi'
                });
                return;
            }

            const sockets = await this.connectionManager.io.fetchSockets();
            const active = new Map<string, Set<string>>();

            for (const socket of sockets) {
                const username = socket.data.username;
                const path = socket.data.path;
                if (!username || !path) {
                    continue;
                }
                const matched = prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
                if (!matched) {
                    continue;
                }
                const paths = active.get(username) ?? new Set<string>();
                paths.add(path);
                active.set(username, paths);
            }

            const users = Array.from(active.entries()).map(([username, paths]) => ({
                username,
                paths: Array.from(paths)
            }));

            res.json({
                success: true,
                prefixes,
                count: users.length,
                users,
                timestamp: createTimestamp()
            });
        } catch (error: unknown) {
            logger.error('Error getting active notification users:', error);
            res.status(500).json({
                success: false,
                error: 'Gagal mengambil user aktif',
                message: errorMessage(error)
            });
        }
    }

    getRouter(): Router {
        return this.router;
    }
}

function rawTrimmed(value: JsonValue | undefined): string {
    if (value === undefined || value === null || value === false || value === 0 || value === '') {
        return '';
    }
    return String(value).trim();
}

export default NotificationRoutes;
