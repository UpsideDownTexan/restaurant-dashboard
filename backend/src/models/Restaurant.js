import { getDb } from '../database/db.js';

export class Restaurant {
    static getAll() {
        const db = getDb();
        return db.prepare(`
            SELECT * FROM restaurants
            WHERE is_active = 1
            ORDER BY brand, name
        `).all();
    }

    static getById(id) {
        const db = getDb();
        return db.prepare('SELECT * FROM restaurants WHERE id = ?').get(id);
    }

    static getByAlohaId(alohaStoreId) {
        const db = getDb();
        return db.prepare('SELECT * FROM restaurants WHERE aloha_store_id = ?').get(alohaStoreId);
    }

    static getByBrand(brand) {
        const db = getDb();
        return db.prepare(`
            SELECT * FROM restaurants
            WHERE brand = ? AND is_active = 1
            ORDER BY name
        `).all(brand);
    }
}

export default Restaurant;
