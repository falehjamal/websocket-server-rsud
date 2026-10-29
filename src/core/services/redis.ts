import { createClient, type RedisClientType } from 'redis';
import type { AppConfig, AppServer, JsonValue } from '../types/index.js';
import { emitNamed, errorMessage, extractGroupIdFromChannel, isJsonObject, isTruthyJson } from '../utils/helpers.js';
import BroadcastService from './broadcast.js';
import logger from './logger.js';
import mongoLog from './mongoLog.js';

class RedisService {
    private readonly config: AppConfig;
    private readonly io: AppServer;
    private readonly broadcastService: BroadcastService;
    private redisSubscriber: RedisClientType | null = null;

    constructor(config: AppConfig, io: AppServer, broadcastService: BroadcastService) {
        this.config = config;
        this.io = io;
        this.broadcastService = broadcastService;
    }

    async initialize(): Promise<void> {
        try {
            if (!this.config.redis.url) {
                logger.info('⚠️ Redis URL not provided, skipping Redis initialization');
                return;
            }

            logger.info('🔄 Initializing Redis with URL:', this.config.redis.url);

            this.redisSubscriber = createClient({ url: this.config.redis.url });
            this.redisSubscriber.on('error', (error: Error) => {
                logger.error('❌ Redis Subscriber Error:', error);
            });

            await this.redisSubscriber.connect();

            logger.info('✅ Redis connections established');
            await this.setupListeners();
        } catch (error: unknown) {
            logger.error('🔥 Failed to initialize Redis:', error);
            logger.warn('⚠️ Continuing without Redis connection...');
        }
    }

    private processMessage(message: string, channel: string, isAntrian: boolean): void {
        logger.info(`📨 === REDIS MESSAGE RECEIVED (${isAntrian ? 'ANTRIAN' : 'ALL'}) ===`);
        logger.info('📡 Channel:', channel);
        logger.info('📄 Raw message:', message);

        const channelName = String(channel || '');
        const antrianChannel = channelName.startsWith('antrian.');
        // antrian.* juga cocok dengan pola '*'. Simpan dan broadcast antrian hanya dari listener antrian.
        const shouldStore = antrianChannel ? isAntrian === true : isAntrian === false;

        let parsed = false;
        try {
            const raw: unknown = JSON.parse(message);
            parsed = true;
            const record = isJsonObject(raw) ? raw : null;

            if (shouldStore) {
                const eventValue = record && isTruthyJson(record['event']) ? record['event'] : null;
                const hasData = record !== null && Object.prototype.hasOwnProperty.call(record, 'data');
                const storedPayload = hasData && record !== null ? record['data'] : raw;
                mongoLog.enqueue({
                    type: 'redis',
                    event: eventValue ?? null,
                    channel: channelName,
                    payload: storedPayload
                });
            }

            logger.info('📋 Parsed data:', raw);

            if (raw === null) {
                throw new TypeError('Cannot read properties of null (reading \'event\')');
            }
            if (record === null) {
                logger.warn('⚠️ Invalid message format:', raw);
                return;
            }

            const event = record['event'];
            const data = record['data'];
            if (!isTruthyJson(event) || !isTruthyJson(data)) {
                logger.warn('⚠️ Invalid message format:', raw);
                return;
            }
            if (typeof event !== 'string') {
                throw new TypeError('event.startsWith is not a function');
            }

            if (isAntrian) {
                const groupId = extractGroupIdFromChannel(channel);
                if (!groupId) {
                    logger.warn('⚠️ Could not extract group ID from channel:', channel);
                    return;
                }
                logger.info('📢 Broadcasting to group', groupId);
                this.broadcastService.broadcastToClients(channel, event, data, groupId);
            } else {
                this.handleGeneralMessage(channel, event, data);
            }
        } catch (error: unknown) {
            if (shouldStore && !parsed) {
                mongoLog.enqueue({
                    type: 'redis',
                    channel: channelName,
                    payload: typeof message === 'string' ? message : String(message),
                    meta: { parseError: errorMessage(error) }
                });
            }
            logger.error('❌ Error processing message:', error);
        }
    }

    private handleGeneralMessage(channel: string, event: string, data: JsonValue): void {
        if (event.startsWith('prescription.')) {
            logger.info('💊 Prescription event detected:', event);
            this.broadcastService.broadcastToPrescriptionRoom(channel, event, data);
            return;
        }
        if (!channel.startsWith('antrian.')) {
            logger.info('📢 Broadcasting general event to all clients:', event);
            emitNamed(this.io, `${channel}:${event}`, data);
        }
    }

    private async setupListeners(): Promise<void> {
        if (!this.redisSubscriber) {
            logger.info('⚠️ Redis not initialized, skipping listeners setup');
            return;
        }

        logger.info('🔄 Setting up Redis pattern subscription...');

        await this.redisSubscriber.pSubscribe('antrian.*', (message, channel) => {
            this.processMessage(message, channel, true);
        });

        await this.redisSubscriber.pSubscribe('*', (message, channel) => {
            this.processMessage(message, channel, false);
        });

        logger.info('✅ Subscribed to Redis patterns: antrian.* and *');
    }

    async shutdown(): Promise<void> {
        try {
            if (this.redisSubscriber) {
                await this.redisSubscriber.quit();
                logger.info('✅ Redis subscriber disconnected');
            }
        } catch (error: unknown) {
            logger.error('❌ Error shutting down Redis:', error);
        }
    }
}

export default RedisService;
