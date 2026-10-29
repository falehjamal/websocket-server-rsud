import type {
    ActiveConnection,
    ActiveDisplay,
    ActiveDisplayClient,
    AppServer,
    MonitorDisplay,
    MonitorNotification,
    MonitorPrescription,
    MonitoringSnapshot
} from '../types/index.js';
import { cleanIp, createTimestamp, getRoomClientCount } from '../utils/helpers.js';
import logger from './logger.js';

class ConnectionManager {
    readonly io: AppServer;
    private readonly activeConnections = new Map<string, ActiveConnection>();
    private readonly groupPermalinks = new Map<string, string>();

    constructor(io: AppServer) {
        this.io = io;
    }

    addConnection(socketId: string, ipAddress: string): void {
        this.activeConnections.set(socketId, {
            id: socketId,
            connectedAt: createTimestamp(),
            ipAddress
        });
        logger.info(`✅ Connection added: ${socketId}`);
    }

    removeConnection(socketId: string): void {
        this.activeConnections.delete(socketId);
        logger.info(`❌ Connection removed: ${socketId}`);
    }

    getConnection(socketId: string): ActiveConnection | undefined {
        return this.activeConnections.get(socketId);
    }

    getAllConnections(): ActiveConnection[] {
        return Array.from(this.activeConnections.values());
    }

    setGroupPermalink(groupId: string | number, groupName: string): void {
        const groupIdStr = String(groupId);
        this.groupPermalinks.set(groupIdStr, groupName);
        logger.info(`💾 Stored permalink for group ${groupIdStr}: "${groupName}"`);
    }

    getGroupPermalink(groupId: string | number): string | undefined {
        return this.groupPermalinks.get(String(groupId));
    }

    removeGroupPermalink(groupId: string | number): void {
        const groupIdStr = String(groupId);
        this.groupPermalinks.delete(groupIdStr);
        logger.info(`🗑️ Removed permalink for group ${groupIdStr}`);
    }

    cleanupEmptyGroups(): void {
        const allRooms = Array.from(this.io.sockets.adapter.rooms.keys());
        const groupRooms = allRooms.filter((room) => room.startsWith('group_'));

        groupRooms.forEach((roomName) => {
            const groupId = roomName.replace('group_', '');
            const clientCount = getRoomClientCount(this.io, roomName);
            if (clientCount === 0) {
                this.groupPermalinks.delete(groupId);
                logger.info(`🗑️ Cleaned up permalink for empty group ${groupId}`);
            }
        });
    }

    getActiveDisplays(): ActiveDisplay[] {
        const allRooms = Array.from(this.io.sockets.adapter.rooms.keys());
        const groupRooms = allRooms.filter((room) => room.startsWith('group_'));

        const activeDisplays = groupRooms.map((roomName) => {
            const groupId = roomName.replace('group_', '');
            const clientCount = getRoomClientCount(this.io, roomName);
            const clients = Array.from(this.io.sockets.adapter.rooms.get(roomName) ?? []);
            const clientDetails: ActiveDisplayClient[] = clients.map((socketId) => {
                const connection = this.activeConnections.get(socketId);
                return {
                    socketId,
                    connectedAt: connection?.connectedAt,
                    ipAddress: connection?.ipAddress
                };
            });
            const storedPermalink = this.groupPermalinks.get(groupId);
            const actualPermalink = storedPermalink || `/display/group/${groupId}`;

            return {
                groupNumber: Number.parseInt(groupId, 10),
                permalink: actualPermalink,
                roomName,
                clientCount,
                clients: clientDetails,
                isActive: clientCount > 0,
                lastUpdated: createTimestamp()
            };
        }).filter((display) => display.isActive);

        activeDisplays.sort((left, right) => left.groupNumber - right.groupNumber);
        return activeDisplays;
    }

    async buildMonitoringSnapshot(): Promise<MonitoringSnapshot> {
        const sockets = await this.io.fetchSockets();
        const notifications: MonitorNotification[] = [];
        const prescriptions: MonitorPrescription[] = [];
        const displays: MonitorDisplay[] = [];

        for (const socket of sockets) {
            const connection = this.activeConnections.get(socket.id);
            const base = {
                socketId: socket.id,
                connectedAt: connection ? connection.connectedAt : null,
                ipAddress: cleanIp(connection?.ipAddress)
            };
            const data = socket.data;
            const rooms = socket.rooms;

            if (data.notificationRoom && data.username && rooms.has(data.notificationRoom)) {
                notifications.push({
                    ...base,
                    username: data.username,
                    path: data.path || ''
                });
            }

            if (rooms.has('prescription')) {
                prescriptions.push({
                    ...base,
                    username: data.prescriptionUsername || null
                });
            }

            let inGroup = false;
            for (const room of rooms) {
                if (!room.startsWith('group_')) {
                    continue;
                }
                inGroup = true;
                const groupId = room.slice('group_'.length);
                displays.push({
                    ...base,
                    groupId,
                    groupName: this.getGroupPermalink(groupId) || null,
                    url: data.displayUrl || null,
                    slug: data.displaySlug || null
                });
            }

            if (!inGroup && data.displayRegistered) {
                displays.push({
                    ...base,
                    groupId: null,
                    groupName: null,
                    url: data.displayUrl || null,
                    slug: data.displaySlug || null
                });
            }
        }

        notifications.sort((left, right) => `${left.username}|${left.path}`.localeCompare(`${right.username}|${right.path}`));
        prescriptions.sort((left, right) => String(left.username || '').localeCompare(String(right.username || '')));
        displays.sort((left, right) => String(left.groupName || left.slug || '').localeCompare(String(right.groupName || right.slug || '')));

        return {
            notifications,
            prescriptions,
            displays,
            timestamp: createTimestamp()
        };
    }
}

export default ConnectionManager;
