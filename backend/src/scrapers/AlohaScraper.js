import puppeteer from 'puppeteer';
import { format, subDays } from 'date-fns';
import { DailySales } from '../models/DailySales.js';
import { DailyLabor } from '../models/DailyLabor.js';
import { Restaurant } from '../models/Restaurant.js';
import { getDb } from '../database/db.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Map Aloha dashboard store names to restaurant database names
const ALOHA_STORE_MAP = {
    'preston trail': 'plano',
    'skillman': 'dallas',
    'arlington': 'arlington',
    'colleyville': 'colleyville',
    'frisco': 'frisco',
    'carrollton': 'carrollton'
};

export class AlohaScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.baseUrl = process.env.ALOHA_URL || 'https://lahaciendaranch.alohaenterprise.com';
        this.username = process.env.ALOHA_USERNAME;
        this.password = process.env.ALOHA_PASSWORD;
        this.steps = [];
    }

    logStep(step, detail) {
        const entry = { step, detail, time: new Date().toISOString() };
        this.steps.push(entry);
        console.log('[STEP] ' + step + ':', typeof detail === 'string' ? detail : JSON.stringify(detail));
    }

    async getPageDiag() {
        try {
            return await this.page.evaluate(() => ({
                url: window.location.href,
                title: document.title,
                bodyLen: document.body.innerText.length,
                preview: document.body.innerText.substring(0, 500),
                hasAngular: typeof angular !== 'undefined',
                hasMetrics: document.body.innerText.includes('ALL METRICS')
            }));
        } catch (e) {
            return { error: e.message };
        }
    }

    async init() {
        const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';
        this.logStep('init', { executablePath: execPath, baseUrl: this.baseUrl, hasUser: !!this.username, hasPass: !!this.password });
        this.browser = await puppeteer.launch({
            headless: 'new',
            executablePath: execPath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process',
                '--no-zygote'
            ]
        });
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1920, height: 1080 });
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        this.page.setDefaultTimeout(60000);
        this.logStep('init', 'Browser launched OK');
    }

    async close() {
        if (this.browser) {
            try { await this.browser.close(); } catch (e) {}
        }
    }

    async login() {
        const loginUrl = this.baseUrl + '/login.do';
        this.logStep('login', 'Navigating to ' + loginUrl);
        await this.page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 45000 });

        let diag = await this.getPageDiag();
        this.logStep('login_loaded', diag);

        // Wait for the login form inputs to be ready
        try {
            await this.page.waitForSelector('#login-username, input[name="loginName"]', { timeout: 15000 });
        } catch (e) {
            diag = await this.getPageDiag();
            throw new Error('No login fields found. URL: ' + diag.url + ' Preview: ' + (diag.preview || '').substring(0, 200));
        }

        // Wait extra time for any JS frameworks (Angular etc) to initialize
        await delay(3000);

        // Enable request interception to log what gets sent
        await this.page.setRequestInterception(true);
        let postData = null;
        const requestHandler = (request) => {
            if (request.method() === 'POST' && request.url().includes('login')) {
                postData = request.postData();
                this.logStep('login_post', { url: request.url(), postData: postData });
            }
            request.continue();
        };
        this.page.on('request', requestHandler);

        // Approach: Click field, select all, type value - simulates real user
        const usernameSelector = '#login-username';
        const passwordSelector = '#login-password';

        // Click and type username
        await this.page.click(usernameSelector);
        await delay(200);
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('a');
        await this.page.keyboard.up('Control');
        await this.page.type(usernameSelector, this.username, { delay: 30 });
        this.logStep('login', 'Username typed');

        // Click and type password
        await this.page.click(passwordSelector);
        await delay(200);
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('a');
        await this.page.keyboard.up('Control');
        await this.page.type(passwordSelector, this.password, { delay: 30 });
        this.logStep('login', 'Password typed');

        await delay(500);

        // Verify values were set
        const fieldCheck = await this.page.evaluate(() => {
            const u = document.querySelector('#login-username') || document.querySelector('input[name="loginName"]');
            const p = document.querySelector('#login-password') || document.querySelector('input[name="password"]');
            return {
                username: u ? u.value : null,
                usernameLen: u ? u.value.length : -1,
                password: p ? '***(' + p.value.length + ' chars)' : null,
                passwordLen: p ? p.value.length : -1
            };
        });
        this.logStep('login_verify', fieldCheck);

        // Click the submit button
        const submitBtn = await this.page.$('button[type="submit"]')
            || await this.page.$('input[type="submit"]');

        if (submitBtn) {
            this.logStep('login', 'Clicking submit button');
            const [navResult] = await Promise.allSettled([
                this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }),
                submitBtn.click()
            ]);
            if (navResult.status === 'rejected') {
                this.logStep('login', 'Nav timeout after submit, waiting extra...');
                await delay(5000);
            }
        } else {
            this.logStep('login', 'No submit button, pressing Enter');
            const [navResult] = await Promise.allSettled([
                this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }),
                this.page.keyboard.press('Enter')
            ]);
            if (navResult.status === 'rejected') {
                await delay(5000);
            }
        }

        // Disable interception
        this.page.off('request', requestHandler);
        await this.page.setRequestInterception(false);

        await delay(2000);
        diag = await this.getPageDiag();
        this.logStep('login_done', diag);

        // Check if login failed
        if (diag.preview && diag.preview.includes('incorrect')) {
            // If direct form interaction failed, try submitting form data via evaluate
            this.logStep('login', 'Direct login failed, trying form submit via JS...');
            await this.page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 45000 });
            await delay(2000);

            const jsSubmitResult = await this.page.evaluate((username, password) => {
                const form = document.querySelector('form');
                if (!form) return { success: false, error: 'No form found' };

                const loginInput = form.querySelector('input[name="loginName"]');
                const passInput = form.querySelector('input[name="password"]');
                if (!loginInput || !passInput) return { success: false, error: 'Inputs not found' };

                // Use native setter to bypass any framework interception
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeSetter.call(loginInput, username);
                nativeSetter.call(passInput, password);

                // Dispatch all possible events
                ['input', 'change', 'blur', 'keyup', 'keydown'].forEach(evt => {
                    loginInput.dispatchEvent(new Event(evt, { bubbles: true }));
                    passInput.dispatchEvent(new Event(evt, { bubbles: true }));
                });

                // Try form.submit() which bypasses any JS validation
                try {
                    form.submit();
                    return { success: true, method: 'form.submit()' };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }, this.username, this.password);
            this.logStep('login_js_submit', jsSubmitResult);

            if (jsSubmitResult.success) {
                try {
                    await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
                } catch (e) {}
                await delay(2000);
                diag = await this.getPageDiag();
                this.logStep('login_done_retry', diag);

                if (diag.preview && diag.preview.includes('incorrect')) {
                    throw new Error('Login failed after retry: ' + diag.preview.substring(0, 200));
                }
            }
        }

        // Dismiss any alert dialog
        try {
            const buttons = await this.page.$$('button');
            for (const btn of buttons) {
                const text = await this.page.evaluate(el => el.textContent.trim(), btn);
                if (text === 'No') {
                    await btn.click();
                    this.logStep('login', 'Dismissed alert dialog');
                    break;
                }
            }
        } catch (e) {}

        await delay(1000);
    }

    async navigateToDashboard() {
        const dashUrl = this.baseUrl + '/insightdashboard/dashboard.jsp#/';
        this.logStep('dashboard', 'Navigating to ' + dashUrl);
        await this.page.goto(dashUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        let diag = await this.getPageDiag();
        this.logStep('dashboard_loaded', diag);

        // Wait for Angular and ALL METRICS
        try {
            await this.page.waitForFunction(() => {
                return typeof angular !== 'undefined' && document.body.innerText.includes('ALL METRICS');
            }, { timeout: 60000 });
        } catch (e) {
            diag = await this.getPageDiag();
            this.logStep('dashboard_timeout', diag);
            throw new Error('Dashboard timeout. Angular: ' + diag.hasAngular + ', Metrics: ' + diag.hasMetrics + '. URL: ' + diag.url + '. Preview: ' + (diag.preview || '').substring(0, 200));
        }

        await delay(5000);
        this.logStep('dashboard', 'Ready with ALL METRICS');
    }

    async enableAngularDebug() {
        this.logStep('angularDebug', 'Checking scope availability...');
        const checkResult = await this.page.evaluate(() => {
            const gridEl = document.querySelector('[ng-controller*="MetricGridController"]');
            if (!gridEl) return { reload: true, reason: 'no MetricGridController element' };
            try {
                const scope = angular.element(gridEl).scope();
                return scope ? { reload: false } : { reload: true, reason: 'scope is null' };
            } catch (e) {
                return { reload: true, reason: e.message };
            }
        });
        this.logStep('angularDebug', checkResult);

        if (checkResult.reload) {
            this.logStep('angularDebug', 'Reloading with debug info...');
            await this.page.evaluate(() => angular.reloadWithDebugInfo());

            try {
                await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
            } catch (e) {
                this.logStep('angularDebug', 'Nav timeout after reload, waiting...');
                await delay(10000);
            }

            try {
                await this.page.waitForFunction(() => {
                    return typeof angular !== 'undefined' && document.body.innerText.includes('ALL METRICS');
                }, { timeout: 60000 });
            } catch (e) {
                const diag = await this.getPageDiag();
                this.logStep('angularDebug_timeout', diag);
                throw new Error('Angular reload timeout. ' + JSON.stringify(diag));
            }

            await delay(5000);
            this.logStep('angularDebug', 'Reloaded successfully');
        }
    }

    async switchToYesterdayView() {
        this.logStep('switchDate', 'Switching to Yesterday...');
        const result = await this.page.evaluate(() => {
            try {
                const gridEl = document.querySelector('[ng-controller*="MetricGridController"]');
                if (!gridEl) return { success: false, error: 'MetricGridController not found' };
                const scope = angular.element(gridEl).scope();
                if (!scope) return { success: false, error: 'scope not available' };
                const ctrl = scope.ctrl;
                if (!ctrl) return { success: false, error: 'ctrl not available' };

                const dateOptions = ctrl.dateOptionList.map(d => ({ id: d.id, name: d.name }));
                const opt = ctrl.dateOptionList.find(d => d.name === 'Yesterday');
                if (!opt) return { success: false, error: 'Yesterday not found', dateOptions };

                ctrl.dateOption = opt;
                ctrl.hasChanged();
                scope.$apply();
                return { success: true, dateOption: opt.name };
            } catch (e) {
                return { success: false, error: e.message };
            }
        });
        this.logStep('switchDate', result);
        if (!result.success) {
            console.warn('Could not switch to Yesterday:', result.error);
        }
        await delay(5000);
    }

    async extractDashboardData() {
        this.logStep('extract', 'Extracting from Angular scope...');
        const angularData = await this.page.evaluate(() => {
            try {
                const gridEl = document.querySelector('[ng-controller*="MetricGridController"]');
                if (!gridEl) return { source: 'angular', error: 'no grid element' };
                const scope = angular.element(gridEl).scope();
                if (!scope || !scope.ctrl) return { source: 'angular', error: 'no scope/ctrl' };
                const ctrl = scope.ctrl;
                const gridData = ctrl.gridData;
                if (!gridData || gridData.length < 4) {
                    return { source: 'angular', error: 'gridData too short', len: gridData ? gridData.length : 0 };
                }

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
                    storeCount: Object.keys(stores).length,
                    columnHeaders: gridData[0] ? gridData[0].map(function(c, i) { return { col: i, val: c ? (c.f || c.v || c) : null }; }) : [],
                    sampleRow: gridData[3] ? gridData[3].map(function(c, i) { return { col: i, f: c ? c.f : null, v: c ? c.v : null }; }) : [],
                    gridRowCount: gridData.length
                };
            } catch (e) {
                return { source: 'angular_scope', error: e.message };
            }
        });
        this.logStep('extract', { source: angularData.source, storeCount: angularData.storeCount, error: angularData.error });

        // Log column structure for FOH/BOH investigation
        if (angularData.columnHeaders) {
            this.logStep('grid_columns', angularData.columnHeaders);
        }
        if (angularData.sampleRow) {
            this.logStep('grid_sample', angularData.sampleRow);
        }

        if (angularData && angularData.storeCount > 0) {
            return angularData;
        }

        // Text fallback
        this.logStep('extract', 'Trying text fallback...');
        const textData = await this.page.evaluate(() => {
            try {
                const text = document.body.innerText;
                const idx = text.indexOf('ALL METRICS');
                if (idx === -1) return { source: 'text', error: 'ALL METRICS not found' };

                const section = text.substring(idx);
                const lines = section.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                const stores = {};
                const names = ['Arlington', 'Colleyville', 'Frisco', 'Preston Trail', 'Skillman'];

                for (const line of lines) {
                    for (const sn of names) {
                        if (line.startsWith(sn + '\t') || line.startsWith(sn + ' ')) {
                            const parts = line.split(/\t+/);
                            if (parts.length >= 15) {
                                const pn = (s) => s ? parseFloat(s.replace(/[$,%]/g, '').replace(/,/g, '')) || 0 : 0;
                                stores[sn] = {
                                    name: sn,
                                    net_sales: pn(parts[1]),
                                    net_sales_ly: pn(parts[2]),
                                    labor_hours: pn(parts[4]),
                                    labor_amount: pn(parts[5]),
                                    labor_percent: pn(parts[6]),
                                    comp_amount: pn(parts[10]),
                                    void_amount: pn(parts[12]),
                                    check_count: pn(parts[13]),
                                    guest_count: pn(parts[14]),
                                    ppa: pn(parts[16]),
                                    check_avg: pn(parts[17])
                                };
                            }
                        }
                    }
                }
                return { source: 'text_fallback', stores, storeCount: Object.keys(stores).length };
            } catch (e) {
                return { source: 'text', error: e.message };
            }
        });

        if (textData && textData.storeCount > 0) {
            return textData;
        }

        const debugInfo = await this.getPageDiag();
        this.logStep('extract', { msg: 'ALL EXTRACTION FAILED', ...debugInfo });
        return { stores: {}, totals: { net_sales: 0 }, storeCount: 0, debug: debugInfo };
    }

    async scrapeForDate(targetDate = null) {
        const date = targetDate || format(subDays(new Date(), 1), 'yyyy-MM-dd');
        const results = [];
        const restaurants = Restaurant.getAll();
        let currentStep = 'start';
        this.logStep('start', { date, restaurantCount: restaurants.length });

        try {
            currentStep = 'init';
            await this.init();

            currentStep = 'login';
            await this.login();

            currentStep = 'navigateToDashboard';
            await this.navigateToDashboard();

            currentStep = 'enableAngularDebug';
            await this.enableAngularDebug();

            currentStep = 'switchToYesterdayView';
            await this.switchToYesterdayView();

            currentStep = 'extractDashboardData';
            const dashboardData = await this.extractDashboardData();
            this.logStep('process', { storeCount: dashboardData.storeCount, source: dashboardData.source });

            if (dashboardData.storeCount === 0) {
                for (const r of restaurants) {
                    results.push({ restaurant: r.name, date, status: 'no_data', reason: 'extraction_failed' });
                }
                this.logScrape('aloha', date, results);
                return { results, steps: this.steps };
            }

            // Log all Aloha store names for debugging
            this.logStep('store_names', { alohaStores: Object.keys(dashboardData.stores) });

            for (const restaurant of restaurants) {
                let storeData = null;

                // First try explicit ALOHA_STORE_MAP mapping
                const restLower = restaurant.name.toLowerCase();
                for (const [alohaName, data] of Object.entries(dashboardData.stores)) {
                    const alohaLower = alohaName.toLowerCase();
                    // Check if Aloha name maps to part of restaurant name via our map
                    const mappedKeyword = ALOHA_STORE_MAP[alohaLower];
                    if (mappedKeyword && restLower.includes(mappedKeyword)) {
                        storeData = data;
                        this.logStep('match', { restaurant: restaurant.name, alohaName, method: 'store_map' });
                        break;
                    }
                }

                // Fallback: direct include matching
                if (!storeData) {
                    for (const [alohaName, data] of Object.entries(dashboardData.stores)) {
                        const alohaLower = alohaName.toLowerCase();
                        if (restLower.includes(alohaLower) || alohaLower.includes(restLower.replace('la hacienda ranch ', '').replace("mariano's ", ''))) {
                            storeData = data;
                            this.logStep('match', { restaurant: restaurant.name, alohaName, method: 'direct_include' });
                            break;
                        }
                    }
                }

                // Fuzzy match by last word
                if (!storeData) {
                    const nameWords = restLower.split(/\s+/);
                    const keyWord = nameWords[nameWords.length - 1];
                    for (const [alohaName, data] of Object.entries(dashboardData.stores)) {
                        if (alohaName.toLowerCase().includes(keyWord)) {
                            storeData = data;
                            this.logStep('match', { restaurant: restaurant.name, alohaName, method: 'fuzzy_last_word' });
                            break;
                        }
                    }
                }

                if (!storeData) {
                    this.logStep('no_match', { restaurant: restaurant.name, alohaStores: Object.keys(dashboardData.stores) });
                }

                if (storeData && storeData.net_sales > 0) {
                    DailySales.upsert({
                        restaurant_id: restaurant.id,
                        business_date: date,
                        net_sales: storeData.net_sales,
                        gross_sales: storeData.net_sales,
                        guest_count: storeData.guest_count,
                        check_count: storeData.check_count,
                        avg_check: storeData.check_avg,
                        avg_guest_spend: storeData.ppa,
                        comps: storeData.comp_amount,
                        voids: storeData.void_amount,
                        data_source: 'aloha'
                    });
                    // Calculate labor cost from percent if not provided
                    const laborCost = storeData.labor_amount > 0
                        ? storeData.labor_amount
                        : (storeData.labor_percent > 0 ? storeData.net_sales * storeData.labor_percent / 100 : 0);

                    DailyLabor.upsert({
                        restaurant_id: restaurant.id,
                        business_date: date,
                        labor_percent: storeData.labor_percent,
                        total_labor_cost: laborCost,
                        total_hours: storeData.labor_hours,
                        data_source: 'aloha'
                    });
                    results.push({
                        restaurant: restaurant.name,
                        date, status: 'success',
                        data: { net_sales: storeData.net_sales, labor_pct: storeData.labor_percent, guest_count: storeData.guest_count }
                    });
                    this.logStep('upsert', { restaurant: restaurant.name, net_sales: storeData.net_sales });
                } else {
                    results.push({ restaurant: restaurant.name, date, status: 'no_data', reason: storeData ? 'zero_sales' : 'no_match' });
                }
            }

            this.logScrape('aloha', date, results);
        } catch (error) {
            console.error('Scrape error at [' + currentStep + ']:', error.message);
            console.error('Stack:', error.stack);
            for (const r of restaurants) {
                results.push({ restaurant: r.name, date, status: 'error', error: '[' + currentStep + '] ' + error.message, step: currentStep });
            }
            try { this.logScrape('aloha', date, results); } catch (e) {}
        } finally {
            await this.close();
        }

        return { results, steps: this.steps };
    }

    logScrape(type, date, results) {
        try {
            const db = getDb();
            const ok = results.filter(r => r.status === 'success').length;
            const fail = results.filter(r => r.status !== 'success').length;
            db.prepare(
                'INSERT INTO scrape_log (scrape_type, business_date, status, records_processed, error_message, completed_at, duration_seconds) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)'
            ).run(type, date, fail > 0 ? 'partial' : 'success', ok, null);
        } catch (e) {
            console.error('Failed to log scrape:', e.message);
        }
    }
}

export default AlohaScraper;
