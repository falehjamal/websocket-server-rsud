import mysql, { type RowDataPacket } from 'mysql2/promise';
import type {
    EnrichedMonitorNotification,
    EnrichedMonitorPrescription,
    MonitorNotification,
    MonitorPrescription,
    MonitoringSnapshot,
    MonitoringUpdatePayload,
    MysqlConfig
} from '../../core/types/index.js';
import logger from '../../core/services/logger.js';

const MODEL_TYPE = 'App\\Models\\User';

interface CachedUser {
    name: string | null;
    roles: string[];
}

function normalizeUsername(username: unknown): string {
    if (username === undefined || username === null || username === false || username === 0 || username === '') {
        return '';
    }
    return String(username).trim().toLowerCase();
}

function cell(row: RowDataPacket, key: string): unknown {
    return row[key];
}

function textOrNull(value: unknown): string | null {
    if (typeof value !== 'string' || value === '') {
        return null;
    }
    return value;
}

class UserDirectory {
    private readonly cache = new Map<string, CachedUser>();
    private pool: mysql.Pool | null = null;
    private initPromise: Promise<void> | null = null;

    constructor(private readonly mysqlConfig: MysqlConfig | null) {}

    private async ensureReady(): Promise<void> {
        if (!this.initPromise) {
            this.initPromise = this.connect();
        }
        await this.initPromise;
    }

    private async connect(): Promise<void> {
        if (!this.mysqlConfig) {
            logger.warn('User directory nonaktif: MYSQL_HOST, MYSQL_DATABASE, atau MYSQL_USER kosong');
            return;
        }

        this.pool = mysql.createPool({
            host: this.mysqlConfig.host,
            port: this.mysqlConfig.port,
            database: this.mysqlConfig.database,
            user: this.mysqlConfig.user,
            password: this.mysqlConfig.password,
            waitForConnections: true,
            connectionLimit: 2,
            charset: 'utf8mb4'
        });

        logger.info('User directory terhubung ke MySQL untuk cache nama dan role');
    }

    async enrich(snapshot: MonitoringSnapshot): Promise<MonitoringUpdatePayload> {
        await this.ensureReady();

        const notifications = snapshot.notifications;
        const prescriptions = snapshot.prescriptions;
        const displays = snapshot.displays;
        const needed = new Set<string>();

        for (const row of [...notifications, ...prescriptions]) {
            const username = normalizeUsername(row.username);
            if (username && !this.cache.has(username)) {
                needed.add(username);
            }
        }

        if (needed.size > 0) {
            await this.fetchMissing(Array.from(needed));
        }

        const notificationsOut = notifications.map((row) => this.applyNotification(row));
        const prescriptionsOut = prescriptions.map((row) => this.applyPrescription(row));
        const users = new Set<string>();
        for (const row of notificationsOut) {
            if (row.username) {
                users.add(row.username);
            }
        }

        return {
            notifications: notificationsOut,
            prescriptions: prescriptionsOut,
            displays,
            timestamp: snapshot.timestamp,
            updated_at: snapshot.timestamp,
            summary: {
                notification_tabs: notificationsOut.length,
                notification_users: users.size,
                prescription_tabs: prescriptionsOut.length,
                display_screens: displays.length
            }
        };
    }

    private applyNotification(row: MonitorNotification): EnrichedMonitorNotification {
        return {
            socketId: row.socketId,
            connectedAt: row.connectedAt,
            ipAddress: row.ipAddress,
            path: row.path,
            ...this.identity(row.username)
        };
    }

    private applyPrescription(row: MonitorPrescription): EnrichedMonitorPrescription {
        return {
            socketId: row.socketId,
            connectedAt: row.connectedAt,
            ipAddress: row.ipAddress,
            ...this.identity(row.username)
        };
    }

    private identity(rawUsername: string | null): { username: string | null; name: string | null; roles: string[] } {
        const username = normalizeUsername(rawUsername);
        const cached = username ? this.cache.get(username) : undefined;
        return {
            username: username || null,
            name: cached ? cached.name : null,
            roles: cached ? cached.roles.slice() : []
        };
    }

    private async fetchMissing(usernames: string[]): Promise<void> {
        if (!this.pool) {
            usernames.forEach((username) => {
                this.cache.set(username, { name: null, roles: [] });
            });
            return;
        }

        const placeholders = usernames.map(() => '?').join(', ');
        const sql = `
            SELECT LOWER(u.username) AS username, u.name AS name, r.name AS role_name
            FROM users u
            LEFT JOIN model_has_roles mhr
                ON mhr.model_id = u.id AND mhr.model_type = ?
            LEFT JOIN roles r ON r.uuid = mhr.role_id
            WHERE LOWER(u.username) IN (${placeholders})
        `;

        try {
            const [rows] = await this.pool.query<RowDataPacket[]>(sql, [MODEL_TYPE, ...usernames]);
            const grouped = new Map<string, CachedUser>();

            for (const row of rows) {
                const username = normalizeUsername(cell(row, 'username'));
                if (!username) {
                    continue;
                }
                const current = grouped.get(username) ?? { name: textOrNull(cell(row, 'name')), roles: [] };
                const roleName = textOrNull(cell(row, 'role_name'));
                if (roleName && !current.roles.includes(roleName)) {
                    current.roles.push(roleName);
                }
                grouped.set(username, current);
            }

            usernames.forEach((username) => {
                this.cache.set(username, grouped.get(username) ?? { name: null, roles: [] });
            });
        } catch (error: unknown) {
            logger.error('Gagal mengambil nama dan role:', error);
        }
    }

    async shutdown(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }
    }
}

export default UserDirectory;
