import { initDb } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../.././database/restaurant.db');

async function init() {
        // Initialize database
    const db = await initDb();

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute each statement separately
    const statements = schema.split(';').filter(s => s.trim());
        for (const stmt of statements) {
                    if (stmt.trim()) {
                                    try {
                                                        db.exec(stmt + ';');
                                    } catch (err) {
                                                        // Ignore "already exists" errors
                                        if (!err.message.includes('already exists')) {
                                                                console.error('Schema error:', err.message);
                                        }
                                    }
                    }
        }

    // Seed the restaurants
    // Aloha Store IDs discovered from Aloha Enterprise dashboard
    // NetChex company names format: "CAM - COMPANY NAME"
    const restaurants = [
        {
                        name: "La Hacienda Ranch Arlington",
                        short_name: "LHR-ARL",
                        brand: "La Hacienda Ranch",
                        city: "Arlington",
                        aloha_store_id: "2614",
                        netchex_company_name: "CAM - MARIANOS RESTAURANT ARLINGTON INC"
        },
        {
                        name: "La Hacienda Ranch Colleyville",
                        short_name: "LHR-COL",
                        brand: "La Hacienda Ranch",
                        city: "Colleyville",
            aloha_store_id: "5250",                        netchex_company_name: null
        },
        {
                        name: "La Hacienda Ranch Frisco",
                        short_name: "LHR-FRI",
                        brand: "La Hacienda Ranch",
                        city: "Frisco",
                        aloha_store_id: "4110",
                        netchex_company_name: null
        },
        {
                        name: "La Hacienda Ranch Preston Trail",
                        short_name: "LHR-PT",
                        brand: "La Hacienda Ranch",
                        city: "Dallas",
            aloha_store_id: "17390",                        netchex_company_name: null
        },
        {
                        name: "La Hacienda Ranch Skillman",
                        short_name: "LHR-SKL",
                        brand: "La Hacienda Ranch",
                        city: "Dallas",
            aloha_store_id: "6300",                        netchex_company_name: null
        },
            ];

    // Insert restaurants
    for (const r of restaurants) {
                db.prepare('INSERT OR IGNORE INTO restaurants (name, short_name, brand, city, state, aloha_store_id, netchex_company_name) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
                                r.name, r.short_name, r.brand, r.city, 'TX', r.aloha_store_id, r.netchex_company_name
                            );
    }

    console.log('Database initialized with', restaurants.length, 'restaurants');

    return db;
}

export { init };
export default init;
