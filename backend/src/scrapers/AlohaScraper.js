import puppeteer from 'puppeteer';
import { format, subDays, subYears } from 'date-fns';
import { DailySales } from '../models/DailySales.js';
import { DailyLabor } from '../models/DailyLabor.js';
import { Restaurant } from '../models/Restaurant.js';
import { getDb } from '../database/db.js';

/**
 * Aloha Enterprise Online Scraper
 *
 * Scrapes daily sales and labor data from the Aloha Drilldown Viewer.
 * Login URL: https://lahaciendaranch.alohaenterprise.com/login.do
 *
 * Store IDs (discovered 1/24/2026):
 * - Arlington: 2614
 * - Colleyville: 5250
 * - Frisco: 4110
 * - Preston Trail: 17390
 * - Skillman: 6300
 *
 * Available data categories:
 * - Category Sales: All Food, Liquor, Beer, Wine, G.C.'s, Retail
 * - Labor: Hours, Pay, Labor %
 * - Guest Count, Check Count
 */
export class AlohaScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.baseUrl = process.env.ALOHA_URL || 'https://lahaciendaranch.alohaenterprise.com';
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
        this.page.setDefaultTimeout(30000);
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async login() {
        console.log('Logging into Aloha Enterprise...');

        const loginUrl = this.baseUrl.replace(/\/$/, '') + '/login.do';
        await this.page.goto(loginUrl, { waitUntil: 'networkidle2' });

        // Wait for login form
        await this.page.waitForSelector('input[placeholder="User Name"], input[type="text"]');

        // Enter credentials
        await this.page.type('input[placeholder="User Name"], input[type="text"]', this.username);
        await this.page.type('input[placeholder="Password"], input[type="password"]', this.password);

        // Click login button
        await this.page.click('button[type="submit"]');

        // Wait for navigation to portal
        await this.page.waitForNavigation({ waitUntil: 'networkidle2' });

        // Handle popup if it appears
        try {
            await this.page.waitForSelector('button.close, .modal-close, [data-dismiss="modal"]', { timeout: 3000 });
            const closeButton = await this.page.$('button.close, .modal-close, [data-dismiss="modal"]');
            if (closeButton) await closeButton.click();
        } catch (e) {
            // No popup
        }

        console.log('Logged into Aloha');
    }

    async navigateToDrilldownViewer(date) {
        console.log('Navigating to Drilldown Viewer for ' + date + '...');

        const drilldownUrl = this.baseUrl.replace(/\/$/, '') + '/insight/drilldownViewer.jsp';
        await this.page.goto(drilldownUrl, { waitUntil: 'networkidle2' });

        await this.page.waitForSelector('input[type="text"]', { timeout: 15000 });

        const formattedDate = format(new Date(date), 'M/d/yyyy');

        const dateInputs = await this.page.$$('input[type="text"]');
        if (dateInputs.length >= 2) {
            await dateInputs[0].click({ clickCount: 3 });
            await dateInputs[0].type(formattedDate);

            await dateInputs[1].click({ clickCount: 3 });
            await dateInputs[1].type(formattedDate);
        }

        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(2000);

        console.log('Drilldown Viewer loaded');
    }

    async extractStoreData(storeName) {
        console.log('Extracting data for ' + storeName + '...');

        try {
            await this.page.click('a:has-text("' + storeName + '")');
            await this.page.waitForTimeout(2000);
        } catch (e) {
            console.log('Store ' + storeName + ' not found in list');
            return null;
        }

        const salesData = await this.page.evaluate(() => {
            const data = {
                net_sales: 0,
                food_sales: 0,
                liquor_sales: 0,
                beer_sales: 0,
                wine_sales: 0,
                gift_card_sold: 0,
                retail_sales: 0,
                guest_count: 0,
                check_count: 0,
                total_hours: 0,
                total_labor_cost: 0,
                labor_percent: 0
            };

            const tables = document.querySelectorAll('table');
            for (const table of tables) {
                const rows = table.querySelectorAll('tr');
                for (const row of rows) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 2) {
                        const category = cells[0].textContent.trim().toLowerCase();

                        let salesValue = 0;
                        for (let i = 1; i < cells.length; i++) {
                            const cellText = cells[i].textContent.trim();
                            if (cellText.includes('$') || parseFloat(cellText.replace(/[\$,]/g, '')) > 100) {
                                salesValue = parseFloat(cellText.replace(/[\$,]/g, '')) || 0;
                                break;
                            }
                        }

                        if (category.includes('all food') || category === 'food') {
                            data.food_sales = salesValue;
                        } else if (category === 'liquor') {
                            data.liquor_sales = salesValue;
                        } else if (category === 'beer') {
                            data.beer_sales = salesValue;
                        } else if (category === 'wine') {
                            data.wine_sales = salesValue;
                        } else if (category.includes('g.c') || category.includes('gift')) {
                            data.gift_card_sold = salesValue;
                        } else if (category === 'retail') {
                            data.retail_sales = salesValue;
                        }
                    }
                }
            }

            data.net_sales = data.food_sales + data.liquor_sales + data.beer_sales +
                            data.wine_sales + data.gift_card_sold + data.retail_sales;
            data.alcohol_sales = data.liquor_sales + data.beer_sales + data.wine_sales;
            data.beverage_sales = data.beer_sales + data.wine_sales;

            return data;
        });

        try {
            await this.page.click('text=Labor');
            await this.page.waitForTimeout(1500);

            const laborData = await this.page.evaluate(() => {
                const data = { total_hours: 0, total_labor_cost: 0, labor_percent: 0 };
                const text = document.body.innerText;

                const hoursMatch = text.match(/Hours[:\s]+(\d+\.?\d*)/i);
                if (hoursMatch) data.total_hours = parseFloat(hoursMatch[1]);

                const payMatch = text.match(/Pay[:\s]+\$?([\d,]+\.?\d*)/i);
                if (payMatch) data.total_labor_cost = parseFloat(payMatch[1].replace(/,/g, ''));

                const laborPctMatch = text.match(/Labor\s*%[:\s]+(\d+\.?\d*)/i);
                if (laborPctMatch) data.labor_percent = parseFloat(laborPctMatch[1]);

                return data;
            });

            Object.assign(salesData, laborData);
        } catch (e) {
            console.log('Could not extract labor data');
        }

        try {
            await this.page.click('text=< Back');
            await this.page.waitForTimeout(1000);
        } catch (e) {
            // Navigate back
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
            await this.navigateToDrilldownViewer(date);

            for (const restaurant of restaurants) {
                if (!restaurant.aloha_store_id) {
                    console.log('Skipping ' + restaurant.name + ' - no Aloha store ID configured');
                    continue;
                }

                console.log('Processing: ' + restaurant.name);

                try {
                    const storeName = restaurant.short_name || restaurant.name.split(' ').pop();
                    const salesData = await this.extractStoreData(storeName);

                    if (salesData) {
                        DailySales.upsert({
                            restaurant_id: restaurant.id,
                            business_date: date,
                            net_sales: salesData.net_sales,
                            gross_sales: salesData.net_sales,
                            food_sales: salesData.food_sales,
                            liquor_sales: salesData.liquor_sales,
                            beer_sales: salesData.beer_sales,
                            wine_sales: salesData.wine_sales,
                            gift_card_sold: salesData.gift_card_sold,
                            retail_sales: salesData.retail_sales,
                            alcohol_sales: salesData.alcohol_sales,
                            beverage_sales: salesData.beverage_sales,
                            guest_count: salesData.guest_count,
                            check_count: salesData.check_count,
                            data_source: 'aloha'
                        });

                        if (salesData.total_hours > 0 || salesData.total_labor_cost > 0) {
                            DailyLabor.upsert({
                                restaurant_id: restaurant.id,
                                business_date: date,
                                total_hours: salesData.total_hours,
                                total_labor_cost: salesData.total_labor_cost,
                                labor_percent: salesData.labor_percent,
                                data_source: 'aloha'
                            });
                        }

                        results.push({
                            restaurant: restaurant.name,
                            date,
                            status: 'success',
                            data: salesData
                        });

                        console.log(restaurant.name + ': Net Sales $' + (salesData.net_sales ? salesData.net_sales.toFixed(2) : 'N/A'));
                    }

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

        db.prepare(
            'INSERT INTO scrape_log (scrape_type, business_date, status, records_processed, error_message, completed_at, duration_seconds) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)'
        ).run(
            type,
            date,
            failed > 0 ? 'partial' : 'success',
            successful,
            failed > 0 ? failed + ' stores failed' : null
        );
    }
}

export default AlohaScraper;
