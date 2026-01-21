import { format, subDays } from 'date-fns';
import { AlohaScraper } from './AlohaScraper.js';
import { NetchexScraper } from './NetchexScraper.js';
import { PrimeCost } from '../models/PrimeCost.js';
import { Restaurant } from '../models/Restaurant.js';

/**
 * Run all scrapers for a given date
 * @param {string} targetDate - Optional date in YYYY-MM-DD format (defaults to yesterday)
 */
export async function runAllScrapers(targetDate = null) {
    const date = targetDate || format(subDays(new Date(), 1), 'yyyy-MM-dd');
    console.log(`
╔════════════════════════════════════════════════════════════╗
║     🔄 Starting Data Scrape                                ║
║     Date: ${date}                                      ║
╚════════════════════════════════════════════════════════════╝
    `);

    const results = {
        date,
        aloha: null,
        netchex: null,
        primeCostCalculated: 0,
        startTime: new Date(),
        endTime: null,
        duration: null
    };

    try {
        // Run Aloha scraper
        console.log('\n📊 ALOHA ENTERPRISE SCRAPER');
        console.log('═'.repeat(50));

        const alohaScraper = new AlohaScraper();
        results.aloha = await alohaScraper.scrapeForDate(date);

    } catch (error) {
        console.error('❌ Aloha scraper failed:', error.message);
        results.aloha = { error: error.message };
    }

    try {
        // Run NetChex scraper
        console.log('\n👷 NETCHEX PAYROLL SCRAPER');
        console.log('═'.repeat(50));

        const netchexScraper = new NetchexScraper();
        results.netchex = await netchexScraper.scrapeForDate(date);

    } catch (error) {
        console.error('❌ NetChex scraper failed:', error.message);
        results.netchex = { error: error.message };
    }

    // Calculate prime cost for all restaurants
    console.log('\n📈 CALCULATING PRIME COSTS');
    console.log('═'.repeat(50));

    const restaurants = Restaurant.getAll();
    for (const restaurant of restaurants) {
        try {
            PrimeCost.calculateAndUpsert(restaurant.id, date);
            results.primeCostCalculated++;
            console.log(`✅ ${restaurant.short_name}: Prime cost calculated`);
        } catch (err) {
            console.error(`❌ ${restaurant.short_name}: Failed to calculate prime cost`);
        }
    }

    results.endTime = new Date();
    results.duration = Math.round((results.endTime - results.startTime) / 1000);

    console.log(`
╔════════════════════════════════════════════════════════════╗
║     ✅ Scrape Complete                                      ║
║     Duration: ${results.duration} seconds                               ║
║     Aloha: ${Array.isArray(results.aloha) ? results.aloha.filter(r => r.status === 'success').length + ' stores' : 'Error'}
║     NetChex: ${Array.isArray(results.netchex) ? results.netchex.filter(r => r.status === 'success').length + ' locations' : 'Error'}
║     Prime Cost: ${results.primeCostCalculated} restaurants                      ║
╚════════════════════════════════════════════════════════════╝
    `);

    return results;
}

// Allow running directly from command line
if (process.argv[1].includes('runAll.js')) {
    const targetDate = process.argv[2] || null;
    runAllScrapers(targetDate)
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

export default runAllScrapers;
