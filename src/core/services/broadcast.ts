import type { AppServer, BroadcastResult, BroadcastRoomResult, JsonObject, JsonValue } from '../types/index.js';
import { emitNamed, getRoomClientCount } from '../utils/helpers.js';
import logger from './logger.js';

class BroadcastService {
    private readonly io: AppServer;

    constructor(io: AppServer) {
        this.io = io;
    }

    broadcastToClients(channel: string, event: string, data: JsonValue, groupId: string): void {
        const roomName = `group_${groupId}`;
        const clientCount = getRoomClientCount(this.io, roomName);

        logger.info(`🏠 Room: ${roomName} (${clientCount} clients)`);

        if (clientCount === 0) {
            logger.warn(`⚠️ No clients in room ${roomName}`);
            return;
        }

        logger.info(`📡 Emitting "${event}" to room "${roomName}"`);
        emitNamed(this.io.to(roomName), event, data);

        logger.info(`✅ Broadcasted ${event} to ${clientCount} clients`, {
            channel, event, groupId, clientCount, roomName
        });
    }

    broadcastToPrescriptionRoom(channel: string, event: string, data: JsonValue): void {
        const roomName = 'prescription';
        const clientCount = getRoomClientCount(this.io, roomName);

        logger.info(`💊 Prescription Room: ${roomName} (${clientCount} clients)`);

        if (clientCount === 0) {
            logger.warn('⚠️ No clients in prescription room');
            return;
        }

        logger.info(`📡 Emitting prescription "${event}" to room "${roomName}"`);
        emitNamed(this.io.to(roomName), `${channel}:${event}`, data);

        logger.info(`✅ Broadcasted prescription ${event} to ${clientCount} clients`, {
            channel, event, clientCount, roomName
        });
    }

    broadcastToAllDisplays(event: string, data: JsonObject): BroadcastResult {
        const allRooms = Array.from(this.io.sockets.adapter.rooms.keys());
        const displayRooms = allRooms.filter((room) => room.startsWith('group_'));

        let totalClientsReached = 0;
        const broadcastResults: BroadcastRoomResult[] = [];

        displayRooms.forEach((roomName) => {
            const clientCount = getRoomClientCount(this.io, roomName);
            if (clientCount > 0) {
                emitNamed(this.io.to(roomName), event, data);
                totalClientsReached += clientCount;
                broadcastResults.push({
                    roomName,
                    clientCount,
                    broadcasted: true
                });
                logger.info(`📡 Broadcasted "${event}" to room "${roomName}" (${clientCount} clients)`);
            } else {
                broadcastResults.push({
                    roomName,
                    clientCount: 0,
                    broadcasted: false
                });
            }
        });

        if (totalClientsReached === 0) {
            logger.warn(`⚠️ No active display clients found for broadcast "${event}"`);
        } else {
            logger.info(`✅ Successfully broadcasted "${event}" to ${totalClientsReached} clients across ${displayRooms.length} display rooms`, {
                event,
                totalClientsReached,
                displayRoomsCount: displayRooms.length,
                broadcastResults
            });
        }

        return {
            totalClientsReached,
            displayRoomsCount: displayRooms.length,
            broadcastResults
        };
    }
}

export default BroadcastService;
