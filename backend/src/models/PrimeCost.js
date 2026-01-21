import { getDb } from '../database/db.js';

export class PrimeCost {
    /**
     * Get prime cost data for a date range
     */
    static getByDateRange(startDate, endDate, restaurantId = null) {
        const db = getDb();
        const whereRestaurant = restaurantId ? 'AND dpc.restaurant_id = ?' : '';
        const params = restaurantId
            ? [startDate, endDate, restaurantId]
            : [startDate, endDate];

        return db.prepare(`
            SELECT
                dpc.*,
                r.name as restaurant_name,
                r.short_name,
                r.brand
            FROM daily_prime_cost dpc
            JOIN restaurants r ON dpc.restaurant_id = r.id
            WHERE r.is_active = 1
            AND dpc.business_date BETWEEN ? AND ?
            ${whereRestaurant}
            ORDER BY dpc.business_date DESC
        `).all(...params);
    }

    /**
     * Get consolidated prime cost summary
     */
    static getConsolidatedSummary(startDate, endDate) {
        const db = getDb();
        return db.prepare(`
            SELECT
                SUM(dpc.net_sales) as total_sales,
                SUM(dpc.total_cogs) as total_cogs,
                SUM(dpc.total_labor) as total_labor,
                SUM(dpc.prime_cost) as total_prime_cost,
                ROUND(SUM(dpc.total_cogs) / NULLIF(SUM(dpc.net_sales), 0) * 100, 2) as cogs_percent,
                ROUND(SUM(dpc.total_labor) / NULLIF(SUM(dpc.net_sales), 0) * 100, 2) as labor_percent,
                ROUND(SUM(dpc.prime_cost) / NULLIF(SUM(dpc.net_sales), 0) * 100, 2) as prime_cost_percent,
                SUM(dpc.gross_profit) as gross_profit,
                ROUND(SUM(dpc.gross_profit) / NULLIF(SUM(dpc.net_sales), 0) * 100, 2) as gross_profit_percent,
                COUNT(DISTINCT dpc.business_date) as days_count
            FROM daily_prime_cost dpc
            JOIN restaurants r ON dpc.restaurant_id = r.id
            WHERE r.is_active = 1
            AND dpc.business_date BETWEEN ? AND ?
        `).get(startDate, endDate);
    }

    /**
     * Get prime cost comparison by restaurant
     */
    static getComparisonByRestaurant(startDate, endDate) {
        const db = getDb();
        return db.prepare(`
            SELECT
                r.id as restaurant_id,
                r.name as restaurant_name,
                r.short_name,
                r.brand,
                SUM(dpc.net_sales) as total_sales,
                SUM(dpc.total_cogs) as total_cogs,
                SUM(dpc.total_labor) as total_labor,
                SUM(dpc.prime_cost) as total_prime_cost,
                ROUND(SUM(dpc.total_cogs) / NULLIF(SUM(dpc.net_sales), 0) * 100, 2) as cogs_percent,
                ROUND(SUM(dpc.total_labor) / NULLIF(SUM(dpc.net_sales), 0) * 100, 2) as labor_percent,
                ROUND(SUM(dpc.prime_cost) / NULLIF(SUM(dpc.net_sales), 0) * 100, 2) as prime_cost_percent,
                ROUND(AVG(dpc.target_prime_cost_percent), 2) as target_prime_percent,
                ROUND(
                    (SUM(dpc.prime_cost) / NULLIF(SUM(dpc.net_sales), 0) * 100) -
                    AVG(dpc.target_prime_cost_percent),
                    2
                ) as variance_from_target
            FROM restaurants r
            LEFT JOIN daily_prime_cost dpc ON r.id = dpc.restaurant_id
                AND dpc.business_date BETWEEN ? AND ?
            WHERE r.is_active = 1
            GROUP BY r.id
            ORDER BY prime_cost_percent ASC
        `).all(startDate, endDate);
    }

    /**
     * Get daily prime cost trend
     */
    static getDailyTrend(startDate, endDate, restaurantId = null) {
        const db = getDb();
        const groupBy = restaurantId ? 'dpc.business_date' : 'dpc.business_date';
        const whereRestaurant = restaurantId ? 'AND dpc.restaurant_id = ?' : '';
        const params = restaurantId
            ? [startDate, endDate, restaurantId]
            : [startDate, endDate];

        return db.prepare(`
            SELECT
                dpc.business_date,
                SUM(dpc.net_sales) as net_sales,
                SUM(dpc.total_cogs) as total_cogs,
                SUM(dpc.total_labor) as total_labor,
                SUM(dpc.prime_cost) as prime_cost,
                ROUND(SUM(dpc.prime_cost) / NULLIF(SUM(dpc.net_sales), 0) * 100, 2) as prime_cost_percent,
                ROUND(SUM(dpc.total_labor) / NULLIF(SUM(dpc.net_sales), 0) * 100, 2) as labor_percent,
                ROUND(SUM(dpc.total_cogs) / NULLIF(SUM(dpc.net_sales), 0) * 100, 2) as cogs_percent
            FROM daily_prime_cost dpc
            JOIN restaurants r ON dpc.restaurant_id = r.id
            WHERE r.is_active = 1
            AND dpc.business_date BETWEEN ? AND ?
            ${whereRestaurant}
            GROUP BY ${groupBy}
            ORDER BY dpc.business_date ASC
        `).all(...params);
    }

    /**
     * Calculate and upsert prime cost from sales, labor, and food cost
     */
    static calculateAndUpsert(restaurantId, businessDate) {
        const db = getDb();

        // Get the components
        const sales = db.prepare(`
            SELECT net_sales FROM daily_sales
            WHERE restaurant_id = ? AND business_date = ?
        `).get(restaurantId, businessDate);

        const labor = db.prepare(`
            SELECT total_labor_cost, total_labor_burden FROM daily_labor
            WHERE restaurant_id = ? AND business_date = ?
        `).get(restaurantId, businessDate);

        const foodCost = db.prepare(`
            SELECT total_cogs FROM daily_food_cost
            WHERE restaurant_id = ? AND business_date = ?
        `).get(restaurantId, businessDate);

        // Calculate prime cost
        const netSales = sales?.net_sales || 0;
        const totalLabor = labor?.total_labor_burden || labor?.total_labor_cost || 0;
        const totalCogs = foodCost?.total_cogs || 0;
        const primeCost = totalCogs + totalLabor;
        const grossProfit = netSales - primeCost;

        // Calculate percentages
        const cogsPercent = netSales > 0 ? (totalCogs / netSales * 100) : 0;
        const laborPercent = netSales > 0 ? (totalLabor / netSales * 100) : 0;
        const primeCostPercent = netSales > 0 ? (primeCost / netSales * 100) : 0;
        const grossProfitPercent = netSales > 0 ? (grossProfit / netSales * 100) : 0;

        const targetPercent = 65; // Industry standard target
        const variancePercent = primeCostPercent - targetPercent;
        const varianceDollars = (variancePercent / 100) * netSales;

        // Upsert
        const stmt = db.prepare(`
            INSERT INTO daily_prime_cost (
                restaurant_id, business_date, net_sales,
                total_cogs, total_labor, prime_cost,
                cogs_percent, labor_percent, prime_cost_percent,
                target_prime_cost_percent, variance_percent, variance_dollars,
                gross_profit, gross_profit_percent, updated_at
            ) VALUES (
                ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?,
                ?, ?, CURRENT_TIMESTAMP
            )
            ON CONFLICT(restaurant_id, business_date) DO UPDATE SET
                net_sales = excluded.net_sales,
                total_cogs = excluded.total_cogs,
                total_labor = excluded.total_labor,
                prime_cost = excluded.prime_cost,
                cogs_percent = excluded.cogs_percent,
                labor_percent = excluded.labor_percent,
                prime_cost_percent = excluded.prime_cost_percent,
                variance_percent = excluded.variance_percent,
                variance_dollars = excluded.variance_dollars,
                gross_profit = excluded.gross_profit,
                gross_profit_percent = excluded.gross_profit_percent,
                updated_at = CURRENT_TIMESTAMP
        `);

        return stmt.run(
            restaurantId, businessDate, netSales,
            totalCogs, totalLabor, primeCost,
            cogsPercent, laborPercent, primeCostPercent,
            targetPercent, variancePercent, varianceDollars,
            grossProfit, grossProfitPercent
        );
    }

    /**
     * Get alerts for locations over target prime cost
     */
    static getAlerts(startDate, endDate, targetPercent = 65) {
        const db = getDb();
        return db.prepare(`
            SELECT
                r.name as restaurant_name,
                r.short_name,
                dpc.business_date,
                dpc.prime_cost_percent,
                dpc.labor_percent,
                dpc.cogs_percent,
                dpc.variance_percent,
                dpc.variance_dollars
            FROM daily_prime_cost dpc
            JOIN restaurants r ON dpc.restaurant_id = r.id
            WHERE r.is_active = 1
            AND dpc.business_date BETWEEN ? AND ?
            AND dpc.prime_cost_percent > ?
            ORDER BY dpc.prime_cost_percent DESC
        `).all(startDate, endDate, targetPercent);
    }
}

export default PrimeCost;
