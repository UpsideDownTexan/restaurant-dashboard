import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../database/restaurant_dashboard.db');

// Ensure database directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Singleton database instance
let db = null;
let SQL = null;

// Wrapper class to match better-sqlite3 API
class SQLiteWrapper {
    constructor(database) {
        this._db = database;
    }

    prepare(sql) {
        const db = this._db;
        const self = this;
        return {
            run: (...params) => {
                try {
                    if (params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])) {
                        // Named parameters
                        const obj = params[0];
                        const namedParams = {};
                        for (const key of Object.keys(obj)) {
                            namedParams[`@${key}`] = obj[key];
                        }
                        db.run(sql, namedParams);
                    } else {
                        db.run(sql, params);
                    }
                    self._saveDatabase();
                    return { changes: db.getRowsModified() };
                } catch (err) {
                    console.error('SQL Error:', err.message, '\nSQL:', sql);
                    throw err;
                }
            },
            get: (...params) => {
                try {
                    const stmt = db.prepare(sql);
                    if (params.length > 0) {
                        stmt.bind(params);
                    }
                    if (stmt.step()) {
                        const row = stmt.getAsObject();
                        stmt.free();
                        return row;
                    }
                    stmt.free();
                    return undefined;
                } catch (err) {
                    console.error('SQL Error:', err.message, '\nSQL:', sql);
                    throw err;
                }
            },
            all: (...params) => {
                try {
                    const stmt = db.prepare(sql);
                    if (params.length > 0) {
                        stmt.bind(params);
                    }
                    const results = [];
                    while (stmt.step()) {
                        results.push(stmt.getAsObject());
                    }
                    stmt.free();
                    return results;
                } catch (err) {
                    console.error('SQL Error:', err.message, '\nSQL:', sql);
                    throw err;
                }
            }
        };
    }

    exec(sql) {
        this._db.run(sql);
        this._saveDatabase();
    }

    pragma(setting) {
        // sql.js doesn't support all pragmas, but we can handle common ones
        if (setting.includes('journal_mode')) {
            // Ignored for sql.js
        }
    }

    close() {
        this._saveDatabase();
        this._db.close();
    }

    transaction(fn) {
        const self = this;
        return (...args) => {
            self._db.run('BEGIN TRANSACTION');
            try {
                const result = fn(...args);
                self._db.run('COMMIT');
                self._saveDatabase();
                return result;
            } catch (err) {
                self._db.run('ROLLBACK');
                throw err;
            }
        };
    }

    _saveDatabase() {
        if (this._db) {
            const data = this._db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(DB_PATH, buffer);
        }
    }
}

export async function initDb() {
    if (!SQL) {
        SQL = await initSqlJs();
    }

    if (!db) {
        let sqlDb;
        if (fs.existsSync(DB_PATH)) {
            const buffer = fs.readFileSync(DB_PATH);
            sqlDb = new SQL.Database(buffer);
        } else {
            sqlDb = new SQL.Database();
        }
        db = new SQLiteWrapper(sqlDb);
    }

    return db;
}

export function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDb() first.');
    }
    return db;
}

export function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}

export default getDb;
