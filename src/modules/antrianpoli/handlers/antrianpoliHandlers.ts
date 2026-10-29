import type { AppServer, AppSocket } from '../../../core/types/index.js';
import ConnectionManager from '../../../core/services/connectionManager.js';
import logger from '../../../core/services/logger.js';
import { createTimestamp, getRoomClientCount, isRecord } from '../../../core/utils/helpers.js';

function textOrNull(value: unknown): string | null {
    if (typeof value === 'string' && value !== '') {
        return value;
    }
    return null;
}

class AntrianPoliHandlers {
    private readonly io: AppServer;
    private readonly connectionManager: ConnectionManager;

    constructor(io: AppServer, connectionManager: ConnectionManager) {
        this.io = io;
        this.connectionManager = connectionManager;
    }

    handleJoinGroup(socket: AppSocket, data: unknown): void {
        try {
            if (typeof data === 'number' || typeof data === 'boolean') {
                throw new TypeError('Payload must be an object');
            }
            const payload = isRecord(data) ? data : {};
            const groupId = payload['groupId'];
            const groupName = payload['groupName'];

            if ((typeof groupId !== 'string' && typeof groupId !== 'number') || !groupId) {
                socket.emit('error', { message: 'Group ID is required' });
                return;
            }

            const roomName = `group_${groupId}`;
            if (typeof groupName === 'string' && groupName) {
                this.connectionManager.setGroupPermalink(groupId, groupName);
            } else {
                logger.warn(`⚠️ No groupName provided for group ${groupId}`);
            }

            const currentRooms = Array.from(socket.rooms);
            for (const room of currentRooms) {
                if (room !== socket.id && room.startsWith('group_')) {
                    socket.leave(room);
                    logger.info(`🚪 Client ${socket.id} left room ${room}`);
                }
            }

            socket.join(roomName);
            socket.data.displayUrl = textOrNull(payload['url']);
            socket.data.displaySlug = textOrNull(payload['display']);
            socket.data.displayRegistered = false;
            socket.emit('joined-group', {
                groupId,
                groupName: typeof groupName === 'string' ? groupName : undefined,
                roomName,
                timestamp: createTimestamp()
            });

            const printedName = typeof groupName === 'string' ? groupName : String(groupName);
            logger.info(`🏠 Client ${socket.id} joined group ${groupId} (${printedName})`);
        } catch (error: unknown) {
            logger.error('❌ Error handling join-group:', error);
            socket.emit('error', { message: 'Failed to join group' });
        }
    }

    handleLeaveGroup(socket: AppSocket, data: unknown): void {
        try {
            if (typeof data === 'number' || typeof data === 'boolean') {
                throw new TypeError('Payload must be an object');
            }
            const payload = isRecord(data) ? data : {};
            const groupId = payload['groupId'];
            const roomName = `group_${String(groupId)}`;

            socket.leave(roomName);

            const remainingClients = getRoomClientCount(this.io, roomName);
            if (remainingClients === 0) {
                this.connectionManager.removeGroupPermalink(String(groupId));
            }

            socket.emit('left-group', {
                groupId,
                roomName,
                timestamp: createTimestamp()
            });

            logger.info(`🚪 Client ${socket.id} left group ${String(groupId)}`);
        } catch (error: unknown) {
            logger.error('❌ Error handling leave-group:', error);
            socket.emit('error', { message: 'Failed to leave group' });
        }
    }

    handleRegisterDisplay(socket: AppSocket, data: unknown): void {
        try {
            const info = isRecord(data) ? data : {};
            const displaySlug = textOrNull(info['display']);
            const displayUrl = textOrNull(info['url']);
            socket.data.displayRegistered = true;
            socket.data.displayUrl = displayUrl;
            socket.data.displaySlug = displaySlug;
            socket.emit('display-registered', {
                display: displaySlug,
                url: displayUrl,
                timestamp: createTimestamp()
            });
            logger.info(`📺 Client ${socket.id} registered display ${displaySlug || '-'}`);
        } catch (error: unknown) {
            logger.error('❌ Error handling register-display:', error);
            socket.emit('error', { message: 'Failed to register display' });
        }
    }

    handleDisconnection(socket: AppSocket): void {
        logger.debug(`🏠 AntrianPoli module handling disconnection for ${socket.id}`);
    }
}

export default AntrianPoliHandlers;
