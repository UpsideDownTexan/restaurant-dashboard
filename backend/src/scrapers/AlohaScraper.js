import puppeteer from 'puppeteer';
import { format, subDays } from 'date-fns';
import { DailySales } from '../models/DailySales.js';
import { DailyLabor } from '../models/DailyLabor.js';
import { Restaurant } from '../models/Restaurant.js';
import { getDb } from '../database/db.js';


// Helper function to replace deprecated waitForTimeout
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
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
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1920, height: 1080 });
        this.page.setDefaultTimeout(60000);
    }

    async close() {
        if (this.browser) await this.browser.close();
    }

    async login() {
        console.log('Logging into Aloha Enterprise...');
        await this.page.goto(this.baseUrl + '/login.do', { waitUntil: 'networkidle2' });
        await this.page.waitForSelector('input[type="text"], input[name="username"]', { timeout: 15000 });
        await this.page.type('input[type="text"], input[name="username"]', this.username);
        await this.page.type('input[type="password"], input[name="password"]', this.password);
        await this.page.click('input[type="submit"], button[type="submit"], .btn-primary');
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        try {
            const noBtn = await this.page.$('button:has-text("No"), input[value="No"]');
            if (noBtn) await noBtn.click();
        } catch (e) {}
        console.log('Logged into Aloha');
    }

    async navigateToDashboard() {
        console.log('Navigating to Insight Dashboard...');
        await this.page.goto(this.baseUrl + '/insightdashboard/dashboard.jsp#/', { waitUntil: 'networkidle2', timeout: 60000 });
        await this.page.waitForSelector('li, [role="listitem"], table', { timeout: 30000 });
        await this.page.waitForTimeout(3000);
        await delay(3000);    }

    async extractDashboardData() {
        console.log('Extracting dashboard data...');
        const data = await this.page.evaluate(() => {
            const results = { stores: {}, totals: { net_sales: 0, labor_percent: 0, guest_count: 0 } };
            const tables = document.querySelectorAll('table');
            for (const table of tables) {
                const rows = table.querySelectorAll('tr');
                for (const row of rows) {
                    const cells = row.querySelectorAll('td, th');
                    if (cells.length >= 5) {
                        const firstCell = cells[0]?.textContent?.trim();
                        if (firstCell && ['Arlington', 'Colleyville', 'Frisco', 'Preston Trail', 'Skillman'].includes(firstCell)) {
                            results.stores[firstCell] = {
                                name: firstCell,
                                net_sales: parseFloat(cells[1]?.textContent?.replace(/[,$]/g, '')) || 0,
                                labor_percent: parseFloat(cells[6]?.textContent?.replace(/[%]/g, '')) || 0,
                                labor_cost: parseFloat(cells[5]?.textContent?.replace(/[,$]/g, '')) || 0,
                                guest_count: parseInt(cells[12]?.textContent?.replace(/[,]/g, '')) || 0,
                                comps: parseFloat(cells[4]?.textContent?.replace(/[,$]/g, '')) || 0,
                                voids: parseFloat(cells[8]?.textContent?.replace(/[,$]/g, '')) || 0
                            };
                        }
                    }
                }
            }
            const tiles = document.querySelectorAll('li, [role="listitem"]');
            for (const tile of tiles) {
                const labelEl = tile.querySelector('[class*="generic"], h3, span');
                const valueEl = tile.querySelector('h1, h2');
                if (labelEl && valueEl) {
                    const label = labelEl.textContent?.trim()?.toLowerCase() || '';
                    const value = parseFloat(valueEl.textContent?.replace(/[,$%]/g, '')) || 0;
                    if (label.includes('net sales')) results.totals.net_sales = value;
                    else if (label.includes('labor')) results.totals.labor_percent = value;
                    else if (label.includes('guest')) results.totals.guest_count = Math.round(value);
                }
            }
            return results;
        });
        console.log('Data extracted:', JSON.stringify(data));
        return data;
    }

    async scrapeForDate(targetDate = null) {
        const date = targetDate || format(subDays(new Date(), 1), 'yyyy-MM-dd');
        const results = [];
        const restaurants = Restaurant.getAll();
        const storeNameMap = { 'MAR-ARL': 'Arlington', 'LHR-COL': 'Colleyville', 'LHR-FRI': 'Frisco', 'LHR-PLA': 'Preston Trail', 'LHR-SKI': 'Skillman', 'MAR-DAL': 'Skillman' };

        try {
            await this.init();
            await this.login();
            await this.navigateToDashboard();
            const dashboardData = await this.extractDashboardData();

            for (const restaurant of restaurants) {
                const alohaStoreName = storeNameMap[restaurant.short_name];
                const storeData = dashboardData.stores[alohaStoreName];
                console.log('Processing: ' + restaurant.name + ' (' + alohaStoreName + ')');

                try {
                    if (storeData) {
                        DailySales.upsert({
                            restaurant_id: restaurant.id,
                            business_date: date,
                            net_sales: storeData.net_sales,
                            gross_sales: storeData.net_sales,
                            guest_count: storeData.guest_count,
                            comps: storeData.comps,
                            voids: storeData.voids,
                            data_source: 'aloha'
                        });
                        DailyLabor.upsert({
                            restaurant_id: restaurant.id,
                            business_date: date,
                            labor_percent: storeData.labor_percent,
                            total_labor_cost: storeData.labor_cost,
                            data_source: 'aloha'
                        });
                        results.push({ restaurant: restaurant.name, date, status: 'success', data: storeData });
                        console.log(restaurant.name + ': $' + storeData.net_sales.toFixed(2) + ', Labor ' + storeData.labor_percent + '%');
                    } else {
                        results.push({ restaurant: restaurant.name, date, status: 'no_data' });
                    }
                } catch (e) {
                    results.push({ restaurant: restaurant.name, date, status: 'error', error: e.message });
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
        const ok = results.filter(r => r.status === 'success').length;
        const fail = results.filter(r => r.status === 'error').length;
        db.prepare('INSERT INTO scrape_log (scrape_type, business_date, status, records_processed, error_message, completed_at, duration_seconds) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)').run(type, date, fail > 0 ? 'partial' : 'success', ok, fail > 0 ? fail + ' failed' : null);
    }
}

export default AlohaScraper;
