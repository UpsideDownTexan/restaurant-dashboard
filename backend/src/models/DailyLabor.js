import { getDb } from '../database/db.js';

export class DailyLabor {
    /**
     * Get labor data for a specific restaurant and date range
     */
    static getByDateRange(restaurantId, startDate, endDate) {
        const db = getDb();
        return db.prepare(`
            SELECT dl.*, r.name as restaurant_name, r.short_name
            FROM daily_labor dl
            JOIN restaurants r ON dl.restaurant_id = r.id
            WHERE dl.restaurant_id = ?
            AND dl.business_date BETWEEN ? AND ?
            ORDER BY dl.business_date DESC
        `).all(restaurantId, startDate, endDate);
    }

    /**
     * Get consolidated labor for all restaurants
     */
    static getConsolidatedByDateRange(startDate, endDate) {
        const db = getDb();
        return db.prepare(`
            SELECT
                dl.business_date,
                SUM(dl.total_hours) as total_hours,
                SUM(dl.regular_hours) as regular_hours,
                SUM(dl.overtime_hours) as overtime_hours,
                SUM(dl.total_labor_cost) as total_labor_cost,
                SUM(dl.regular_wages) as regular_wages,
                SUM(dl.overtime_wages) as overtime_wages,
                SUM(dl.foh_hours) as foh_hours,
                SUM(dl.foh_cost) as foh_cost,
                SUM(dl.boh_hours) as boh_hours,
                SUM(dl.boh_cost) as boh_cost,
                SUM(dl.management_hours) as management_hours,
                SUM(dl.management_cost) as management_cost,
                SUM(dl.payroll_taxes) as payroll_taxes,
                SUM(dl.total_labor_burden) as total_labor_burden,
                SUM(dl.employee_count) as employee_count
            FROM daily_labor dl
            JOIN restaurants r ON dl.restaurant_id = r.id
            WHERE r.is_active = 1
            AND dl.business_date BETWEEN ? AND ?
            GROUP BY dl.business_date
            ORDER BY dl.business_date DESC
        `).all(startDate, endDate);
    }

    /**
     * Get labor with sales for labor % calculation
     */
    static getLaborWithSales(startDate, endDate, restaurantId = null) {
        const db = getDb();
        const whereRestaurant = restaurantId ? 'AND dl.restaurant_id = ?' : '';
        const params = restaurantId
            ? [startDate, endDate, restaurantId]
            : [startDate, endDate];

        return db.prepare(`
            SELECT
                dl.business_date,
                ${restaurantId ? 'r.name as restaurant_name,' : ''}
                COALESCE(SUM(dl.total_labor_cost), 0) as labor_cost,
                COALESCE(SUM(dl.total_labor_burden), 0) as labor_burden,
                COALESCE(SUM(dl.total_hours), 0) as labor_hours,
                COALESCE(SUM(ds.net_sales), 0) as net_sales,
                ROUND(
                    COALESCE(SUM(dl.total_labor_cost), 0) /
                    NULLIF(COALESCE(SUM(ds.net_sales), 0), 0) * 100,
                    2
                ) as labor_percent
            FROM daily_labor dl
            JOIN restaurants r ON dl.restaurant_id = r.id
            LEFT JOIN daily_sales ds ON dl.restaurant_id = ds.restaurant_id
                AND dl.business_date = ds.business_date
            WHERE r.is_active = 1
            AND dl.business_date BETWEEN ? AND ?
            ${whereRestaurant}
            GROUP BY dl.business_date ${restaurantId ? ', r.id' : ''}
            ORDER BY dl.business_date DESC
        `).all(...params);
    }

    /**
     * Get labor comparison by restaurant
     */
    static getComparisonByRestaurant(startDate, endDate) {
        const db = getDb();
        return db.prepare(`
            SELECT
                r.id as restaurant_id,
                r.name as restaurant_name,
                r.short_name,
                r.brand,
                COALESCE(SUM(dl.total_labor_cost), 0) as total_labor_cost,
                COALESCE(SUM(dl.total_hours), 0) as total_hours,
                COALESCE(SUM(dl.overtime_hours), 0) as overtime_hours,
                COALESCE(SUM(ds.net_sales), 0) as total_sales,
                ROUND(
                    COALESCE(SUM(dl.total_labor_cost), 0) /
                    NULLIF(COALESCE(SUM(ds.net_sales), 0), 0) * 100,
                    2
                ) as labor_percent,
                ROUND(
                    COALESCE(SUM(ds.net_sales), 0) /
                    NULLIF(COALESCE(SUM(dl.total_hours), 0), 0),
                    2
                ) as sales_per_labor_hour
            FROM restaurants r
            LEFT JOIN daily_labor dl ON r.id = dl.restaurant_id
                AND dl.business_date BETWEEN ? AND ?
            LEFT JOIN daily_sales ds ON r.id = ds.restaurant_id
                AND ds.business_date BETWEEN ? AND ?
            WHERE r.is_active = 1
            GROUP BY r.id
            ORDER BY labor_percent ASC
        `).all(startDate, endDate, startDate, endDate);
    }

    /**
     * Upsert daily labor record
     */
    static upsert(data) {
        const db = getDb();
        const stmt = db.prepare(`
            INSERT INTO daily_labor (
                restaurant_id, business_date,
                total_hours, regular_hours, overtime_hours,
                total_labor_cost, regular_wages, overtime_wages,
                foh_hours, foh_cost, boh_hours, boh_cost,
                management_hours, management_cost,
                payroll_taxes, benefits_cost, total_labor_burden,
                employee_count, labor_percent, hourly_labor_data,
                data_source, updated_at
            ) VALUES (
                @restaurant_id, @business_date,
                @total_hours, @regular_hours, @overtime_hours,
                @total_labor_cost, @regular_wages, @overtime_wages,
                @foh_hours, @foh_cost, @boh_hours, @boh_cost,
                @management_hours, @management_cost,
                @payroll_taxes, @benefits_cost, @total_labor_burden,
                @employee_count, @labor_percent, @hourly_labor_data,
                @data_source, CURRENT_TIMESTAMP
            )
            ON CONFLICT(restaurant_id, business_date) DO UPDATE SET
                total_hours = excluded.total_hours,
                regular_hours = excluded.regular_hours,
                overtime_hours = excluded.overtime_hours,
                total_labor_cost = excluded.total_labor_cost,
                regular_wages = excluded.regular_wages,
                overtime_wages = excluded.overtime_wages,
                foh_hours = excluded.foh_hours,
                foh_cost = excluded.foh_cost,
                boh_hours = excluded.boh_hours,
                boh_cost = excluded.boh_cost,
                management_hours = excluded.management_hours,
                management_cost = excluded.management_cost,
                payroll_taxes = excluded.payroll_taxes,
                benefits_cost = excluded.benefits_cost,
                total_labor_burden = excluded.total_labor_burden,
                employee_count = excluded.employee_count,
                labor_percent = excluded.labor_percent,
                hourly_labor_data = excluded.hourly_labor_data,
                data_source = excluded.data_source,
                updated_at = CURRENT_TIMESTAMP
        `);

        return stmt.run({
            restaurant_id: data.restaurant_id,
            business_date: data.business_date,
            total_hours: data.total_hours || 0,
            regular_hours: data.regular_hours || 0,
            overtime_hours: data.overtime_hours || 0,
            total_labor_cost: data.total_labor_cost || 0,
            regular_wages: data.regular_wages || 0,
            overtime_wages: data.overtime_wages || 0,
            foh_hours: data.foh_hours || 0,
            foh_cost: data.foh_cost || 0,
            boh_hours: data.boh_hours || 0,
            boh_cost: data.boh_cost || 0,
            management_hours: data.management_hours || 0,
            management_cost: data.management_cost || 0,
            payroll_taxes: data.payroll_taxes || 0,
            benefits_cost: data.benefits_cost || 0,
            total_labor_burden: data.total_labor_burden || 0,
            employee_count: data.employee_count || 0,
            labor_percent: data.labor_percent || 0,
            hourly_labor_data: data.hourly_labor_data ? JSON.stringify(data.hourly_labor_data) : null,
            data_source: data.data_source || 'netchex'
        });
    }

    /**
     * Get overtime alerts
     */
    static getOvertimeAlerts(startDate, endDate, threshold = 0) {
        const db = getDb();
        return db.prepare(`
            SELECT
                r.name as restaurant_name,
                r.short_name,
                dl.business_date,
                dl.overtime_hours,
                dl.overtime_wages,
                dl.total_hours,
                ROUND(dl.overtime_hours / dl.total_hours * 100, 2) as overtime_percent
            FROM daily_labor dl
            JOIN restaurants r ON dl.restaurant_id = r.id
            WHERE r.is_active = 1
            AND dl.business_date BETWEEN ? AND ?
            AND dl.overtime_hours > ?
            ORDER BY dl.overtime_hours DESC
        `).all(startDate, endDate, threshold);
    }
}

export default DailyLabor;
