import type { AppConfig, CorsConfig, MongoConfig, MysqlConfig } from '../types/index.js';

function readEnv(name: string): string | undefined {
    return process.env[name];
}

function readPort(): number {
    const raw = readEnv('SOCKETIO_PORT');
    if (raw === undefined || raw.trim() === '') {
        return 6001;
    }
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`SOCKETIO_PORT tidak valid: ${raw}`);
    }
    return port;
}

function readMysqlPort(): number {
    const raw = readEnv('MYSQL_PORT');
    if (raw === undefined || raw.trim() === '') {
        return 3306;
    }
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`MYSQL_PORT tidak valid: ${raw}`);
    }
    return port;
}

function readMysql(): MysqlConfig | null {
    const host = readEnv('MYSQL_HOST') ?? '';
    const database = readEnv('MYSQL_DATABASE') ?? '';
    const user = readEnv('MYSQL_USER') ?? '';
    if (!host || !database || !user) {
        return null;
    }
    return {
        host,
        port: readMysqlPort(),
        database,
        user,
        password: readEnv('MYSQL_PASSWORD') ?? ''
    };
}

function readCors(): CorsConfig {
    const origin = readEnv('CORS_ORIGIN');
    const methodsRaw = readEnv('CORS_METHODS');
    const credentialsRaw = readEnv('CORS_CREDENTIALS');
    const methods = methodsRaw === undefined || methodsRaw.trim() === ''
        ? ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
        : methodsRaw.split(',').map((method) => method.trim()).filter((method) => method !== '');

    return {
        origin: origin === undefined || origin === '' ? '*' : origin,
        methods: methods.length > 0 ? methods : ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        credentials: credentialsRaw !== undefined && credentialsRaw.trim().toLowerCase() === 'true'
    };
}

function readMongo(): MongoConfig {
    return {
        uri: readEnv('MONGODB_URI') || 'mongodb://127.0.0.1:27017',
        db: readEnv('MONGODB_DB') || 'simrs_ws',
        collection: readEnv('MONGODB_COLLECTION') || 'events'
    };
}

function loadConfig(): AppConfig {
    return {
        port: readPort(),
        redis: { url: readEnv('REDIS_URL') || 'redis://127.0.0.1:6379/0' },
        mongo: readMongo(),
        mysql: readMysql(),
        cors: readCors()
    };
}

const config: AppConfig = loadConfig();

export default config;
