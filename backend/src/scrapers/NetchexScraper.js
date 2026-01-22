import puppeteer from 'puppeteer';
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns';
import { DailyLabor } from '../models/DailyLabor.js';
import { Restaurant } from '../models/Restaurant.js';
import { getDb } from '../database/db.js';

/**
 * NetChex Payroll Scraper
 *
 * Updated with correct selectors for NetChex Azure B2C authentication.
 * Login Portal: https://na3.netchexonline.net/n/login#/
 * Uses two-step authentication (username then password)
 * 
 * Company name format: "CAM - COMPANY NAME"
 * Example: "CAM - MARIANOS RESTAURANT ARLINGTON INC"
 */
export class NetchexScraper {
        constructor() {
                    this.browser = null;
                    this.page = null;
                    this.baseUrl = process.env.NETCHEX_URL || 'https://netchexonline.com';
                    this.loginPortalUrl = 'https://na3.netchexonline.net/n/login#/';
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
                console.log('Logging into NetChex...');

            // Navigate to login portal
            await this.page.goto(this.loginPortalUrl, { waitUntil: 'networkidle2' });

            // Step 1: Enter username
            await this.page.waitForSelector('input[type="text"], input[type="email"]');
                await this.page.type('input[type="text"], input[type="email"]', this.username);

            // Click continue/next button
            await this.page.click('button[type="submit"]');

            // Wait for password page (Azure B2C redirect)
            await this.page.waitForNavigation({ waitUntil: 'networkidle2' });

            // Step 2: Enter password
            await this.page.waitForSelector('input[type="password"]', { timeout: 10000 });
                await this.page.type('input[type="password"]', this.password);

            // Click sign in button
            await this.page.click('button[type="submit"]');

            // Wait for main app to load
            await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

            console.log('Logged into NetChex');
    }

    async navigateToLaborReport() {
                console.log('Navigating to Labor Distribution Summary...');

            const reportUrl = 'https://na3.netchexonline.net/n/Reports/Report/LaborDistributionSummary';
                await this.page.goto(reportUrl, { waitUntil: 'networkidle2' });

            // Wait for report page to load
            await this.page.waitForSelector('form, .report-container, [class*="report"]', { timeout: 15000 });

            console.log('Report page loaded');
    }

    async selectCompany(companyName) {
                console.log('Selecting company: ' + companyName);

            // Look for company dropdown
            const companySelect = await this.page.$('select[name="company"], select#company, [class*="company-select"]');
                if (companySelect) {
                                await this.page.select('select[name="company"], select#company', companyName);
                                await this.page.waitForTimeout(1000);
                }
    }

    async setDateRange(startDate, endDate) {
                console.log('Setting date range: ' + startDate + ' to ' + endDate);

            // Find date inputs
            const startInput = await this.page.$('input[name="startDate"], input#startDate, input[placeholder*="Start"]');
                const endInput = await this.page.$('input[name="endDate"], input#endDate, input[placeholder*="End"]');

            if (startInput && endInput) {
                            await startInput.click({ clickCount: 3 });
                            await startInput.type(startDate);
                            await endInput.click({ clickCount: 3 });
                            await endInput.type(endDate);
            }
    }

    async runReport() {
                console.log('Running report...');

            // Click run/generate report button
            const runButton = await this.page.$('button[type="submit"], button:has-text("Run"), button:has-text("Generate")');
                if (runButton) {
                                await runButton.click();
                                await this.page.waitForTimeout(3000);
                }
    }

    async extractLaborData() {
                console.log('Extracting labor data...');

            const data = await this.page.evaluate(() => {
                            const result = {
                                                total_hours: 0,
                                                total_wages: 0,
                                                regular_hours: 0,
                                                overtime_hours: 0
                            };

                                                              // Look for summary table or totals
                                                              const tables = document.querySelectorAll('table');
                            for (const table of tables) {
                                                const rows = table.querySelectorAll('tr');
                                                for (const row of rows) {
                                                                        const cells = row.querySelectorAll('td');
                                                                        const text = row.textContent.toLowerCase();

                                                    if (text.includes('total') || text.includes('hours') || text.includes('wages')) {
                                                                                cells.forEach((cell, i) => {
                                                                                                                const value = parseFloat(cell.textContent.replace(/[$,]/g, ''));
                                                                                                                if (!isNaN(value)) {
                                                                                                                                                    if (text.includes('regular') && text.includes('hour')) {
                                                                                                                                                                                            result.regular_hours = value;
                                                                                                                                                        } else if (text.includes('overtime') || text.includes('ot')) {
                                                                                                                                                                                            result.overtime_hours = value;
                                                                                                                                                        } else if (text.includes('total') && text.includes('hour')) {
                                                                                                                                                                                            result.total_hours = value;
                                                                                                                                                        } else if (text.includes('wage') || text.includes('pay')) {
                                                                                                                                                                                            result.total_wages = value;
                                                                                                                                                        }
                                                                                                                    }
                                                                                    });
                                                    }
                                                }
                            }

                                                              return result;
            });

            return data;
    }

    async scrapeForDate(targetDate = null) {
                const date = targetDate || format(subDays(new Date(), 1), 'yyyy-MM-dd');
                const results = [];
                const restaurants = Restaurant.getAll();

            try {
                            await this.init();
                            await this.login();
                            await this.navigateToLaborReport();

                    for (const restaurant of restaurants) {
                                        if (!restaurant.netchex_company_name) {
                                                                console.log('Skipping ' + restaurant.name + ' - no NetChex company configured');
                                                                continue;
                                        }

                                console.log('Processing: ' + restaurant.name);

                                try {
                                                        await this.selectCompany(restaurant.netchex_company_name);
                                                        await this.setDateRange(date, date);
                                                        await this.runReport();

                                            const laborData = await this.extractLaborData();

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

                                            console.log(restaurant.name + ': Total Hours ' + laborData.total_hours);

                                } catch (storeError) {
                                                        console.error('Error processing ' + restaurant.name + ':', storeError.message);
                                                        results.push({
                                                                                    restaurant: restaurant.name,
                                                                                    date,
                                                                                    status: 'error',
                                                                                    error: storeError.message
                                                        });
                                }
                    }

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

            db.prepare('INSERT INTO scrape_log (scrape_type, business_date, status, records_processed, error_message, completed_at, duration_seconds) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)').run(
                            type,
                            date,
                            failed > 0 ? 'partial' : 'success',
                            successful,
                            failed > 0 ? failed + ' stores failed' : null
                        );
    }
}

export default NetchexScraper;
