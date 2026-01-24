import puppeteer from 'puppeteer';
import { format, subDays } from 'date-fns';
import { DailySales } from '../models/DailySales.js';
import { Restaurant } from '../models/Restaurant.js';
import { getDb } from '../database/db.js';

/**
 * Aloha Enterprise Online Scraper
 *
 * Updated with correct selectors for La Hacienda Ranch's Aloha Enterprise instance.
 * Login URL: https://lahaciendaranch.alohaenterprise.com/login.do
 * Dashboard: https://lahaciendaranch.alohaenterprise.com/insightdashboard/dashboard.jsp#/
 *
 * Store IDs (from Aloha system):
 * - Arlington: 2614
 * - Colleyville: (check system)
 * - Frisco: 4110
 * - Preston Trail: (check system)
 * - Skillman: (check system)
 */
export class AlohaScraper {
        constructor() {
                    this.browser = null;
                    this.page = null;
                    // Base URL should be the domain without /login.do - it will be appended in login()
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
                await this.page.waitForSelector('input[placeholder="User Name"]');
                await this.page.type('input[placeholder="User Name"]', this.username);
                await this.page.type('input[placeholder="Password"]', this.password);
                await this.page.click('button[type="submit"]');
                await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
                try {
                                const closeButton = await this.page.$('button.close, .modal-close, [data-dismiss="modal"]');
                                if (closeButton) {
                                                    await closeButton.click();
                                                    await this.page.waitForTimeout(1000);
                                }
                } catch (e) {
                                // No popup, continue
                }
                console.log('Logged into Aloha');
    }

    async navigateToInsightDashboard() {
                console.log('Navigating to Aloha Insight Dashboard...');
                const dashboardUrl = this.baseUrl.replace(/\/$/, '') + '/insightdashboard/dashboard.jsp#/';
                await this.page.goto(dashboardUrl, { waitUntil: 'networkidle2' });
                await this.page.waitForSelector('[class*="tile"], .dashboard-tile, [role="listitem"]', { timeout: 15000 });
                console.log('Dashboard loaded');
    }

    async selectStore(storeId) {
                console.log('Selecting store: ' + storeId);
                const storeDropdown = await this.page.$('select#store, select[name="location"], .store-selector');
                if (storeDropdown) {
                                await this.page.select('select#store, select[name="location"], .store-selector', storeId);
                                await this.page.waitForTimeout(2000);
                }
    }

    async extractFromDashboardTiles() {
                console.log('Extracting from dashboard tiles...');
                const data = await this.page.evaluate(() => {
                                const getTileValue = (tileLabel) => {
                                                    const tiles = document.querySelectorAll('[role="listitem"], .tile, li');
                                                    for (const tile of tiles) {
                                                                            const label = tile.querySelector('[class*="tile-label"], .generic, h3, h4');
                                                                            if (label && label.textContent.toLowerCase().includes(tileLabel.toLowerCase())) {
                                                                                                        const value = tile.querySelector('h1, h2, [class*="value"], .heading');
                                                                                                        if (value) {
                                                                                                                                        const text = value.textContent.replace(/[$,%,]/g, '').trim();
                                                                                                                                        return parseFloat(text) || 0;
                                                                                                            }
                                                                                }
                                                    }
                                                    return 0;
                                };
                                return {
                                                    net_sales: getTileValue('Net Sales'),
                                                    labor_percent: getTileValue('Labor'),
                                                    ppa: getTileValue('PPA'),
                                                    guest_count: getTileValue('Guest Count'),
                                                    comps: getTileValue('Comps'),
                                                    promos: getTileValue('Promos'),
                                                    voids: getTileValue('Voids')
                                };
                });
                if (data.guest_count > 0) {
                                data.avg_guest_spend = data.net_sales / data.guest_count;
                }
                return data;
    }

    async scrapeForDate(targetDate = null) {
                const date = targetDate || format(subDays(new Date(), 1), 'yyyy-MM-dd');
                const results = [];
                const restaurants = Restaurant.getAll();
                try {
                                await this.init();
                                await this.login();
                                await this.navigateToInsightDashboard();
                                for (const restaurant of restaurants) {
                                                    if (!restaurant.aloha_store_id) {
                                                                            console.log('Skipping ' + restaurant.name + ' - no Aloha store ID configured');
                                                                            continue;
                                                    }
                                                    console.log('Processing: ' + restaurant.name);
                                                    try {
                                                                            await this.selectStore(restaurant.aloha_store_id);
                                                                            await this.page.waitForTimeout(2000);
                                                                            const salesData = await this.extractFromDashboardTiles();
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
                                                                            console.log(restaurant.name + ': Net Sales $' + (salesData.net_sales ? salesData.net_sales.toFixed(2) : 'N/A'));
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
                db.prepare('INSERT INTO scrape_log (scrape_type, business_date, status, records_processed, error_message, completed_at, duration_seconds) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)').run(
                                type,
                                date,
                                failed > 0 ? 'partial' : 'success',
                                successful,
                                failed > 0 ? failed + ' stores failed' : null
                            );
    }

            // Scrape category sales from Aloha Drilldown Viewer
            async scrapeCategorySales(storeId, date) {
                            const url = `https://lahaciendaranch.alohaenterprise.com/insightdashboard/drilldownviewer.jsp?store=${storeId}`;
                            try {
                                                await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
                                                const data = await this.page.evaluate(() => {
                                                                        const result = { food_sales: 0, liquor_sales: 0, beer_sales: 0, wine_sales: 0, gift_card_sales: 0, retail_sales: 0 };
                                                                        document.querySelectorAll('tr').forEach(row => {
                                                                                                    const cells = row.querySelectorAll('td');
                                                                                                    if (cells.length >= 2) {
                                                                                                                                    const label = cells[0].textContent.trim();
                                                                                                                                    const val = parseFloat(cells[1].textContent.replace(/[$,]/g, '')) || 0;
                                                                                                                                    if (label.includes('Food')) result.food_sales = val;
                                                                                                                                    else if (label.includes('Liquor')) result.liquor_sales = val;
                                                                                                                                    else if (label.includes('Beer')) result.beer_sales = val;
                                                                                                                                    else if (label.includes('Wine')) result.wine_sales = val;
                                                                                                                                    else if (label.includes('G.C.')) result.gift_card_sales = val;
                                                                                                                                    else if (label.includes('Retail')) result.retail_sales = val;
                                                                                                            }
                                                                        });
                                                                        return result;
                                                });
                                                return data;
                            } catch (err) {
                                                console.error('Category scrape error:', err.message);
                                                return null;
                            }
            }
}

export default AlohaScraper;
