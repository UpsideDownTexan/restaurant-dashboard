import { format, subDays } from 'date-fns';
import { AlohaScraper } from './AlohaScraper.js';
// NetChex disabled - labor data now comes from Aloha
import { PrimeCost } from '../models/PrimeCost.js';
import { Restaurant } from '../models/Restaurant.js';

/**
 * Run all scrapers for a given date
 * @param {string} targetDate - Optional date in YYYY-MM-DD format (defaults to yesterday)
 */
export async function runAllScrapers(targetDate = null) {
    const date = targetDate || format(subDays(new Date(), 1), 'yyyy-MM-dd');
    console.log(`
╔════════════════════════════════════════════════════════╗
║  Starting Data Scrape                                  ║
║  Date: ${date}                                         ║
╚════════════════════════════════════════════════════════╝
`);

    const results = {
        date,
        aloha: null,
        primeCostCalculated: 0,
        startTime: new Date(),
        endTime: null,
        duration: null
    };

    try {
        // Run Aloha scraper (handles both sales AND labor)
        console.log('\n🏪 ALOHA ENTERPRISE SCRAPER');
        console.log('='.repeat(50));

        const alohaScraper = new AlohaScraper();
        results.aloha = await alohaScraper.scrapeForDate(date);

    } catch (error) {
        console.error('❌ Aloha scraper failed:', error.message);
        results.aloha = { error: error.message };
    }

    // Calculate prime cost for all restaurants
    console.log('\n📊 CALCULATING PRIME COSTS');
    console.log('='.repeat(50));

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
╔════════════════════════════════════════════════════════╗
║  ✅ Scrape Complete                                    ║
║  Duration: ${results.duration} seconds                 ║
║  Aloha: ${results.aloha?.error ? 'Error' : 'Success'}  ║
║  Prime Cost: ${results.primeCostCalculated} restaurants║
╚════════════════════════════════════════════════════════╝
`);

    return results;
}
