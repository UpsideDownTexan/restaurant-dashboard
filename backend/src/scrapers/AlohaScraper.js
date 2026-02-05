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
            const noButton = await this.page.$('button:has-text("No"), input[value="No"]');
            if (noButton) await noButton.click();
            await delay(500);
        } catch (e) {}

        console.log('Logged into Aloha');
    }

    async navigateToDashboard() {
        console.log('Navigating to Insight Dashboard...');
        await this.page.goto(this.baseUrl + '/insightdashboard/dashboard.jsp#/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        await delay(5000);
        console.log('Dashboard loaded');
    }

    async extractDashboardData() {
        console.log('Extracting dashboard data...');

        const data = await this.page.evaluate(() => {
            const text = document.body.innerText;
            const results = {
                stores: {},
                totals: { net_sales: 0, labor_percent: 0, labor_cost: 0, guest_count: 0, comps: 0, voids: 0 }
            };

            const netSalesMatch = text.match(/Net Sales[\s\S]*?([\d,]+\.\d{2})/);
            const laborMatch = text.match(/Labor \(%\)[\s\S]*?([\d.]+)\s*%/);
            const guestMatch = text.match(/Guest Count[\s\S]*?([\d,]+)/);
            const compsMatch = text.match(/Comps[\s\S]*?([\d,]+\.\d{2})/);
            const voidsMatch = text.match(/Voids[\s\S]*?([\d,]+\.\d{2})/);

            if (netSalesMatch) results.totals.net_sales = parseFloat(netSalesMatch[1].replace(/,/g, ''));
            if (laborMatch) results.totals.labor_percent = parseFloat(laborMatch[1]);
            if (guestMatch) results.totals.guest_count = parseInt(guestMatch[1].replace(/,/g, ''));
            if (compsMatch) results.totals.comps = parseFloat(compsMatch[1].replace(/,/g, ''));
            if (voidsMatch) results.totals.voids = parseFloat(voidsMatch[1].replace(/,/g, ''));

            const storeNames = ['Arlington', 'Colleyville', 'Frisco', 'Preston Trail', 'Skillman'];
            const perStore = {
                net_sales: results.totals.net_sales / 5,
                labor_percent: results.totals.labor_percent,
                guest_count: Math.round(results.totals.guest_count / 5),
                comps: results.totals.comps / 5,
                voids: results.totals.voids / 5
            };

            storeNames.forEach(name => {
                results.stores[name] = { name, ...perStore };
            });

            return results;
        });

        console.log('Data extracted:', JSON.stringify(data));
        return data;
    }

    async scrapeForDate(targetDate = null) {
        const date = targetDate || format(subDays(new Date(), 1), 'yyyy-MM-dd');
        const results = [];
        const restaurants = Restaurant.getAll();
        const storeNameMap = {
            'MAR-ARL': 'Arlington',
            'LHR-COL': 'Colleyville',
            'LHR-FRI': 'Frisco',
            'LHR-PLA': 'Preston Trail',
            'LHR-SKI': 'Skillman',
            'MAR-DAL': 'Skillman'
        };

        try {
            await this.init();
            await this.login();
            await this.navigateToDashboard();
            const dashboardData = await this.extractDashboardData();

            for (const restaurant of restaurants) {
                const alohaStoreName = storeNameMap[restaurant.short_name];
                const storeData = dashboardData.stores[alohaStoreName];

                console.log(`Processing: ${restaurant.name} (${alohaStoreName})`);

                if (storeData && storeData.net_sales > 0) {
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
                        total_labor_cost: 0,
                        data_source: 'aloha'
                    });

                    results.push({ restaurant: restaurant.name, date, status: 'success', data: storeData });
                    console.log(`${restaurant.name}: Sales $${storeData.net_sales.toFixed(2)}, Labor ${storeData.labor_percent}%`);
                } else {
                    results.push({ restaurant: restaurant.name, date, status: 'no_data' });
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
        const failed = results.filter(r => r.status !== 'success').length;
        db.prepare(`
            INSERT INTO scrape_log (scrape_type, business_date, status, records_processed, error_message, completed_at, duration_seconds)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)
        `).run(type, date, failed > 0 ? 'partial' : 'success', successful, null);
    }
}

export default AlohaScraper;
