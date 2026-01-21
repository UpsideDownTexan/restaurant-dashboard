import express from 'express';
import { format, subDays, startOfWeek, startOfMonth, startOfYear } from 'date-fns';
import { Restaurant } from '../models/Restaurant.js';
import { DailySales } from '../models/DailySales.js';
import { DailyLabor } from '../models/DailyLabor.js';
import { PrimeCost } from '../models/PrimeCost.js';

const router = express.Router();

/**
 * Helper to get date range from period string
 */
function getDateRange(period) {
    const today = new Date();
    const endDate = format(today, 'yyyy-MM-dd');
    let startDate;

    switch (period) {
        case '1d':
            startDate = endDate;
            break;
        case '7d':
            startDate = format(subDays(today, 6), 'yyyy-MM-dd');
            break;
        case '14d':
            startDate = format(subDays(today, 13), 'yyyy-MM-dd');
            break;
        case '30d':
            startDate = format(subDays(today, 29), 'yyyy-MM-dd');
            break;
        case 'wtd': // Week to date
            startDate = format(startOfWeek(today), 'yyyy-MM-dd');
            break;
        case 'mtd': // Month to date
            startDate = format(startOfMonth(today), 'yyyy-MM-dd');
            break;
        case 'ytd': // Year to date
            startDate = format(startOfYear(today), 'yyyy-MM-dd');
            break;
        default:
            startDate = format(subDays(today, 6), 'yyyy-MM-dd');
    }

    return { startDate, endDate };
}

/**
 * GET /api/dashboard/summary
 * Main dashboard summary - mimics MarginEdge/R365 overview
 */
router.get('/summary', (req, res) => {
    try {
        const { period = '7d', restaurant_id } = req.query;
        const { startDate, endDate } = getDateRange(period);

        // Get all component data
        const primeCostSummary = PrimeCost.getConsolidatedSummary(startDate, endDate);
        const weekOverWeek = DailySales.getWeekOverWeek(restaurant_id ? parseInt(restaurant_id) : null);
        const restaurantComparison = PrimeCost.getComparisonByRestaurant(startDate, endDate);

        // Build summary response
        const summary = {
            period: {
                label: period,
                startDate,
                endDate
            },
            kpis: {
                netSales: {
                    value: primeCostSummary?.total_sales || 0,
                    change: weekOverWeek?.sales_change_pct || 0,
                    label: 'Net Sales'
                },
                primeCost: {
                    value: primeCostSummary?.total_prime_cost || 0,
                    percent: primeCostSummary?.prime_cost_percent || 0,
                    target: 65,
                    label: 'Prime Cost'
                },
                laborCost: {
                    value: primeCostSummary?.total_labor || 0,
                    percent: primeCostSummary?.labor_percent || 0,
                    target: 30,
                    label: 'Labor Cost'
                },
                foodCost: {
                    value: primeCostSummary?.total_cogs || 0,
                    percent: primeCostSummary?.cogs_percent || 0,
                    target: 30,
                    label: 'Food Cost (COGS)'
                },
                grossProfit: {
                    value: primeCostSummary?.gross_profit || 0,
                    percent: primeCostSummary?.gross_profit_percent || 0,
                    label: 'Gross Profit'
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
        const { period = '7d', restaurant_id } = req.query;
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
        const { period = '7d', restaurant_id } = req.query;
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
 * GET /api/dashboard/prime-cost
 * Prime cost analysis
 */
router.get('/prime-cost', (req, res) => {
    try {
        const { period = '7d', restaurant_id } = req.query;
        const { startDate, endDate } = getDateRange(period);

        const summary = PrimeCost.getConsolidatedSummary(startDate, endDate);
        const trend = PrimeCost.getDailyTrend(
            startDate,
            endDate,
            restaurant_id ? parseInt(restaurant_id) : null
        );
        const comparison = PrimeCost.getComparisonByRestaurant(startDate, endDate);
        const alerts = PrimeCost.getAlerts(startDate, endDate, 65);

        res.json({
            period: { startDate, endDate },
            summary,
            trend,
            byRestaurant: comparison,
            alerts
        });
    } catch (error) {
        console.error('Prime cost error:', error);
        res.status(500).json({ error: 'Failed to fetch prime cost data' });
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
        const { period = '7d' } = req.query;
        const { startDate, endDate } = getDateRange(period);

        const restaurant = Restaurant.getById(parseInt(id));
        if (!restaurant) {
            return res.status(404).json({ error: 'Restaurant not found' });
        }

        const sales = DailySales.getByDateRange(parseInt(id), startDate, endDate);
        const labor = DailyLabor.getByDateRange(parseInt(id), startDate, endDate);
        const primeCost = PrimeCost.getByDateRange(startDate, endDate, parseInt(id));

        res.json({
            restaurant,
            period: { startDate, endDate },
            sales,
            labor,
            primeCost
        });
    } catch (error) {
        console.error('Restaurant detail error:', error);
        res.status(500).json({ error: 'Failed to fetch restaurant data' });
    }
});

export default router;
