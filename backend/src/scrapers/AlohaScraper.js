import puppeteer from 'puppeteer';
import { format, subDays } from 'date-fns';
import { DailySales } from '../models/DailySales.js';
import { DailyLabor } from '../models/DailyLabor.js';
import { Restaurant } from '../models/Restaurant.js';
import { getDb } from '../database/db.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

        // Wait for any input field
        try {
            await this.page.waitForSelector('input', { timeout: 15000 });
        } catch (e) {
            diag = await this.getPageDiag();
            throw new Error('No input fields on login page. URL: ' + diag.url + ' Preview: ' + (diag.preview || '').substring(0, 200));
        }
        // Use page.evaluate to set values directly - this properly triggers Angular model binding
        // The Aloha login form uses AngularJS 1.x with ng-model on inputs
        // page.type() doesn't reliably trigger Angular's $digest cycle
        const fillResult = await this.page.evaluate((username, password) => {
            const usernameInput = document.querySelector('#login-username')
                || document.querySelector('input[name="loginName"]')
                || document.querySelector('input[type="text"]')
                || document.querySelector('input[type="email"]');
            const passwordInput = document.querySelector('#login-password')
                || document.querySelector('input[name="password"]')
                || document.querySelector('input[type="password"]');

            if (!usernameInput) {
                const inputs = Array.from(document.querySelectorAll('input')).map(e => ({ type: e.type, name: e.name, id: e.id }));
                return { success: false, error: 'No username field found', inputs: inputs };
            }
            if (!passwordInput) {
                return { success: false, error: 'No password field found' };
            }

            // Set value directly on the DOM element
            usernameInput.value = username;
            usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
            usernameInput.dispatchEvent(new Event('change', { bubbles: true }));

            passwordInput.value = password;
            passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
            passwordInput.dispatchEvent(new Event('change', { bubbles: true }));

            // Also update Angular model if available
            if (typeof angular !== 'undefined') {
                try {
                    const uScope = angular.element(usernameInput).scope();
                    if (uScope) {
                        const uCtrl = angular.element(usernameInput).controller('ngModel');
                        if (uCtrl) { uCtrl.$setViewValue(username); uCtrl.$render(); }
                    }
                    const pScope = angular.element(passwordInput).scope();
                    if (pScope) {
                        const pCtrl = angular.element(passwordInput).controller('ngModel');
                        if (pCtrl) { pCtrl.$setViewValue(password); pCtrl.$render(); }
                    }
                } catch (e) {
                    // Angular update failed, DOM events should still work
                }
            }

            return {
                success: true,
                usernameField: { name: usernameInput.name, id: usernameInput.id },
                passwordField: { name: passwordInput.name, id: passwordInput.id }
            };
        }, this.username, this.password);

        this.logStep('login_fill', fillResult);

        if (!fillResult.success) {
            throw new Error('Login fill failed: ' + fillResult.error + (fillResult.inputs ? ' Inputs: ' + JSON.stringify(fillResult.inputs) : ''));
        }

        await delay(500);

        // Click submit
        const submitBtn = await this.page.$('button[type="submit"]')
            || await this.page.$('input[type="submit"]')
            || await this.page.$('.btn-primary');

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

        await delay(2000);
        diag = await this.getPageDiag();
        this.logStep('login_done', diag);

        // Check if login failed
        if (diag.preview && diag.preview.includes('incorrect')) {
            throw new Error('Login failed: ' + diag.preview.substring(0, 200));
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
                    gridRowCount: gridData.length
                };
            } catch (e) {
                return { source: 'angular_scope', error: e.message };
            }
        });
        this.logStep('extract', { source: angularData.source, storeCount: angularData.storeCount, error: angularData.error });

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

            for (const restaurant of restaurants) {
                let storeData = null;

                // Try matching store names
                for (const [alohaName, data] of Object.entries(dashboardData.stores)) {
                    const alohaLower = alohaName.toLowerCase();
                    const restLower = restaurant.name.toLowerCase();
                    if (restLower.includes(alohaLower) || alohaLower.includes(restLower.replace('la hacienda ranch ', ''))) {
                        storeData = data;
                        break;
                    }
                }

                // Fuzzy match by last word
                if (!storeData) {
                    const nameWords = restaurant.name.toLowerCase().split(/\s+/);
                    const keyWord = nameWords[nameWords.length - 1];
                    for (const [alohaName, data] of Object.entries(dashboardData.stores)) {
                        if (alohaName.toLowerCase().includes(keyWord)) {
                            storeData = data;
                            break;
                        }
                    }
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
                    DailyLabor.upsert({
                        restaurant_id: restaurant.id,
                        business_date: date,
                        labor_percent: storeData.labor_percent,
                        total_labor_cost: storeData.labor_amount,
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
