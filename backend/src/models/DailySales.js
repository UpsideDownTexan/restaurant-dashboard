import { getDb } from '../database/db.js';

export class DailySales {
    /**
     * Get sales for a specific restaurant and date range
     */
    static getByDateRange(restaurantId, startDate, endDate) {
        const db = getDb();
        return db.prepare(`
            SELECT ds.*, r.name as restaurant_name, r.short_name
            FROM daily_sales ds
            JOIN restaurants r ON ds.restaurant_id = r.id
            WHERE ds.restaurant_id = ?
            AND ds.business_date BETWEEN ? AND ?
            ORDER BY ds.business_date DESC
        `).all(restaurantId, startDate, endDate);
    }

    /**
     * Get consolidated sales for all restaurants
     */
    static getConsolidatedByDateRange(startDate, endDate) {
        const db = getDb();
        return db.prepare(`
            SELECT
                ds.business_date,
                SUM(ds.gross_sales) as gross_sales,
                SUM(ds.net_sales) as net_sales,
                SUM(ds.comps) as comps,
                SUM(ds.discounts) as discounts,
                SUM(ds.guest_count) as guest_count,
                SUM(ds.check_count) as check_count,
                ROUND(SUM(ds.net_sales) / NULLIF(SUM(ds.check_count), 0), 2) as avg_check,
                SUM(ds.food_sales) as food_sales,
                SUM(ds.beverage_sales) as beverage_sales,
                SUM(ds.alcohol_sales) as alcohol_sales
            FROM daily_sales ds
            JOIN restaurants r ON ds.restaurant_id = r.id
            WHERE r.is_active = 1
            AND ds.business_date BETWEEN ? AND ?
            GROUP BY ds.business_date
            ORDER BY ds.business_date DESC
        `).all(startDate, endDate);
    }

    /**
     * Get sales comparison by restaurant for a date range
     */
    static getComparisonByRestaurant(startDate, endDate) {
        const db = getDb();
        return db.prepare(`
            SELECT
                r.id as restaurant_id,
                r.name as restaurant_name,
                r.short_name,
                r.brand,
                SUM(ds.net_sales) as total_net_sales,
                SUM(ds.guest_count) as total_guests,
                COUNT(DISTINCT ds.business_date) as days_count,
                ROUND(SUM(ds.net_sales) / COUNT(DISTINCT ds.business_date), 2) as avg_daily_sales,
                ROUND(SUM(ds.net_sales) / NULLIF(SUM(ds.guest_count), 0), 2) as avg_per_guest
            FROM restaurants r
            LEFT JOIN daily_sales ds ON r.id = ds.restaurant_id
                AND ds.business_date BETWEEN ? AND ?
            WHERE r.is_active = 1
            GROUP BY r.id
            ORDER BY total_net_sales DESC
        `).all(startDate, endDate);
    }

    /**
     * Get single day sales for all restaurants
     */
    static getByDate(date) {
        const db = getDb();
        return db.prepare(`
            SELECT ds.*, r.name as restaurant_name, r.short_name, r.brand
            FROM daily_sales ds
            JOIN restaurants r ON ds.restaurant_id = r.id
            WHERE ds.business_date = ?
            ORDER BY r.brand, r.name
        `).all(date);
    }

    /**
     * Upsert daily sales record
     */
    static upsert(data) {
        const db = getDb();
        const stmt = db.prepare(`
            INSERT INTO daily_sales (
                restaurant_id, business_date, gross_sales, net_sales,
                comps, discounts, voids, refunds,
                cash_sales, credit_card_sales, gift_card_sales, other_payments,
                guest_count, check_count, avg_check, avg_guest_spend,
                food_sales, beverage_sales, alcohol_sales,
                hourly_sales, daypart_sales, data_source, updated_at
            ) VALUES (
                @restaurant_id, @business_date, @gross_sales, @net_sales,
                @comps, @discounts, @voids, @refunds,
                @cash_sales, @credit_card_sales, @gift_card_sales, @other_payments,
                @guest_count, @check_count, @avg_check, @avg_guest_spend,
                @food_sales, @beverage_sales, @alcohol_sales,
                @hourly_sales, @daypart_sales, @data_source, CURRENT_TIMESTAMP
            )
            ON CONFLICT(restaurant_id, business_date) DO UPDATE SET
                gross_sales = excluded.gross_sales,
                net_sales = excluded.net_sales,
                comps = excluded.comps,
                discounts = excluded.discounts,
                voids = excluded.voids,
                refunds = excluded.refunds,
                cash_sales = excluded.cash_sales,
                credit_card_sales = excluded.credit_card_sales,
                gift_card_sales = excluded.gift_card_sales,
                other_payments = excluded.other_payments,
                guest_count = excluded.guest_count,
                check_count = excluded.check_count,
                avg_check = excluded.avg_check,
                avg_guest_spend = excluded.avg_guest_spend,
                food_sales = excluded.food_sales,
                beverage_sales = excluded.beverage_sales,
                alcohol_sales = excluded.alcohol_sales,
                hourly_sales = excluded.hourly_sales,
                daypart_sales = excluded.daypart_sales,
                data_source = excluded.data_source,
                updated_at = CURRENT_TIMESTAMP
        `);

        return stmt.run({
            restaurant_id: data.restaurant_id,
            business_date: data.business_date,
            gross_sales: data.gross_sales || 0,
            net_sales: data.net_sales || 0,
            comps: data.comps || 0,
            discounts: data.discounts || 0,
            voids: data.voids || 0,
            refunds: data.refunds || 0,
            cash_sales: data.cash_sales || 0,
            credit_card_sales: data.credit_card_sales || 0,
            gift_card_sales: data.gift_card_sales || 0,
            other_payments: data.other_payments || 0,
            guest_count: data.guest_count || 0,
            check_count: data.check_count || 0,
            avg_check: data.avg_check || 0,
            avg_guest_spend: data.avg_guest_spend || 0,
            food_sales: data.food_sales || 0,
            beverage_sales: data.beverage_sales || 0,
            alcohol_sales: data.alcohol_sales || 0,
            hourly_sales: data.hourly_sales ? JSON.stringify(data.hourly_sales) : null,
            daypart_sales: data.daypart_sales ? JSON.stringify(data.daypart_sales) : null,
            data_source: data.data_source || 'aloha'
        });
    }

    /**
     * Get week over week comparison
     */
    static getWeekOverWeek(restaurantId = null) {
        const db = getDb();
        const whereClause = restaurantId ? 'AND ds.restaurant_id = ?' : '';
        const params = restaurantId ? [restaurantId] : [];

        return db.prepare(`
            WITH current_week AS (
                SELECT
                    COALESCE(SUM(net_sales), 0) as sales,
                    COALESCE(SUM(guest_count), 0) as guests
                FROM daily_sales ds
                JOIN restaurants r ON ds.restaurant_id = r.id
                WHERE r.is_active = 1
                AND ds.business_date >= date('now', '-7 days')
                ${whereClause}
            ),
            prior_week AS (
                SELECT
                    COALESCE(SUM(net_sales), 0) as sales,
                    COALESCE(SUM(guest_count), 0) as guests
                FROM daily_sales ds
                JOIN restaurants r ON ds.restaurant_id = r.id
                WHERE r.is_active = 1
                AND ds.business_date >= date('now', '-14 days')
                AND ds.business_date < date('now', '-7 days')
                ${whereClause}
            )
            SELECT
                cw.sales as current_sales,
                cw.guests as current_guests,
                pw.sales as prior_sales,
                pw.guests as prior_guests,
                ROUND((cw.sales - pw.sales) / NULLIF(pw.sales, 0) * 100, 2) as sales_change_pct,
                ROUND((cw.guests - pw.guests) / NULLIF(pw.guests, 0) * 100, 2) as guests_change_pct
            FROM current_week cw, prior_week pw
        `).get(...params, ...params);
    }

        // Get same day prior year comparison for YoY analysis
        static getPriorYearComparison(date, restaurantId = null) {
                    const db = getDb();
                    const priorYearDate = new Date(date);
                    priorYearDate.setFullYear(priorYearDate.getFullYear() - 1);
                    // Adjust to same day of week
                    const dayDiff = new Date(date).getDay() - priorYearDate.getDay();
                    priorYearDate.setDate(priorYearDate.getDate() + dayDiff);
                    const pyDateStr = priorYearDate.toISOString().split('T')[0];

                    let sql = `SELECT ds.*, r.short_name FROM daily_sales ds 
                                JOIN restaurants r ON ds.restaurant_id = r.id 
                                            WHERE ds.business_date IN (?, ?)`;
                    const params = [date, pyDateStr];
                    if (restaurantId) { sql += ' AND ds.restaurant_id = ?'; params.push(restaurantId); }
                    return db.prepare(sql).all(...params);
        }

        // Get week-to-date with prior year comparison
        static getWTDWithPriorYear(restaurantId = null) {
                    const db = getDb();
                    const today = new Date();
                    const dayOfWeek = today.getDay();
                    const weekStart = new Date(today);
                    weekStart.setDate(today.getDate() - dayOfWeek);

                    let sql = `WITH current_wtd AS (
                                SELECT restaurant_id, SUM(net_sales) as sales, SUM(guest_count) as guests
                                            FROM daily_sales WHERE business_date >= ? AND business_date <= ?
                                                        ${restaurantId ? 'AND restaurant_id = ?' : ''} GROUP BY restaurant_id
                                                                ), prior_wtd AS (
                                                                            SELECT restaurant_id, SUM(net_sales) as sales, SUM(guest_count) as guests
                                                                                        FROM daily_sales WHERE business_date >= date(?, '-1 year') AND business_date <= date(?, '-1 year')
                                                                                                    ${restaurantId ? 'AND restaurant_id = ?' : ''} GROUP BY restaurant_id
                                                                                                            ) SELECT c.*, p.sales as py_sales, p.guests as py_guests FROM current_wtd c LEFT JOIN prior_wtd p ON c.restaurant_id = p.restaurant_id`;

                    const params = [weekStart.toISOString().split('T')[0], today.toISOString().split('T')[0]];
                    if (restaurantId) params.push(restaurantId);
                    params.push(weekStart.toISOString().split('T')[0], today.toISOString().split('T')[0]);
                    if (restaurantId) params.push(restaurantId);
                    return db.prepare(sql).all(...params);
        }
}

export default DailySales;
