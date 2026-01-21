import puppeteer from 'puppeteer';
import { format, subDays } from 'date-fns';
import { DailySales } from '../models/DailySales.js';
import { Restaurant } from '../models/Restaurant.js';
import { getDb } from '../database/db.js';

/**
 * Aloha Enterprise Online Scraper
 *
 * NOTE: This is a template scraper. You will need to customize the selectors
 * and navigation flow based on your actual Aloha Enterprise Online interface.
 * The exact selectors will depend on your Aloha version and configuration.
 */
export class AlohaScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.baseUrl = process.env.ALOHA_URL || 'https://enterprise.alohaenterprise.com';
        this.username = process.env.ALOHA_USERNAME;
        this.password = process.env.ALOHA_PASSWORD;
    }

    async init() {
        this.browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1920, height: 1080 });

        // Set reasonable timeout
        this.page.setDefaultTimeout(30000);
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async login() {
        console.log('🔐 Logging into Aloha Enterprise...');

        await this.page.goto(this.baseUrl, { waitUntil: 'networkidle2' });

        // Wait for login form
        // NOTE: Update these selectors based on your actual Aloha login page
        await this.page.waitForSelector('input[name="username"], input[type="email"], #username');

        // Enter credentials
        await this.page.type('input[name="username"], input[type="email"], #username', this.username);
        await this.page.type('input[name="password"], input[type="password"], #password', this.password);

        // Click login button
        await this.page.click('button[type="submit"], input[type="submit"], #loginButton');

        // Wait for navigation/dashboard
        await this.page.waitForNavigation({ waitUntil: 'networkidle2' });

        console.log('✅ Logged into Aloha');
    }

    async navigateToReports() {
        console.log('📊 Navigating to reports...');

        // NOTE: Update navigation based on your Aloha menu structure
        // This is a common pattern but may vary
        await this.page.waitForSelector('[data-menu="reports"], .reports-menu, #reportsLink');
        await this.page.click('[data-menu="reports"], .reports-menu, #reportsLink');

        await this.page.waitForTimeout(2000);
    }

    async selectDateRange(date) {
        console.log(`📅 Selecting date: ${date}`);

        // NOTE: Update date picker selectors based on your Aloha interface
        // Common patterns for date selection:

        // Option 1: Date input field
        const dateInput = await this.page.$('input[type="date"], #businessDate, .date-picker');
        if (dateInput) {
            await dateInput.click({ clickCount: 3 });
            await dateInput.type(date);
        }

        // Option 2: Calendar picker - would need custom handling
    }

    async selectStore(storeId) {
        console.log(`🏪 Selecting store: ${storeId}`);

        // NOTE: Update store selector based on your Aloha interface
        const storeDropdown = await this.page.$('select#store, select[name="location"], .store-selector');
        if (storeDropdown) {
            await this.page.select('select#store, select[name="location"], .store-selector', storeId);
        }
    }

    async extractDailySalesReport() {
        console.log('📈 Extracting sales data...');

        // NOTE: These selectors are examples - you'll need to inspect your
        // actual Aloha reports page to find the correct ones

        const salesData = await this.page.evaluate(() => {
            // Example extraction - customize based on your report layout
            const getText = (selector) => {
                const el = document.querySelector(selector);
                return el ? parseFloat(el.textContent.replace(/[$,]/g, '')) || 0 : 0;
            };

            return {
                // Update these selectors based on your actual Aloha report structure
                gross_sales: getText('.gross-sales, [data-field="grossSales"], #grossSales'),
                net_sales: getText('.net-sales, [data-field="netSales"], #netSales'),
                comps: getText('.comps, [data-field="comps"], #comps'),
                discounts: getText('.discounts, [data-field="discounts"], #discounts'),
                voids: getText('.voids, [data-field="voids"], #voids'),
                refunds: getText('.refunds, [data-field="refunds"], #refunds'),

                cash_sales: getText('.cash-sales, [data-field="cash"]'),
                credit_card_sales: getText('.credit-sales, [data-field="creditCard"]'),
                gift_card_sales: getText('.gift-card-sales, [data-field="giftCard"]'),

                guest_count: parseInt(document.querySelector('.guest-count, [data-field="guests"]')?.textContent) || 0,
                check_count: parseInt(document.querySelector('.check-count, [data-field="checks"]')?.textContent) || 0,

                food_sales: getText('.food-sales, [data-field="food"]'),
                beverage_sales: getText('.beverage-sales, [data-field="beverage"]'),
                alcohol_sales: getText('.alcohol-sales, [data-field="alcohol"]')
            };
        });

        // Calculate derived fields
        if (salesData.check_count > 0) {
            salesData.avg_check = salesData.net_sales / salesData.check_count;
        }
        if (salesData.guest_count > 0) {
            salesData.avg_guest_spend = salesData.net_sales / salesData.guest_count;
        }

        return salesData;
    }

    async scrapeForDate(targetDate = null) {
        const date = targetDate || format(subDays(new Date(), 1), 'yyyy-MM-dd');
        const results = [];
        const restaurants = Restaurant.getAll();

        try {
            await this.init();
            await this.login();
            await this.navigateToReports();

            for (const restaurant of restaurants) {
                if (!restaurant.aloha_store_id) {
                    console.log(`⚠️ Skipping ${restaurant.name} - no Aloha store ID configured`);
                    continue;
                }

                console.log(`\n📍 Processing: ${restaurant.name}`);

                try {
                    await this.selectStore(restaurant.aloha_store_id);
                    await this.selectDateRange(date);

                    // Wait for report to load
                    await this.page.waitForTimeout(3000);

                    const salesData = await this.extractDailySalesReport();

                    // Save to database
                    DailySales.upsert({
                        restaurant_id: restaurant.id,
                        business_date: date,
                        ...salesData,
                        data_source: 'aloha'
                    });

                    results.push({
                        restaurant: restaurant.name,
                        date,
                        status: 'success',
                        data: salesData
                    });

                    console.log(`✅ ${restaurant.name}: Net Sales $${salesData.net_sales.toFixed(2)}`);

                } catch (storeError) {
                    console.error(`❌ Error processing ${restaurant.name}:`, storeError.message);
                    results.push({
                        restaurant: restaurant.name,
                        date,
                        status: 'error',
                        error: storeError.message
                    });
                }
            }

            // Log the scrape
            this.logScrape('aloha', date, results);

        } finally {
            await this.close();
        }

        return results;
    }

    logScrape(type, date, results) {
        const db = getDb();
        const successful = results.filter(r => r.status === 'success').length;
        const failed = results.filter(r => r.status === 'error').length;

        db.prepare(`
            INSERT INTO scrape_log (
                scrape_type, business_date, status, records_processed, error_message, completed_at, duration_seconds
            ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)
        `).run(
            type,
            date,
            failed > 0 ? 'partial' : 'success',
            successful,
            failed > 0 ? `${failed} stores failed` : null
        );
    }
}

export default AlohaScraper;
