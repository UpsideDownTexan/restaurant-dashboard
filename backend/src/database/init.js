import { initDb } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../database/restaurant_dashboard.db');

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
    const restaurants = [
        { name: "Mariano's Arlington", short_name: "MAR-ARL", brand: "Marianos", city: "Arlington", aloha_store_id: "store_001", netchex_location_id: "loc_001" },
        { name: "Mariano's Dallas", short_name: "MAR-DAL", brand: "Marianos", city: "Dallas", aloha_store_id: "store_002", netchex_location_id: "loc_002" },
        { name: "La Hacienda Ranch Frisco", short_name: "LHR-FRI", brand: "La Hacienda Ranch", city: "Frisco", aloha_store_id: "store_003", netchex_location_id: "loc_003" },
        { name: "La Hacienda Ranch Plano", short_name: "LHR-PLA", brand: "La Hacienda Ranch", city: "Plano", aloha_store_id: "store_004", netchex_location_id: "loc_004" },
        { name: "La Hacienda Ranch Colleyville", short_name: "LHR-COL", brand: "La Hacienda Ranch", city: "Colleyville", aloha_store_id: "store_005", netchex_location_id: "loc_005" },
    ];

    // Insert restaurants
    for (const r of restaurants) {
        db.prepare(`
            INSERT OR IGNORE INTO restaurants (name, short_name, brand, city, state, aloha_store_id, netchex_location_id)
            VALUES (?, ?, ?, ?, 'TX', ?, ?)
        `).run(r.name, r.short_name, r.brand, r.city, r.aloha_store_id, r.netchex_location_id);
    }

    console.log('✅ Database initialized successfully!');
    console.log(`📍 Database location: ${DB_PATH}`);
    console.log(`🏪 Restaurants seeded: ${restaurants.length}`);

    // Verify
    const count = db.prepare('SELECT COUNT(*) as count FROM restaurants').get();
    console.log(`📊 Total restaurants in database: ${count.count}`);
}

init().catch(console.error);

export default DB_PATH;
