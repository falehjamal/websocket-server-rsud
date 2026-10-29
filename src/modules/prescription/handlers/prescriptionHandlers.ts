import type { AppSocket } from '../../../core/types/index.js';
import logger from '../../../core/services/logger.js';
import { createTimestamp, isRecord } from '../../../core/utils/helpers.js';

function looseString(value: unknown): string {
    if (value === undefined || value === null || value === false || value === 0 || value === '') {
        return '';
    }
    return String(value);
}

class PrescriptionHandlers {
    handleJoinUserRoom(socket: AppSocket, data: unknown): void {
        try {
            let raw = '';
            if (typeof data === 'string') {
                raw = data;
            } else if (isRecord(data)) {
                raw = looseString(data['username']) || looseString(data['user']);
            }
            const username = raw.trim().toLowerCase();
            if (!username) {
                return;
            }

            socket.data.prescriptionUsername = username;
            logger.info(`💊 Client ${socket.id} identified as ${username} for prescription`);
        } catch (error: unknown) {
            logger.error('❌ Error handling join-user-room:', error);
        }
    }

    handleJoinPrescription(socket: AppSocket): void {
        try {
            const roomName = 'prescription';
            socket.join(roomName);
            socket.emit('prescription-joined', {
                message: 'Successfully joined prescription room',
                socketId: socket.id,
                roomName,
                timestamp: createTimestamp()
            });
            logger.info(`💊 Client ${socket.id} joined prescription room`);
        } catch (error: unknown) {
            logger.error('❌ Error handling join-prescription:', error);
            socket.emit('error', { message: 'Failed to join prescription room' });
        }
    }

    handleLeavePrescription(socket: AppSocket): void {
        try {
            const roomName = 'prescription';
            socket.leave(roomName);
            socket.emit('prescription-left', {
                message: 'Successfully left prescription room',
                socketId: socket.id,
                roomName,
                timestamp: createTimestamp()
            });
            logger.info(`💊 Client ${socket.id} left prescription room`);
        } catch (error: unknown) {
            logger.error('❌ Error handling leave-prescription:', error);
            socket.emit('error', { message: 'Failed to leave prescription room' });
        }
    }

    handleDisconnection(socket: AppSocket): void {
        logger.debug(`💊 Prescription module handling disconnection for ${socket.id}`);
    }
}

export default PrescriptionHandlers;
