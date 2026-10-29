import { MongoClient, type Collection } from 'mongodb';
import config from '../config/index.js';
import type { JsonValue, LogDocument, LogInput } from '../types/index.js';
import { errorMessage, isJsonValue } from '../utils/helpers.js';
import logger from './logger.js';

const FLUSH_MS = 300;
const FLUSH_SIZE = 100;
const MAX_QUEUE = 5000;
const MAX_BYTES = 1024 * 1024;
const RETRY_MS = 5000;

function byteSize(value: unknown): number {
    try {
        return Buffer.byteLength(JSON.stringify(value));
    } catch {
        return MAX_BYTES + 1;
    }
}

function clonePayload(value: unknown): JsonValue | string {
    if (value === undefined) {
        return null;
    }
    try {
        const cloned: unknown = JSON.parse(JSON.stringify(value));
        if (isJsonValue(cloned)) {
            return cloned;
        }
        return String(value);
    } catch {
        return String(value);
    }
}

function payloadText(payload: JsonValue | string): string {
    if (typeof payload === 'string') {
        return payload;
    }
    try {
        return JSON.stringify(payload);
    } catch {
        return String(payload);
    }
}

function fitDocument(doc: LogDocument): LogDocument {
    if (byteSize(doc) <= MAX_BYTES) {
        return doc;
    }

    const text = payloadText(doc.payload);
    const withoutPayload = byteSize({ ...doc, payload: '' });
    const budget = Math.max(0, MAX_BYTES - withoutPayload - 64);

    return {
        ...doc,
        payload: text.slice(0, budget),
        truncated: true
    };
}

class MongoLog {
    private readonly uri: string;
    private readonly dbName: string;
    private readonly collectionName: string;
    private queue: LogDocument[] = [];
    private dropped = 0;
    private client: MongoClient | null = null;
    private collection: Collection<LogDocument> | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private flushing = false;
    private ready = false;
    private closing = false;
    private connectPromise: Promise<void> | null = null;

    constructor(mongoConfig: { uri: string; db: string; collection: string }) {
        this.uri = mongoConfig.uri;
        this.dbName = mongoConfig.db;
        this.collectionName = mongoConfig.collection;
    }

    enqueue(partial: LogInput): void {
        const event = partial.event === undefined ? null : partial.event;
        const doc = fitDocument({
            ts: partial.ts instanceof Date ? partial.ts : new Date(),
            type: partial.type,
            socketId: partial.socketId ?? null,
            ip: partial.ip ?? null,
            event,
            channel: partial.channel ?? null,
            rooms: Array.isArray(partial.rooms) ? [...partial.rooms] : [],
            payload: clonePayload(partial.payload),
            meta: partial.meta ?? {}
        });

        this.queue.push(doc);
        while (this.queue.length > MAX_QUEUE) {
            this.queue.shift();
            this.dropped += 1;
        }

        if (this.dropped > 0 && this.dropped % 100 === 0) {
            logger.warn(`Mongo log membuang dokumen tertua. Total dibuang: ${this.dropped}`);
        }

        if (this.queue.length >= FLUSH_SIZE) {
            this.flush().catch((error: unknown) => {
                logger.error('Gagal flush log MongoDB:', error);
            });
            return;
        }

        this.schedule();
    }

    private schedule(): void {
        if (this.timer || this.closing) {
            return;
        }
        this.timer = setTimeout(() => {
            this.timer = null;
            this.flush().catch((error: unknown) => {
                logger.error('Gagal flush log MongoDB:', error);
            });
        }, FLUSH_MS);
    }

    private scheduleRetry(): void {
        if (this.retryTimer || this.closing) {
            return;
        }
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.initialize().catch((error: unknown) => {
                logger.error('Gagal mencoba ulang MongoDB:', error);
            });
        }, RETRY_MS);
    }

    async initialize(): Promise<void> {
        if (this.closing) {
            return;
        }
        if (this.connectPromise) {
            return this.connectPromise;
        }

        this.connectPromise = this.connect().finally(() => {
            this.connectPromise = null;
        });
        return this.connectPromise;
    }

    private async connect(): Promise<void> {
        try {
            if (this.client) {
                await this.client.close().catch(() => undefined);
                this.client = null;
                this.collection = null;
            }

            this.client = new MongoClient(this.uri, {
                serverSelectionTimeoutMS: 2000
            });
            await this.client.connect();
            this.collection = this.client.db(this.dbName).collection<LogDocument>(this.collectionName);
            await this.collection.createIndexes([
                { key: { ts: 1 } },
                { key: { type: 1, ts: -1 } },
                { key: { event: 1, ts: -1 } },
                { key: { channel: 1, ts: -1 } },
                { key: { socketId: 1, ts: -1 } }
            ]);
            this.ready = true;
            logger.info(`Mongo log tersambung: ${this.dbName}.${this.collectionName}`);
            if (this.queue.length > 0) {
                this.schedule();
            }
        } catch (error: unknown) {
            this.ready = false;
            this.collection = null;
            logger.warn(`MongoDB tidak tersedia, log websocket ditunda: ${errorMessage(error)}`);
            this.scheduleRetry();
        }
    }

    async flush(): Promise<boolean> {
        if (this.flushing || !this.ready || !this.collection || this.queue.length === 0) {
            return false;
        }

        this.flushing = true;
        const batch = this.queue.splice(0, FLUSH_SIZE);
        try {
            await this.collection.insertMany(batch, { ordered: false });
        } catch (error: unknown) {
            this.ready = false;
            logger.error(`Gagal menulis log MongoDB: ${errorMessage(error)}`);
            this.scheduleRetry();
        } finally {
            this.flushing = false;
        }

        if (this.ready && this.queue.length >= FLUSH_SIZE) {
            await this.flush();
        } else if (this.ready && this.queue.length > 0 && !this.closing) {
            this.schedule();
        }
        return true;
    }

    async shutdown(): Promise<void> {
        this.closing = true;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }

        while (this.flushing) {
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 20);
            });
        }

        if (!this.ready) {
            if (this.queue.length > 0) {
                logger.warn(`Mongo log shutdown membuang ${this.queue.length} dokumen karena MongoDB tidak tersambung`);
                this.queue = [];
            }
        } else {
            while (this.queue.length > 0 && this.ready) {
                const wrote = await this.flush();
                if (!wrote) {
                    break;
                }
            }
        }

        if (this.client) {
            await this.client.close().catch((error: unknown) => {
                logger.error(`Gagal menutup koneksi MongoDB: ${errorMessage(error)}`);
            });
            this.client = null;
            this.collection = null;
            this.ready = false;
        }
    }
}

const mongoLog = new MongoLog(config.mongo);

export default mongoLog;
