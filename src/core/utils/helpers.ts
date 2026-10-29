import type { AppServer, JsonObject, JsonValue } from '../types/index.js';

export function extractGroupIdFromChannel(channel: string): string | null {
    const match = /antrian\.group\.(\d+)/.exec(channel);
    return match?.[1] ?? null;
}

export function getRoomClientCount(io: AppServer, roomName: string): number {
    return io.sockets.adapter.rooms.get(roomName)?.size ?? 0;
}

export function createTimestamp(): string {
    return new Date().toISOString();
}

export function cleanIp(ipAddress: string | null | undefined): string {
    return String(ipAddress ?? '').replace(/^::ffff:/, '');
}

export function errorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isJsonValue(value: unknown): value is JsonValue {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return true;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    if (Array.isArray(value)) {
        return value.every((item) => isJsonValue(item));
    }
    if (isRecord(value)) {
        return Object.values(value).every((item) => isJsonValue(item));
    }
    return false;
}

export function isJsonObject(value: unknown): value is JsonObject {
    return isRecord(value) && isJsonValue(value);
}

export function isTruthyJson<T extends JsonValue | undefined>(
    value: T
): value is Exclude<T, undefined | null | false | '' | 0> {
    return value !== undefined && value !== null && value !== false && value !== '' && value !== 0;
}

export function jsonOrDefault(value: JsonValue | undefined, fallback: string): JsonValue {
    if (!isTruthyJson(value)) {
        return fallback;
    }
    return value;
}

export function readJsonObject(value: unknown): JsonObject {
    if (value === undefined || value === null) {
        return {};
    }
    if (!isJsonObject(value)) {
        throw new TypeError('Payload must be an object');
    }
    return value;
}

export function requireJsonObject(value: unknown): JsonObject {
    if (!isJsonObject(value)) {
        throw new TypeError('Payload must be an object');
    }
    return value;
}

/** Nama event Redis tidak bisa dimasukkan ke peta event statis tanpa melemahkan tipe yang lain. */
export function emitNamed(target: object, event: string, payload: JsonValue): void {
    const emitter = target as { emit: (name: string, body: JsonValue) => void };
    emitter.emit(event, payload);
}
