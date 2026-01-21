import { initDb } from './db.js';
import { format, subDays } from 'date-fns';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../database/restaurant_dashboard.db');

async function seedDemo() {
    // Initialize database
    const db = await initDb();

    // Read and execute schema first
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
            }
        }
    }

    console.log('🌱 Seeding demo data...\n');

    // Restaurant configurations with realistic baseline metrics
    const restaurantConfigs = [
        { id: 1, name: "Mariano's Arlington", avgSales: 18000, laborTarget: 28, cogsTarget: 30 },
        { id: 2, name: "Mariano's Dallas", avgSales: 22000, laborTarget: 27, cogsTarget: 29 },
        { id: 3, name: "La Hacienda Ranch Frisco", avgSales: 25000, laborTarget: 29, cogsTarget: 31 },
        { id: 4, name: "La Hacienda Ranch Plano", avgSales: 20000, laborTarget: 30, cogsTarget: 32 },
        { id: 5, name: "La Hacienda Ranch Colleyville", avgSales: 16000, laborTarget: 31, cogsTarget: 30 },
    ];

    // Seed the restaurants
    const restaurants = [
        [1, "Mariano's Arlington", "MAR-ARL", "Marianos", "Arlington", "store_001", "loc_001"],
        [2, "Mariano's Dallas", "MAR-DAL", "Marianos", "Dallas", "store_002", "loc_002"],
        [3, "La Hacienda Ranch Frisco", "LHR-FRI", "La Hacienda Ranch", "Frisco", "store_003", "loc_003"],
        [4, "La Hacienda Ranch Plano", "LHR-PLA", "La Hacienda Ranch", "Plano", "store_004", "loc_004"],
        [5, "La Hacienda Ranch Colleyville", "LHR-COL", "La Hacienda Ranch", "Colleyville", "store_005", "loc_005"],
    ];

    for (const r of restaurants) {
        db.prepare(`
            INSERT OR REPLACE INTO restaurants (id, name, short_name, brand, city, state, aloha_store_id, netchex_location_id, is_active)
            VALUES (?, ?, ?, ?, ?, 'TX', ?, ?, 1)
        `).run(...r);
    }
    console.log('✅ Restaurants seeded');

    // Helper functions
    function randomVariation(base, variationPercent = 15) {
        const variation = base * (variationPercent / 100);
        return base + (Math.random() - 0.5) * 2 * variation;
    }

    function getDayOfWeekMultiplier(date) {
        const day = date.getDay();
        if (day === 5) return 1.3;  // Friday
        if (day === 6) return 1.4;  // Saturday
        if (day === 0) return 1.1;  // Sunday
        return 1.0;
    }

    // Generate data for the last 60 days
    const today = new Date();

    console.log('📊 Generating 60 days of demo data for 5 restaurants...\n');

    for (let dayOffset = 60; dayOffset >= 0; dayOffset--) {
        const date = subDays(today, dayOffset);
        const dateStr = format(date, 'yyyy-MM-dd');
        const dayMultiplier = getDayOfWeekMultiplier(date);

        for (const config of restaurantConfigs) {
            // Generate sales data
            const baseSales = config.avgSales * dayMultiplier;
            const netSales = Math.round(randomVariation(baseSales, 20));
            const grossSales = Math.round(netSales * 1.05);
            const comps = Math.round(netSales * randomVariation(0.02, 50));
            const discounts = Math.round(netSales * randomVariation(0.03, 40));

            const avgCheckBase = config.avgSales > 20000 ? 45 : 35;
            const avgCheck = randomVariation(avgCheckBase, 10);
            const checkCount = Math.round(netSales / avgCheck);
            const guestCount = Math.round(checkCount * randomVariation(2.2, 15));
            const avgGuestSpend = netSales / guestCount;

            const foodPct = randomVariation(0.65, 10);
            const bevPct = randomVariation(0.20, 15);
            const alcPct = 1 - foodPct - bevPct;
            const foodSales = Math.round(netSales * foodPct);
            const beverageSales = Math.round(netSales * bevPct);
            const alcoholSales = Math.round(netSales * alcPct);

            db.prepare(`
                INSERT OR REPLACE INTO daily_sales (
                    restaurant_id, business_date, gross_sales, net_sales, comps, discounts,
                    guest_count, check_count, avg_check, avg_guest_spend,
                    food_sales, beverage_sales, alcohol_sales, data_source
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo')
            `).run(
                config.id, dateStr, grossSales, netSales, comps, discounts,
                guestCount, checkCount, avgCheck.toFixed(2), avgGuestSpend.toFixed(2),
                foodSales, beverageSales, alcoholSales
            );

            // Generate labor data
            const laborPercent = randomVariation(config.laborTarget, 12);
            const totalLaborCost = Math.round(netSales * (laborPercent / 100));
            const avgHourlyRate = randomVariation(16, 15);
            const totalHours = totalLaborCost / avgHourlyRate;
            const overtimeHours = Math.max(0, randomVariation(totalHours * 0.05, 100));
            const regularHours = totalHours - overtimeHours;
            const regularWages = Math.round(regularHours * avgHourlyRate);
            const overtimeWages = Math.round(overtimeHours * avgHourlyRate * 1.5);

            const fohRatio = randomVariation(0.55, 10);
            const fohHours = totalHours * fohRatio;
            const fohCost = totalLaborCost * fohRatio;
            const bohHours = totalHours * (1 - fohRatio);
            const bohCost = totalLaborCost * (1 - fohRatio);
            const laborBurden = totalLaborCost * 1.22;
            const employeeCount = Math.round(totalHours / 6);

            db.prepare(`
                INSERT OR REPLACE INTO daily_labor (
                    restaurant_id, business_date, total_hours, regular_hours, overtime_hours,
                    total_labor_cost, regular_wages, overtime_wages,
                    foh_hours, foh_cost, boh_hours, boh_cost,
                    total_labor_burden, employee_count, data_source
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo')
            `).run(
                config.id, dateStr, totalHours.toFixed(2), regularHours.toFixed(2), overtimeHours.toFixed(2),
                totalLaborCost, regularWages, overtimeWages,
                fohHours.toFixed(2), Math.round(fohCost), bohHours.toFixed(2), Math.round(bohCost),
                Math.round(laborBurden), employeeCount
            );

            // Generate food cost (COGS) data
            const cogsPercent = randomVariation(config.cogsTarget, 10);
            const totalCogs = Math.round(netSales * (cogsPercent / 100));
            const foodCost = Math.round(totalCogs * 0.75);
            const beverageCost = Math.round(totalCogs * 0.15);
            const alcoholCost = Math.round(totalCogs * 0.10);

            db.prepare(`
                INSERT OR REPLACE INTO daily_food_cost (
                    restaurant_id, business_date, food_cost, beverage_cost, alcohol_cost,
                    total_cogs, data_source
                ) VALUES (?, ?, ?, ?, ?, ?, 'demo')
            `).run(config.id, dateStr, foodCost, beverageCost, alcoholCost, totalCogs);

            // Calculate and store prime cost
            const primeCost = totalCogs + totalLaborCost;
            const primeCostPercent = (primeCost / netSales) * 100;
            const variancePercent = primeCostPercent - 65;
            const varianceDollars = (variancePercent / 100) * netSales;
            const grossProfit = netSales - primeCost;
            const grossProfitPercent = (grossProfit / netSales) * 100;

            db.prepare(`
                INSERT OR REPLACE INTO daily_prime_cost (
                    restaurant_id, business_date, net_sales, total_cogs, total_labor, prime_cost,
                    cogs_percent, labor_percent, prime_cost_percent,
                    target_prime_cost_percent, variance_percent, variance_dollars,
                    gross_profit, gross_profit_percent
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 65, ?, ?, ?, ?)
            `).run(
                config.id, dateStr, netSales, totalCogs, totalLaborCost, primeCost,
                cogsPercent.toFixed(2), laborPercent.toFixed(2), primeCostPercent.toFixed(2),
                variancePercent.toFixed(2), Math.round(varianceDollars),
                grossProfit, grossProfitPercent.toFixed(2)
            );
        }

        if (dayOffset % 10 === 0) {
            console.log(`  Generated data for ${dateStr}`);
        }
    }

    console.log('\n✅ Demo data seeded successfully!');
    console.log(`📍 Database location: ${DB_PATH}`);

    // Summary stats
    const stats = db.prepare(`
        SELECT
            COUNT(DISTINCT business_date) as days,
            COUNT(*) as total_records,
            SUM(net_sales) as total_sales
        FROM daily_sales
    `).get();

    console.log(`\n📊 Summary:`);
    console.log(`   Days of data: ${stats.days}`);
    console.log(`   Total records: ${stats.total_records}`);
    console.log(`   Total sales: $${(stats.total_sales / 1000000).toFixed(2)}M`);
}

seedDemo().catch(console.error);
