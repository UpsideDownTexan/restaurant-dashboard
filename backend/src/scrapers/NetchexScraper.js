import puppeteer from 'puppeteer';
import { format, subDays } from 'date-fns';
import { DailyLabor } from '../models/DailyLabor.js';
import { Restaurant } from '../models/Restaurant.js';
import { getDb } from '../database/db.js';

/**
 * NetChex Payroll Scraper
 *
 * NOTE: This is a template scraper. You will need to customize the selectors
 * and navigation flow based on your actual NetChex interface.
 * The exact selectors will depend on your NetChex configuration.
 */
export class NetchexScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.baseUrl = process.env.NETCHEX_URL || 'https://www.netchexonline.com';
        this.username = process.env.NETCHEX_USERNAME;
        this.password = process.env.NETCHEX_PASSWORD;
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
        this.page.setDefaultTimeout(30000);
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async login() {
        console.log('🔐 Logging into NetChex...');

        await this.page.goto(this.baseUrl, { waitUntil: 'networkidle2' });

        // Wait for login form
        // NOTE: Update these selectors based on your actual NetChex login page
        await this.page.waitForSelector('input[name="username"], input[type="email"], #username, #txtUserName');

        // Enter credentials
        await this.page.type('input[name="username"], #txtUserName, #username', this.username);
        await this.page.type('input[name="password"], #txtPassword, #password', this.password);

        // Click login button
        await this.page.click('button[type="submit"], input[type="submit"], #btnLogin, .login-button');

        // Wait for navigation
        await this.page.waitForNavigation({ waitUntil: 'networkidle2' });

        console.log('✅ Logged into NetChex');
    }

    async navigateToLaborReports() {
        console.log('📊 Navigating to labor reports...');

        // NOTE: Update navigation based on your NetChex menu structure
        // Common navigation patterns:

        // Look for Reports menu
        await this.page.waitForSelector('[data-menu="reports"], .reports-menu, #reportsLink, a[href*="reports"]');
        await this.page.click('[data-menu="reports"], .reports-menu, #reportsLink, a[href*="reports"]');

        await this.page.waitForTimeout(2000);

        // Navigate to labor/time reports
        const laborReportLink = await this.page.$('a[href*="labor"], a[href*="time"], .labor-reports-link');
        if (laborReportLink) {
            await laborReportLink.click();
            await this.page.waitForTimeout(2000);
        }
    }

    async selectDateRange(date) {
        console.log(`📅 Selecting date: ${date}`);

        // NOTE: Update date picker selectors based on your NetChex interface
        const dateInput = await this.page.$('input[type="date"], #reportDate, .date-picker, #txtDate');
        if (dateInput) {
            await dateInput.click({ clickCount: 3 });
            await dateInput.type(date);
        }
    }

    async selectLocation(locationId) {
        console.log(`🏪 Selecting location: ${locationId}`);

        // NOTE: Update location selector based on your NetChex interface
        const locationDropdown = await this.page.$('select#location, select[name="location"], .location-selector, #ddlLocation');
        if (locationDropdown) {
            await this.page.select('select#location, select[name="location"], .location-selector, #ddlLocation', locationId);
        }
    }

    async runReport() {
        // Click run/generate report button
        const runButton = await this.page.$('button#runReport, .run-report-btn, input[value="Run"], #btnRunReport');
        if (runButton) {
            await runButton.click();
            await this.page.waitForTimeout(5000); // Wait for report to generate
        }
    }

    async extractLaborReport() {
        console.log('👷 Extracting labor data...');

        // NOTE: These selectors are examples - customize based on your report layout
        const laborData = await this.page.evaluate(() => {
            const getText = (selector) => {
                const el = document.querySelector(selector);
                return el ? parseFloat(el.textContent.replace(/[$,]/g, '')) || 0 : 0;
            };

            const getHours = (selector) => {
                const el = document.querySelector(selector);
                if (!el) return 0;
                const text = el.textContent;
                // Handle HH:MM format
                if (text.includes(':')) {
                    const [hours, mins] = text.split(':').map(Number);
                    return hours + (mins / 60);
                }
                return parseFloat(text) || 0;
            };

            return {
                // Update these selectors based on your actual NetChex report structure
                total_hours: getHours('.total-hours, [data-field="totalHours"], #totalHours'),
                regular_hours: getHours('.regular-hours, [data-field="regularHours"], #regHours'),
                overtime_hours: getHours('.overtime-hours, [data-field="overtimeHours"], #otHours'),

                total_labor_cost: getText('.total-wages, [data-field="totalWages"], #totalWages'),
                regular_wages: getText('.regular-wages, [data-field="regularWages"], #regWages'),
                overtime_wages: getText('.overtime-wages, [data-field="overtimeWages"], #otWages'),

                // Department breakdowns (if available)
                foh_hours: getHours('.foh-hours, [data-dept="FOH"] .hours'),
                foh_cost: getText('.foh-cost, [data-dept="FOH"] .wages'),
                boh_hours: getHours('.boh-hours, [data-dept="BOH"] .hours'),
                boh_cost: getText('.boh-cost, [data-dept="BOH"] .wages'),
                management_hours: getHours('.mgmt-hours, [data-dept="MGT"] .hours'),
                management_cost: getText('.mgmt-cost, [data-dept="MGT"] .wages'),

                // Benefits/taxes (if shown)
                payroll_taxes: getText('.payroll-taxes, [data-field="taxes"], #taxes'),

                // Employee count
                employee_count: parseInt(document.querySelector('.employee-count, [data-field="empCount"]')?.textContent) || 0
            };
        });

        // Calculate loaded labor cost (labor + estimated burden)
        // Industry standard is ~20-25% burden on top of wages
        const burdenRate = 0.22;
        laborData.total_labor_burden = laborData.total_labor_cost * (1 + burdenRate);
        laborData.benefits_cost = laborData.total_labor_cost * burdenRate - (laborData.payroll_taxes || 0);

        return laborData;
    }

    async scrapeForDate(targetDate = null) {
        const date = targetDate || format(subDays(new Date(), 1), 'yyyy-MM-dd');
        const results = [];
        const restaurants = Restaurant.getAll();

        try {
            await this.init();
            await this.login();
            await this.navigateToLaborReports();

            for (const restaurant of restaurants) {
                if (!restaurant.netchex_location_id) {
                    console.log(`⚠️ Skipping ${restaurant.name} - no NetChex location ID configured`);
                    continue;
                }

                console.log(`\n📍 Processing: ${restaurant.name}`);

                try {
                    await this.selectLocation(restaurant.netchex_location_id);
                    await this.selectDateRange(date);
                    await this.runReport();

                    // Wait for report to load
                    await this.page.waitForTimeout(3000);

                    const laborData = await this.extractLaborReport();

                    // Save to database
                    DailyLabor.upsert({
                        restaurant_id: restaurant.id,
                        business_date: date,
                        ...laborData,
                        data_source: 'netchex'
                    });

                    results.push({
                        restaurant: restaurant.name,
                        date,
                        status: 'success',
                        data: laborData
                    });

                    console.log(`✅ ${restaurant.name}: Labor $${laborData.total_labor_cost.toFixed(2)} (${laborData.total_hours.toFixed(1)} hrs)`);

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
            this.logScrape('netchex', date, results);

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
            failed > 0 ? `${failed} locations failed` : null
        );
    }
}

export default NetchexScraper;
