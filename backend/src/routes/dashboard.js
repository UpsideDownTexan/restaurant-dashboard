import express from 'express';
import { format, subDays, startOfWeek, startOfMonth } from 'date-fns';
import { Restaurant } from '../models/Restaurant.js';
import { DailySales } from '../models/DailySales.js';
import { DailyLabor } from '../models/DailyLabor.js';
import { getDb } from '../database/db.js';

const router = express.Router();

/**
 * Helper to get date range from period string
 * Periods: 'today', 'wtd' (week-to-date, Mon-Sun), 'mtd' (month-to-date)
 */
function getDateRange(period) {
        const today = new Date();
        const endDate = format(today, 'yyyy-MM-dd');
        let startDate;

    switch (period) {
        case 'today':
                        startDate = endDate;
                        break;
        case 'wtd': // Week to date (Monday start)
                startDate = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
                        break;
        case 'mtd': // Month to date
                startDate = format(startOfMonth(today), 'yyyy-MM-dd');
                        break;
        default:
                        startDate = endDate; // Default to today
    }

    return { startDate, endDate };
}

/**
 * GET /api/dashboard/summary
 * Main dashboard summary - sales and labor overview
 */
router.get('/summary', (req, res) => {
        try {
                    const { period = 'today', restaurant_id } = req.query;
                    const { startDate, endDate } = getDateRange(period);
                    const restaurantIdInt = restaurant_id ? parseInt(restaurant_id) : null;

            // Get sales and labor data
            const salesData = DailySales.getConsolidatedByDateRange(startDate, endDate);
                    const laborData = DailyLabor.getLaborWithSales(startDate, endDate, restaurantIdInt);
                    const weekOverWeek = DailySales.getWeekOverWeek(restaurantIdInt);
                    const restaurantComparison = DailySales.getComparisonByRestaurant(startDate, endDate);

            // Calculate totals
            const totalSales = salesData.reduce((sum, d) => sum + (d.net_sales || 0), 0);
                    const totalLabor = laborData.reduce((sum, d) => sum + (d.labor_cost || 0), 0);
                    const laborPercent = totalSales > 0 ? (totalLabor / totalSales) * 100 : 0;

            // Build summary response
            const summary = {
                            period: {
                                                label: period,
                                                startDate,
                                                endDate
                            },
                            kpis: {
                                                netSales: {
                                                                        value: totalSales,
                                                                        change: weekOverWeek?.sales_change_pct || 0,
                                                                        label: 'Net Sales'
                                                },
                                                laborCost: {
                                                                        value: totalLabor,
                                                                        percent: laborPercent,
                                                                        target: 20,
                                                                        label: 'Labor Cost'
                                                }
                            },
                            restaurants: restaurantComparison,
                            trends: {
                                                salesVsPrior: weekOverWeek
                            }
            };

            res.json(summary);
        } catch (error) {
                    console.error('Dashboard summary error:', error);
                    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
        }
});

/**
 * GET /api/dashboard/sales
 * Sales breakdown by restaurant and date
 */
router.get('/sales', (req, res) => {
        try {
                    const { period = 'today', restaurant_id } = req.query;
                    const { startDate, endDate } = getDateRange(period);

            let salesData;
                    if (restaurant_id) {
                                    salesData = DailySales.getByDateRange(parseInt(restaurant_id), startDate, endDate);
                    } else {
                                    salesData = DailySales.getConsolidatedByDateRange(startDate, endDate);
                    }

            const comparison = DailySales.getComparisonByRestaurant(startDate, endDate);

            res.json({
                            period: { startDate, endDate },
                            daily: salesData,
                            byRestaurant: comparison
            });
        } catch (error) {
                    console.error('Sales data error:', error);
                    res.status(500).json({ error: 'Failed to fetch sales data' });
        }
});

/**
 * GET /api/dashboard/labor
 * Labor analysis with sales context
 */
router.get('/labor', (req, res) => {
        try {
                    const { period = 'today', restaurant_id } = req.query;
                    const { startDate, endDate } = getDateRange(period);

            const laborWithSales = DailyLabor.getLaborWithSales(
                            startDate,
                            endDate,
                            restaurant_id ? parseInt(restaurant_id) : null
                        );
                    const comparison = DailyLabor.getComparisonByRestaurant(startDate, endDate);
                    const overtimeAlerts = DailyLabor.getOvertimeAlerts(startDate, endDate, 0);

            res.json({
                            period: { startDate, endDate },
                            daily: laborWithSales,
                            byRestaurant: comparison,
                            alerts: {
                                                overtime: overtimeAlerts
                            }
            });
        } catch (error) {
                    console.error('Labor data error:', error);
                    res.status(500).json({ error: 'Failed to fetch labor data' });
        }
});

/**
 * GET /api/dashboard/restaurants
 * List all restaurants
 */
router.get('/restaurants', (req, res) => {
        try {
                    const restaurants = Restaurant.getAll();
                    res.json(restaurants);
        } catch (error) {
                    console.error('Restaurants error:', error);
                    res.status(500).json({ error: 'Failed to fetch restaurants' });
        }
});

/**
 * GET /api/dashboard/restaurant/:id
 * Single restaurant detail view
 */
router.get('/restaurant/:id', (req, res) => {
        try {
                    const { id } = req.params;
                    const { period = 'today' } = req.query;
                    const { startDate, endDate } = getDateRange(period);

            const restaurant = Restaurant.getById(parseInt(id));
                    if (!restaurant) {
                                    return res.status(404).json({ error: 'Restaurant not found' });
                    }

            const sales = DailySales.getByDateRange(parseInt(id), startDate, endDate);
                    const labor = DailyLabor.getByDateRange(parseInt(id), startDate, endDate);

            res.json({
                            restaurant,
                            period: { startDate, endDate },
                            sales,
                            labor
            });
        } catch (error) {
                    console.error('Restaurant detail error:', error);
                    res.status(500).json({ error: 'Failed to fetch restaurant data' });
        }
});

/**
 * GET /api/dashboard/daily-comparison
 * Daily sales with prior year same-day comparison
 */
router.get('/daily-comparison', (req, res) => {
        try {
                    const { date, restaurant_id } = req.query;
                    const targetDate = date || format(subDays(new Date(), 1), 'yyyy-MM-dd');

            const comparison = DailySales.getPriorYearComparison(
                            targetDate,
                            restaurant_id ? parseInt(restaurant_id) : null
                        );

            res.json({
                            date: targetDate,
                            comparison
            });
        } catch (error) {
                    console.error('Daily comparison error:', error);
                    res.status(500).json({ error: 'Failed to fetch daily comparison' });
        }
});

/**
 * GET /api/dashboard/wtd-comparison
 * Week-to-date sales with prior year comparison
 */
router.get('/wtd-comparison', (req, res) => {
        try {
                    const { restaurant_id } = req.query;

            const comparison = DailySales.getWTDWithPriorYear(
                            restaurant_id ? parseInt(restaurant_id) : null
                        );

            res.json({
                            period: 'week-to-date',
                            comparison
            });
        } catch (error) {
                    console.error('WTD comparison error:', error);
                    res.status(500).json({ error: 'Failed to fetch WTD comparison' });
        }
});

/**
 * GET /api/dashboard/sales-breakdown
 * Detailed sales breakdown by category (food, liquor, beer, wine, etc.)
 */
router.get('/sales-breakdown', (req, res) => {
        try {
                    const { period = 'today', restaurant_id } = req.query;
                    const { startDate, endDate } = getDateRange(period);

            const db = getDb();
                    const whereClause = restaurant_id ? 'AND ds.restaurant_id = ?' : '';
                    const params = restaurant_id
                        ? [startDate, endDate, parseInt(restaurant_id)]
                                    : [startDate, endDate];

            const breakdown = db.prepare(`
                        SELECT
                                        r.short_name as restaurant,
                                                        SUM(ds.food_sales) as food_sales,
                                                                        SUM(ds.liquor_sales) as liquor_sales,
                                                                                        SUM(ds.beer_sales) as beer_sales,
                                                                                                        SUM(ds.wine_sales) as wine_sales,
                                                                                                                        SUM(ds.gift_card_sold) as gift_card_sold,
                                                                                                                                        SUM(ds.retail_sales) as retail_sales,
                                                                                                                                                        SUM(ds.net_sales) as total_sales,
                                                                                                                                                                        ROUND(SUM(ds.food_sales) / NULLIF(SUM(ds.net_sales), 0) * 100, 2) as food_pct,
                                                                                                                                                                                        ROUND(SUM(ds.liquor_sales) / NULLIF(SUM(ds.net_sales), 0) * 100, 2) as liquor_pct,
                                                                                                                                                                                                        ROUND(SUM(ds.beer_sales) / NULLIF(SUM(ds.net_sales), 0) * 100, 2) as beer_pct,
                                                                                                                                                                                                                        ROUND(SUM(ds.wine_sales) / NULLIF(SUM(ds.net_sales), 0) * 100, 2) as wine_pct
                                                                                                                                                                                                                                    FROM daily_sales ds
                                                                                                                                                                                                                                                JOIN restaurants r ON ds.restaurant_id = r.id
                                                                                                                                                                                                                                                            WHERE ds.business_date BETWEEN ? AND ?
                                                                                                                                                                                                                                                                        AND r.is_active = 1
                                                                                                                                                                                                                                                                                    ${whereClause}
                                                                                                                                                                                                                                                                                                GROUP BY ds.restaurant_id
                                                                                                                                                                                                                                                                                                            ORDER BY total_sales DESC
                                                                                                                                                                                                                                                                                                                    `).all(...params);

            res.json({
                            period: { startDate, endDate },
                            breakdown
            });
        } catch (error) {
                    console.error('Sales breakdown error:', error);
                    res.status(500).json({ error: 'Failed to fetch sales breakdown' });
        }
});

export default router;
