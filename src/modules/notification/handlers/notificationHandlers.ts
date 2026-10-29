import type { AppSocket } from '../../../core/types/index.js';
import logger from '../../../core/services/logger.js';
import { createTimestamp, isRecord } from '../../../core/utils/helpers.js';

function rawText(value: unknown): string {
    if (value === undefined || value === null || value === false || value === 0 || value === '') {
        return '';
    }
    return String(value);
}

export function normalizeUsername(username: unknown): string {
    return rawText(username).trim().toLowerCase();
}

export function normalizePath(path: unknown): string {
    const text = rawText(path);
    const beforeQuery = text.split('?')[0] ?? '';
    const beforeHash = beforeQuery.split('#')[0] ?? '';
    return beforeHash.trim().toLowerCase();
}

export function roomNameFor(username: unknown): string {
    return `notif_user_${normalizeUsername(username)}`;
}

class NotificationHandlers {
    handleJoinNotification(socket: AppSocket, data: unknown): void {
        try {
            const payload = isRecord(data) ? data : {};
            const username = normalizeUsername(payload['username']);
            if (!username) {
                socket.emit('error', { message: 'Username wajib diisi' });
                return;
            }

            const roomName = roomNameFor(username);
            socket.join(roomName);
            socket.data.notificationRoom = roomName;
            socket.data.username = username;
            socket.data.path = normalizePath(payload['path']);

            socket.emit('notification-joined', {
                message: 'Berhasil join room notifikasi',
                socketId: socket.id,
                roomName,
                username,
                timestamp: createTimestamp()
            });

            logger.info(`Client ${socket.id} joined notification room ${roomName}`);
        } catch (error: unknown) {
            logger.error('Error handling join-notification:', error);
            socket.emit('error', { message: 'Gagal join room notifikasi' });
        }
    }

    handleLeaveNotification(socket: AppSocket): void {
        try {
            const roomName = socket.data.notificationRoom;
            if (roomName) {
                socket.leave(roomName);
            }
            delete socket.data.username;
            delete socket.data.path;

            socket.emit('notification-left', {
                message: 'Berhasil leave room notifikasi',
                socketId: socket.id,
                roomName: roomName ?? null,
                timestamp: createTimestamp()
            });
        } catch (error: unknown) {
            logger.error('Error handling leave-notification:', error);
            socket.emit('error', { message: 'Gagal leave room notifikasi' });
        }
    }

    handleDisconnection(socket: AppSocket): void {
        logger.debug(`Notification module handling disconnection for ${socket.id}`);
    }
}

export default NotificationHandlers;
