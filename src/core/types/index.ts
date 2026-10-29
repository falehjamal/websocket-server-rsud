import type { Server, Socket } from 'socket.io';

export type JsonPrimitive = string | number | boolean | null;

export interface JsonObject {
    [key: string]: JsonValue;
}

export type JsonArray = JsonValue[];

export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export interface CorsConfig {
    origin: string;
    methods: string[];
    credentials: boolean;
}

export interface MongoConfig {
    uri: string;
    db: string;
    collection: string;
}

export interface RedisConfig {
    url: string;
}

export interface MysqlConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
}

export interface AppConfig {
    port: number;
    redis: RedisConfig;
    mongo: MongoConfig;
    mysql: MysqlConfig | null;
    cors: CorsConfig;
}

export interface SocketData {
    username?: string;
    path?: string;
    notificationRoom?: string;
    prescriptionUsername?: string;
    displayUrl?: string | null;
    displaySlug?: string | null;
    displayRegistered?: boolean;
    monitoring?: boolean;
}

export interface ClientToServerEvents {
    'join-group': (data: unknown) => void;
    'leave-group': (data: unknown) => void;
    'register-display': (data: unknown) => void;
    'join-user-room': (data: unknown) => void;
    'join-prescription': () => void;
    'leave-prescription': () => void;
    'join-notification': (data: unknown) => void;
    'leave-notification': () => void;
    'refresh-all-displays': (data: unknown) => void;
    'admin-broadcast-message': (data: unknown) => void;
    'admin-get-active-displays': () => void;
    'join-admin': (data: unknown) => void;
    'leave-admin': () => void;
    'join-monitoring': () => void;
    'monitoring:refresh': () => void;
    ping: () => void;
}

export interface JoinedGroupPayload {
    groupId: string | number;
    groupName: string | undefined;
    roomName: string;
    timestamp: string;
}

export interface LeftGroupPayload {
    groupId: unknown;
    roomName: string;
    timestamp: string;
}

export interface DisplayRegisteredPayload {
    display: string | null;
    url: string | null;
    timestamp: string;
}

export interface PrescriptionRoomPayload {
    message: string;
    socketId: string;
    roomName: string;
    timestamp: string;
}

export interface PrescriptionBroadcastPayload {
    message: string;
    data: JsonValue | undefined;
    timestamp: string;
}

export interface NotificationPayload {
    id: JsonValue;
    title: string;
    message: string;
    url: JsonValue | null;
    username: string;
    created_at: JsonValue | null;
    timestamp: string;
}

export interface NotificationJoinedPayload {
    message: string;
    socketId: string;
    roomName: string;
    username: string;
    timestamp: string;
}

export interface NotificationLeftPayload {
    message: string;
    socketId: string;
    roomName: string | null;
    timestamp: string;
}

export interface ErrorPayload {
    message: string;
}

export interface PongPayload {
    timestamp: string;
}

export interface ActiveConnection {
    id: string;
    connectedAt: string;
    ipAddress: string;
}

export interface ActiveDisplayClient {
    socketId: string;
    connectedAt: string | undefined;
    ipAddress: string | undefined;
}

export interface ActiveDisplay {
    groupNumber: number;
    permalink: string;
    roomName: string;
    clientCount: number;
    clients: ActiveDisplayClient[];
    isActive: boolean;
    lastUpdated: string;
}

export interface ActiveDisplaysPayload {
    success: true;
    totalActiveDisplays: number;
    displays: ActiveDisplay[];
    timestamp: string;
}

export interface BroadcastRoomResult {
    roomName: string;
    clientCount: number;
    broadcasted: boolean;
}

export interface BroadcastResult {
    totalClientsReached: number;
    displayRoomsCount: number;
    broadcastResults: BroadcastRoomResult[];
}

export interface RefreshAllDisplaysAck extends BroadcastResult {
    success: true;
    message: string;
    timestamp: string;
}

export interface BroadcastMessageAck extends BroadcastResult {
    success: true;
    message: string;
    timestamp: string;
}

export interface ActionErrorPayload {
    success: false;
    error: string;
    message: string;
    timestamp: string;
}

export interface AdminJoinedPayload {
    success: true;
    message: string;
    timestamp: string;
    socketId: string;
}

export interface AdminLeftPayload {
    success: true;
    message: string;
    timestamp: string;
}

export interface MonitorNotification {
    socketId: string;
    connectedAt: string | null;
    ipAddress: string;
    username: string;
    path: string;
}

export interface MonitorPrescription {
    socketId: string;
    connectedAt: string | null;
    ipAddress: string;
    username: string | null;
}

export interface MonitorDisplay {
    socketId: string;
    connectedAt: string | null;
    ipAddress: string;
    groupId: string | null;
    groupName: string | null;
    url: string | null;
    slug: string | null;
}

export interface MonitoringSnapshot {
    notifications: MonitorNotification[];
    prescriptions: MonitorPrescription[];
    displays: MonitorDisplay[];
    timestamp: string;
}

export interface EnrichedMonitorNotification {
    socketId: string;
    connectedAt: string | null;
    ipAddress: string;
    username: string | null;
    path: string;
    name: string | null;
    roles: string[];
}

export interface EnrichedMonitorPrescription {
    socketId: string;
    connectedAt: string | null;
    ipAddress: string;
    username: string | null;
    name: string | null;
    roles: string[];
}

export interface MonitoringSummary {
    notification_tabs: number;
    notification_users: number;
    prescription_tabs: number;
    display_screens: number;
}

export interface MonitoringUpdatePayload {
    notifications: EnrichedMonitorNotification[];
    prescriptions: EnrichedMonitorPrescription[];
    displays: MonitorDisplay[];
    timestamp: string;
    updated_at: string;
    summary: MonitoringSummary;
}

export interface MonitoringSuccessPayload extends MonitoringUpdatePayload {
    success: true;
}

export interface ServerToClientEvents {
    pong: (payload: PongPayload) => void;
    error: (payload: ErrorPayload) => void;
    'joined-group': (payload: JoinedGroupPayload) => void;
    'left-group': (payload: LeftGroupPayload) => void;
    'display-registered': (payload: DisplayRegisteredPayload) => void;
    'prescription-joined': (payload: PrescriptionRoomPayload) => void;
    'prescription-left': (payload: PrescriptionRoomPayload) => void;
    'prescription-broadcast': (payload: PrescriptionBroadcastPayload) => void;
    notification: (payload: NotificationPayload) => void;
    'notification-joined': (payload: NotificationJoinedPayload) => void;
    'notification-left': (payload: NotificationLeftPayload) => void;
    'refresh-all-displays': (payload: JsonObject) => void;
    'refresh-all-displays-ack': (payload: RefreshAllDisplaysAck) => void;
    'refresh-all-displays-error': (payload: ActionErrorPayload) => void;
    'broadcast-message-ack': (payload: BroadcastMessageAck) => void;
    'broadcast-message-error': (payload: ActionErrorPayload) => void;
    'active-displays-response': (payload: ActiveDisplaysPayload) => void;
    'active-displays-error': (payload: ActionErrorPayload) => void;
    'admin-joined': (payload: AdminJoinedPayload) => void;
    'admin-left': (payload: AdminLeftPayload) => void;
    'monitoring:update': (payload: MonitoringSuccessPayload) => void;
}

export interface InterServerEvents {
    [event: string]: (...args: never[]) => void;
}

export type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export interface AppModule {
    registerSocketHandlers(socket: AppSocket): void;
    getRoutes(): import('express').Router;
    handleDisconnection(socket: AppSocket): void;
    shutdown(): Promise<void>;
}

export interface LogInput {
    ts?: Date;
    type: string;
    socketId?: string | null;
    ip?: string | null;
    event?: JsonValue | null;
    channel?: string | null;
    rooms?: readonly string[];
    payload?: unknown;
    meta?: Record<string, unknown>;
}

export interface LogDocument {
    ts: Date;
    type: string;
    socketId: string | null;
    ip: string | null;
    event: JsonValue | null;
    channel: string | null;
    rooms: string[];
    payload: JsonValue | string;
    meta: Record<string, unknown>;
    truncated?: true;
}
