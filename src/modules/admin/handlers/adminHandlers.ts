import type {
    ActionErrorPayload,
    ActiveDisplaysPayload,
    AppSocket,
    BroadcastMessageAck,
    BroadcastResult,
    JsonObject,
    RefreshAllDisplaysAck
} from '../../../core/types/index.js';
import BroadcastService from '../../../core/services/broadcast.js';
import ConnectionManager from '../../../core/services/connectionManager.js';
import logger from '../../../core/services/logger.js';
import { createTimestamp, errorMessage, isTruthyJson, jsonOrDefault, readJsonObject, requireJsonObject } from '../../../core/utils/helpers.js';

function ackFrom(result: BroadcastResult, message: string): RefreshAllDisplaysAck {
    return {
        success: true,
        message,
        totalClientsReached: result.totalClientsReached,
        displayRoomsCount: result.displayRoomsCount,
        broadcastResults: result.broadcastResults,
        timestamp: createTimestamp()
    };
}

function failure(error: unknown, summary: string): ActionErrorPayload {
    return {
        success: false,
        error: summary,
        message: errorMessage(error),
        timestamp: createTimestamp()
    };
}

class AdminHandlers {
    private readonly connectionManager: ConnectionManager;
    private readonly broadcastService: BroadcastService;

    constructor(connectionManager: ConnectionManager, broadcastService: BroadcastService) {
        this.connectionManager = connectionManager;
        this.broadcastService = broadcastService;
    }

    handleRefreshAllDisplays(socket: AppSocket, data: unknown): BroadcastResult {
        logger.info(`🔄 Admin refresh-all-displays command from ${socket.id}`, data);

        try {
            const extra = readJsonObject(data);
            const payload: JsonObject = {
                action: 'refresh',
                timestamp: createTimestamp(),
                source: jsonOrDefault(extra['source'], 'admin-panel'),
                requestId: jsonOrDefault(extra['requestId'], `refresh_${Date.now()}`),
                ...extra
            };
            const broadcastResult = this.broadcastService.broadcastToAllDisplays('refresh-all-displays', payload);
            const ack: RefreshAllDisplaysAck = {
                ...ackFrom(broadcastResult, 'Refresh command sent to all display clients')
            };
            socket.emit('refresh-all-displays-ack', ack);
            logger.info('✅ Admin refresh command broadcasted successfully', {
                adminSocketId: socket.id,
                ...broadcastResult
            });
            return broadcastResult;
        } catch (error: unknown) {
            logger.error('❌ Error handling refresh-all-displays:', error);
            socket.emit('refresh-all-displays-error', failure(error, 'Failed to broadcast refresh command'));
            throw error;
        }
    }

    handleBroadcastMessage(socket: AppSocket, data: unknown): BroadcastResult {
        logger.info(`📢 Admin broadcast message from ${socket.id}`, data);

        try {
            const body = requireJsonObject(data);
            const event = body['event'];
            const message = body['message'];
            const target = body['target'] === undefined ? 'all-displays' : body['target'];

            if (!isTruthyJson(event) || typeof event !== 'string' || !isTruthyJson(message)) {
                throw new Error('Event and message are required');
            }
            if (target !== 'all-displays') {
                throw new Error('Specific group broadcast not implemented yet');
            }

            const payload: JsonObject = {
                message,
                timestamp: createTimestamp(),
                source: 'admin-panel',
                ...body
            };
            const broadcastResult = this.broadcastService.broadcastToAllDisplays(event, payload);
            const ack: BroadcastMessageAck = {
                success: true,
                message: 'Message broadcasted successfully',
                totalClientsReached: broadcastResult.totalClientsReached,
                displayRoomsCount: broadcastResult.displayRoomsCount,
                broadcastResults: broadcastResult.broadcastResults,
                timestamp: createTimestamp()
            };
            socket.emit('broadcast-message-ack', ack);
            logger.info('✅ Admin broadcast message sent successfully', {
                adminSocketId: socket.id,
                event,
                target,
                ...broadcastResult
            });
            return broadcastResult;
        } catch (error: unknown) {
            logger.error('❌ Error handling broadcast message:', error);
            socket.emit('broadcast-message-error', failure(error, 'Failed to broadcast message'));
            throw error;
        }
    }

    handleGetActiveDisplays(socket: AppSocket): ReturnType<ConnectionManager['getActiveDisplays']> {
        try {
            const activeDisplays = this.connectionManager.getActiveDisplays();
            const payload: ActiveDisplaysPayload = {
                success: true,
                totalActiveDisplays: activeDisplays.length,
                displays: activeDisplays,
                timestamp: createTimestamp()
            };
            socket.emit('active-displays-response', payload);
            logger.info(`📊 Sent active displays info to admin ${socket.id}`, {
                totalActiveDisplays: activeDisplays.length
            });
            return activeDisplays;
        } catch (error: unknown) {
            logger.error('❌ Error getting active displays:', error);
            socket.emit('active-displays-error', failure(error, 'Failed to get active displays'));
            throw error;
        }
    }
}

export default AdminHandlers;
