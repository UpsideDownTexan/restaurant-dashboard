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
            const buttons = await this.page.$$('button');
            for (const btn of buttons) {
                const text = await this.page.evaluate(el => el.textContent.trim(), btn);
                if (text === 'No') { await btn.click(); break; }
            }
            await delay(1000);
        } catch (e) { console.log('No alert dialog to dismiss'); }
        console.log('Logged into Aloha');
    }

    async navigateToDashboard() {
        console.log('Navigating to Insight Dashboard...');
        await this.page.goto(this.baseUrl + '/insightdashboard/dashboard.jsp#/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        console.log('Waiting for Angular and dashboard data...');
        await this.page.waitForFunction(() => {
            return typeof angular !== 'undefined' && document.body.innerText.includes('ALL METRICS');
        }, { timeout: 30000 });
        await delay(5000);
        console.log('Dashboard loaded with ALL METRICS table');
    }

    async enableAngularDebug() {
        console.log('Enabling Angular debug info...');
        const needsReload = await this.page.evaluate(() => {
            const gridEl = document.querySelector('[ng-controller*="MetricGridController"]');
            if (!gridEl) return true;
            const scope = angular.element(gridEl).scope();
            return !scope;
        });
        if (needsReload) {
            console.log('Reloading with Angular debug info enabled...');
            await this.page.evaluate(() => { angular.reloadWithDebugInfo(); });
            await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
            await this.page.waitForFunction(() => {
                return typeof angular !== 'undefined' && document.body.innerText.includes('ALL METRICS');
            }, { timeout: 30000 });
            await delay(5000);
            console.log('Page reloaded with debug info');
        } else {
            console.log('Angular debug info already available');
        }
    }

    async switchToYesterdayView() {
        console.log('Switching ALL METRICS to Yesterday view...');
        const switched = await this.page.evaluate(() => {
            try {
                const gridEl = document.querySelector('[ng-controller*="MetricGridController"]');
                if (!gridEl) return { success: false, error: 'MetricGridController not found' };
                const scope = angular.element(gridEl).scope();
                if (!scope) return { success: false, error: 'scope not available' };
                const ctrl = scope.ctrl;
                if (!ctrl) return { success: false, error: 'ctrl not available' };
                const opt = ctrl.dateOptionList.find(d => d.name === 'Yesterday');
                if (!opt) return { success: false, error: 'Yesterday not in: ' + ctrl.dateOptionList.map(d => d.name).join(', ') };
                ctrl.dateOption = opt;
                ctrl.hasChanged();
                scope.$apply();
                return { success: true, dateOption: opt.name };
            } catch (e) { return { success: false, error: e.message }; }
        });
        console.log('Date switch result:', JSON.stringify(switched));
        if (!switched.success) { console.warn('Could not switch to Yesterday:', switched.error); }
        await delay(5000);
    }

    async extractDashboardData() {
        console.log('Extracting dashboard data from Angular scope...');
        const angularData = await this.page.evaluate(() => {
            try {
                const gridEl = document.querySelector('[ng-controller*="MetricGridController"]');
                if (!gridEl) return null;
                const scope = angular.element(gridEl).scope();
                if (!scope || !scope.ctrl) return null;
                const ctrl = scope.ctrl;
                const gridData = ctrl.gridData;
                if (!gridData || gridData.length < 4) return null;
                const stores = {};
                const totals = {};
                const grandTotalRow = gridData[2];
                if (grandTotalRow) {
                    totals.net_sales = grandTotalRow[1] ? (grandTotalRow[1].v || 0) : 0;
                    totals.labor_percent = grandTotalRow[6] ? (grandTotalRow[6].v || 0) : 0;
                    totals.guest_count = grandTotalRow[14] ? (grandTotalRow[14].v || 0) : 0;
                }
                for (let i = 3; i < gridData.length; i++) {
                    const row = gridData[i];
                    if (!row || !row[0]) continue;
                    const storeName = row[0].f || row[0];
                    if (typeof storeName !== 'string' || storeName.length === 0) continue;
                    stores[storeName] = {
                        name: storeName,
                        net_sales: row[1] ? (row[1].v || 0) : 0,
                        net_sales_ly: row[2] ? (row[2].v || 0) : 0,
                        labor_hours: row[4] ? (row[4].v || 0) : 0,
                        labor_amount: row[5] ? (row[5].v || 0) : 0,
                        labor_percent: row[6] ? (row[6].v || 0) : 0,
                        comp_count: row[9] ? (row[9].v || 0) : 0,
                        comp_amount: row[10] ? (row[10].v || 0) : 0,
                        void_count: row[11] ? (row[11].v || 0) : 0,
                        void_amount: row[12] ? (row[12].v || 0) : 0,
                        check_count: row[13] ? (row[13].v || 0) : 0,
                        guest_count: row[14] ? (row[14].v || 0) : 0,
                        ppa: row[16] ? (row[16].v || 0) : 0,
                        check_avg: row[17] ? (row[17].v || 0) : 0
                    };
                }
                return {
                    source: 'angular_scope',
                    currentDateOption: ctrl.dateOption ? ctrl.dateOption.name : 'unknown',
                    stores, totals,
                    storeCount: Object.keys(stores).length
                };
            } catch (e) { return { source: 'angular_scope', error: e.message }; }
        });
        if (angularData && angularData.storeCount > 0) {
            console.log('Angular extraction: ' + angularData.storeCount + ' stores (' + angularData.currentDateOption + ')');
            return angularData;
        }
        console.log('Angular failed, falling back to text parsing...');
        const textData = await this.page.evaluate(() => {
            try {
                const text = document.body.innerText;
                const idx = text.indexOf('ALL METRICS');
                if (idx === -1) return { source: 'text_fallback', error: 'ALL METRICS not found' };
                const lines = text.substring(idx).split('\n').map(l => l.trim()).filter(l => l.length > 0);
                const stores = {};
                const names = ['Arlington', 'Colleyville', 'Frisco', 'Preston Trail', 'Skillman'];
                for (const line of lines) {
                    for (const sn of names) {
                        if (line.startsWith(sn + '\t')) {
                            const p = line.split('\t');
                            if (p.length >= 15) {
                                const pn = (s) => s ? parseFloat(s.replace(/,/g, '')) || 0 : 0;
                                stores[sn] = {
                                    name: sn, net_sales: pn(p[1]), net_sales_ly: pn(p[2]),
                                    labor_hours: pn(p[4]), labor_amount: pn(p[5]), labor_percent: pn(p[6]),
                                    comp_amount: pn(p[10]), void_amount: pn(p[12]),
                                    check_count: pn(p[13]), guest_count: pn(p[14]),
                                    ppa: pn(p[16]), check_avg: pn(p[17])
                                };
                            }
                        }
                    }
                }
                return { source: 'text_fallback', stores, totals: {}, storeCount: Object.keys(stores).length };
            } catch (e) { return { source: 'text_fallback', error: e.message }; }
        });
        if (textData && textData.storeCount > 0) { console.log('Text fallback: ' + textData.storeCount + ' stores'); return textData; }
        console.error('All extraction methods failed');
        const dbg = await this.page.evaluate(() => ({
            url: window.location.href, title: document.title,
            hasAngular: typeof angular !== 'undefined',
            bodyLen: document.body.innerText.length,
            preview: document.body.innerText.substring(0, 500),
            hasAllMetrics: document.body.innerText.includes('ALL METRICS')
        }));
        console.log('Debug:', JSON.stringify(dbg, null, 2));
        return { stores: {}, totals: { net_sales: 0 }, storeCount: 0 };
    }

    async scrapeForDate(targetDate = null) {
        const date = targetDate || format(subDays(new Date(), 1), 'yyyy-MM-dd');
        const results = [];
        const restaurants = Restaurant.getAll();
        console.log('Scraping Aloha data for date: ' + date);
        console.log('Found ' + restaurants.length + ' restaurants in database');
        try {
            await this.init();
            await this.login();
            await this.navigateToDashboard();
            await this.enableAngularDebug();
            await this.switchToYesterdayView();
            const dashboardData = await this.extractDashboardData();
            console.log('Extraction: ' + dashboardData.storeCount + ' stores, source: ' + dashboardData.source);
            if (dashboardData.storeCount === 0) {
                console.error('No store data extracted');
                for (const r of restaurants) { results.push({ restaurant: r.name, date, status: 'no_data', reason: 'extraction_failed' }); }
                this.logScrape('aloha', date, results);
                return results;
            }
            for (const restaurant of restaurants) {
                let storeData = null;
                for (const [alohaName, data] of Object.entries(dashboardData.stores)) {
                    if (restaurant.name.toLowerCase().includes(alohaName.toLowerCase())) {
                        storeData = data;
                        break;
                    }
                }
                console.log('Processing: ' + restaurant.name + ' -> ' + (storeData ? 'MATCHED' : 'NO MATCH'));
                if (storeData && storeData.net_sales > 0) {
                    DailySales.upsert({
                        restaurant_id: restaurant.id, business_date: date,
                        net_sales: storeData.net_sales, gross_sales: storeData.net_sales,
                        guest_count: storeData.guest_count, check_count: storeData.check_count,
                        avg_check: storeData.check_avg, avg_guest_spend: storeData.ppa,
                        comps: storeData.comp_amount, voids: storeData.void_amount,
                        data_source: 'aloha'
                    });
                    DailyLabor.upsert({
                        restaurant_id: restaurant.id, business_date: date,
                        labor_percent: storeData.labor_percent,
                        total_labor_cost: storeData.labor_amount,
                        total_hours: storeData.labor_hours,
                        data_source: 'aloha'
                    });
                    results.push({ restaurant: restaurant.name, date, status: 'success',
                        data: { net_sales: storeData.net_sales, labor_pct: storeData.labor_percent, guest_count: storeData.guest_count }
                    });
                    console.log('  ' + restaurant.name + ': Sales $' + storeData.net_sales.toFixed(2) + ', Labor ' + storeData.labor_percent + '%');
                } else {
                    results.push({ restaurant: restaurant.name, date, status: 'no_data', reason: storeData ? 'zero_sales' : 'no_match' });
                }
            }
            this.logScrape('aloha', date, results);
        } catch (error) {
            console.error('Scrape error:', error.message);
            for (const r of restaurants) { results.push({ restaurant: r.name, date, status: 'error', error: error.message }); }
            try { this.logScrape('aloha', date, results); } catch (e) {}
        } finally {
            await this.close();
        }
        return results;
    }

    logScrape(type, date, results) {
        const db = getDb();
        const ok = results.filter(r => r.status === 'success').length;
        const fail = results.filter(r => r.status !== 'success').length;
        db.prepare('INSERT INTO scrape_log (scrape_type, business_date, status, records_processed, error_message, completed_at, duration_seconds) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)').run(type, date, fail > 0 ? 'partial' : 'success', ok, null);
    }
}

export default AlohaScraper;
