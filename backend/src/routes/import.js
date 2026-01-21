import express from 'express';
import { DailySales } from '../models/DailySales.js';
import { DailyLabor } from '../models/DailyLabor.js';
import { PrimeCost } from '../models/PrimeCost.js';
import { Restaurant } from '../models/Restaurant.js';
import { getDb } from '../database/db.js';

const router = express.Router();

/**
 * POST /api/import/sales
 * Manual sales data import (CSV/JSON)
 */
router.post('/sales', (req, res) => {
    try {
        const { data } = req.body;

        if (!Array.isArray(data)) {
            return res.status(400).json({ error: 'Data must be an array' });
        }

        let imported = 0;
        let errors = [];

        for (const record of data) {
            try {
                // Validate required fields
                if (!record.restaurant_id || !record.business_date) {
                    errors.push({ record, error: 'Missing restaurant_id or business_date' });
                    continue;
                }

                DailySales.upsert(record);
                imported++;

                // Recalculate prime cost
                PrimeCost.calculateAndUpsert(record.restaurant_id, record.business_date);
            } catch (err) {
                errors.push({ record, error: err.message });
            }
        }

        res.json({
            success: true,
            imported,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('Sales import error:', error);
        res.status(500).json({ error: 'Failed to import sales data' });
    }
});

/**
 * POST /api/import/labor
 * Manual labor data import (CSV/JSON)
 */
router.post('/labor', (req, res) => {
    try {
        const { data } = req.body;

        if (!Array.isArray(data)) {
            return res.status(400).json({ error: 'Data must be an array' });
        }

        let imported = 0;
        let errors = [];

        for (const record of data) {
            try {
                if (!record.restaurant_id || !record.business_date) {
                    errors.push({ record, error: 'Missing restaurant_id or business_date' });
                    continue;
                }

                DailyLabor.upsert(record);
                imported++;

                // Recalculate prime cost
                PrimeCost.calculateAndUpsert(record.restaurant_id, record.business_date);
            } catch (err) {
                errors.push({ record, error: err.message });
            }
        }

        res.json({
            success: true,
            imported,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('Labor import error:', error);
        res.status(500).json({ error: 'Failed to import labor data' });
    }
});

/**
 * POST /api/import/food-cost
 * Manual food cost/COGS data import
 */
router.post('/food-cost', (req, res) => {
    try {
        const { data } = req.body;
        const db = getDb();

        if (!Array.isArray(data)) {
            return res.status(400).json({ error: 'Data must be an array' });
        }

        const stmt = db.prepare(`
            INSERT INTO daily_food_cost (
                restaurant_id, business_date,
                food_cost, beverage_cost, alcohol_cost, total_cogs,
                food_cost_percent, beverage_cost_percent, total_cogs_percent,
                data_source, updated_at
            ) VALUES (
                @restaurant_id, @business_date,
                @food_cost, @beverage_cost, @alcohol_cost, @total_cogs,
                @food_cost_percent, @beverage_cost_percent, @total_cogs_percent,
                @data_source, CURRENT_TIMESTAMP
            )
            ON CONFLICT(restaurant_id, business_date) DO UPDATE SET
                food_cost = excluded.food_cost,
                beverage_cost = excluded.beverage_cost,
                alcohol_cost = excluded.alcohol_cost,
                total_cogs = excluded.total_cogs,
                food_cost_percent = excluded.food_cost_percent,
                beverage_cost_percent = excluded.beverage_cost_percent,
                total_cogs_percent = excluded.total_cogs_percent,
                data_source = excluded.data_source,
                updated_at = CURRENT_TIMESTAMP
        `);

        let imported = 0;
        let errors = [];

        for (const record of data) {
            try {
                if (!record.restaurant_id || !record.business_date) {
                    errors.push({ record, error: 'Missing restaurant_id or business_date' });
                    continue;
                }

                const totalCogs = (record.food_cost || 0) + (record.beverage_cost || 0) + (record.alcohol_cost || 0);

                stmt.run({
                    restaurant_id: record.restaurant_id,
                    business_date: record.business_date,
                    food_cost: record.food_cost || 0,
                    beverage_cost: record.beverage_cost || 0,
                    alcohol_cost: record.alcohol_cost || 0,
                    total_cogs: record.total_cogs || totalCogs,
                    food_cost_percent: record.food_cost_percent || 0,
                    beverage_cost_percent: record.beverage_cost_percent || 0,
                    total_cogs_percent: record.total_cogs_percent || 0,
                    data_source: record.data_source || 'manual'
                });
                imported++;

                // Recalculate prime cost
                PrimeCost.calculateAndUpsert(record.restaurant_id, record.business_date);
            } catch (err) {
                errors.push({ record, error: err.message });
            }
        }

        res.json({
            success: true,
            imported,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('Food cost import error:', error);
        res.status(500).json({ error: 'Failed to import food cost data' });
    }
});

/**
 * POST /api/import/bulk
 * Bulk import for all data types at once
 */
router.post('/bulk', (req, res) => {
    try {
        const { sales, labor, foodCost } = req.body;
        const results = { sales: null, labor: null, foodCost: null };

        // Import sales
        if (sales && Array.isArray(sales)) {
            let imported = 0;
            for (const record of sales) {
                if (record.restaurant_id && record.business_date) {
                    DailySales.upsert(record);
                    imported++;
                }
            }
            results.sales = { imported };
        }

        // Import labor
        if (labor && Array.isArray(labor)) {
            let imported = 0;
            for (const record of labor) {
                if (record.restaurant_id && record.business_date) {
                    DailyLabor.upsert(record);
                    imported++;
                }
            }
            results.labor = { imported };
        }

        // Import food cost
        if (foodCost && Array.isArray(foodCost)) {
            const db = getDb();
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO daily_food_cost (
                    restaurant_id, business_date, food_cost, beverage_cost,
                    alcohol_cost, total_cogs, data_source, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);

            let imported = 0;
            for (const record of foodCost) {
                if (record.restaurant_id && record.business_date) {
                    const totalCogs = (record.food_cost || 0) + (record.beverage_cost || 0) + (record.alcohol_cost || 0);
                    stmt.run(
                        record.restaurant_id,
                        record.business_date,
                        record.food_cost || 0,
                        record.beverage_cost || 0,
                        record.alcohol_cost || 0,
                        record.total_cogs || totalCogs,
                        record.data_source || 'manual'
                    );
                    imported++;
                }
            }
            results.foodCost = { imported };
        }

        // Recalculate prime cost for all affected dates/restaurants
        const allRecords = [
            ...(sales || []),
            ...(labor || []),
            ...(foodCost || [])
        ];

        const uniqueCombos = new Set();
        for (const record of allRecords) {
            if (record.restaurant_id && record.business_date) {
                uniqueCombos.add(`${record.restaurant_id}|${record.business_date}`);
            }
        }

        for (const combo of uniqueCombos) {
            const [restaurantId, businessDate] = combo.split('|');
            PrimeCost.calculateAndUpsert(parseInt(restaurantId), businessDate);
        }

        res.json({
            success: true,
            results,
            primeCostRecalculated: uniqueCombos.size
        });
    } catch (error) {
        console.error('Bulk import error:', error);
        res.status(500).json({ error: 'Failed to bulk import data' });
    }
});

export default router;
