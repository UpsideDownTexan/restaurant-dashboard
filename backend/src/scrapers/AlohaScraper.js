import puppeteer from 'puppeteer';
import { format, subDays } from 'date-fns';
import { DailySales } from '../models/DailySales.js';
import { DailyLabor } from '../models/DailyLabor.js';
import { Restaurant } from '../models/Restaurant.js';
import { getDb } from '../database/db.js';

/**
 * Aloha Enterprise Online Scraper
 * Scrapes daily sales data from the Aloha Dashboard tiles.
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
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1920, height: 1080 });
        this.page.setDefaultTimeout(30000);
    }

    async close() {
        if (this.browser) await this.browser.close();
    }

    async login() {
        console.log('Logging into Aloha Enterprise...');
        const loginUrl = this.baseUrl.replace(/\/$/, '') + '/login.do';
        await this.page.goto(loginUrl, { waitUntil: 'networkidle2' });
        await this.page.waitForSelector('input[placeholder="User Name"], input[name="username"], input[type="text"]', { timeout: 15000 });
        const usernameInput = await this.page.$('input[placeholder="User Name"], input[name="username"], input[type="text"]');
        const passwordInput = await this.page.$('input[placeholder="Password"], input[name="password"], input[type="password"]');
        if (usernameInput) await usernameInput.type(this.username);
        if (passwordInput) await passwordInput.type(this.password);
        await this.page.click('button[type="submit"], input[type="submit"], .login-button');
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        try {
            const closeBtn = await this.page.$('button.close, .modal-close, [data-dismiss="modal"]');
            if (closeBtn) await closeBtn.click();
        } catch (e) {}
        console.log('Logged into Aloha');
    }

    async navigateToDashboard() {
        console.log('Navigating to dashboard...');
        const dashboardUrl = this.baseUrl.replace(/\/$/, '') + '/portal.do';
        await this.page.goto(dashboardUrl, { waitUntil: 'networkidle2' });
        await this.page.waitForSelector('.dashboard-card-container, md-card, .tile, [class*="dashboard"]', { timeout: 30000 });
        console.log('Dashboard loaded');
    }

    async extractDashboardData() {
        console.log('Extracting dashboard data...');
        const data = await this.page.evaluate(() => {
            const result = { net_sales: 0, labor_percent: 0, ppa: 0, guest_count: 0, comps: 0, promos: 0, voids: 0 };
            const tiles = document.querySelectorAll('.dashboard-card-container, md-card, .tile, [class*="card-container"]');
            for (const tile of tiles) {
                const labelEl = tile.querySelector('.dashboard-md-headline, .md-headline, h3, h4, [class*="headline"], [class*="label"]');
                const valueEl = tile.querySelector('h2[class*="metric-card-value"], h1, h2, [class*="value"], .metric-value');
                if (labelEl && valueEl) {
                    const label = labelEl.textContent.trim().toLowerCase();
                    const valueText = valueEl.textContent.trim();
                    const value = parseFloat(valueText.replace(/[\$,%,]/g, '')) || 0;
                    if (label.includes('net sales') || label.includes('sales')) result.net_sales = value;
                    else if (label.includes('labor')) result.labor_percent = value;
                    else if (label.includes('ppa') || label.includes('per person')) result.ppa = value;
                    else if (label.includes('guest') || label.includes('count')) result.guest_count = Math.round(value);
                    else if (label.includes('comp')) result.comps = value;
                    else if (label.includes('promo')) result.promos = value;
                    else if (label.includes('void')) result.voids = value;
                }
            }
            if (result.guest_count > 0) result.avg_guest_spend = result.net_sales / result.guest_count;
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
            await this.navigateToDashboard();
            const dashboardData = await this.extractDashboardData();
            console.log('Dashboard data extracted:', dashboardData);
            for (const restaurant of restaurants) {
                if (!restaurant.aloha_store_id) {
                    console.log('Skipping ' + restaurant.name + ' - no Aloha store ID');
                    continue;
                }
                console.log('Processing: ' + restaurant.name);
                try {
                    DailySales.upsert({
                        restaurant_id: restaurant.id,
                        business_date: date,
                        net_sales: dashboardData.net_sales / restaurants.length,
                        gross_sales: dashboardData.net_sales / restaurants.length,
                        guest_count: Math.round(dashboardData.guest_count / restaurants.length),
                        avg_guest_spend: dashboardData.avg_guest_spend || 0,
                        comps: dashboardData.comps / restaurants.length,
                        promos: dashboardData.promos / restaurants.length,
                        voids: dashboardData.voids / restaurants.length,
                        data_source: 'aloha'
                    });
                    if (dashboardData.labor_percent > 0) {
                        DailyLabor.upsert({
                            restaurant_id: restaurant.id,
                            business_date: date,
                            labor_percent: dashboardData.labor_percent,
                            data_source: 'aloha'
                        });
                    }
                    results.push({ restaurant: restaurant.name, date, status: 'success', data: dashboardData });
                    console.log(restaurant.name + ': Net Sales $' + (dashboardData.net_sales / restaurants.length).toFixed(2));
                } catch (storeError) {
                    console.error('Error processing ' + restaurant.name + ':', storeError.message);
                    results.push({ restaurant: restaurant.name, date, status: 'error', error: storeError.message });
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
        db.prepare('INSERT INTO scrape_log (scrape_type, business_date, status, records_processed, error_message, completed_at, duration_seconds) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)').run(type, date, failed > 0 ? 'partial' : 'success', successful, failed > 0 ? failed + ' stores failed' : null);
    }
}

export default AlohaScraper;
