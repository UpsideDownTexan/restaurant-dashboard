import { format, subDays } from 'date-fns';
import { AlohaScraper } from './AlohaScraper.js';
// PrimeCost removed - no COGS data available from Aloha
// NetChex disabled - labor data now comes from Aloha
import { Restaurant } from '../models/Restaurant.js';

/**
 * Run all scrapers for a given date
 * @param {string} targetDate - Optional date in YYYY-MM-DD format (defaults to yesterday)
 */
export async function runAllScrapers(targetDate = null) {
    const date = targetDate || format(subDays(new Date(), 1), 'yyyy-MM-dd');
    
    console.log(`
========================================
  Starting Data Scrape
  Date: ${date}
========================================
`);

    const results = {
        date,
        aloha: null,
        startTime: new Date(),
        endTime: null,
        duration: null
    };

    // ---- ALOHA ENTERPRISE SCRAPER ----
    try {
        console.log('\n--- ALOHA ENTERPRISE SCRAPER ---');
        const alohaScraper = new AlohaScraper();
        results.aloha = await alohaScraper.scrapeForDate(date);
        console.log('Aloha scraper result:', JSON.stringify(results.aloha, null, 2));
    } catch (error) {
        console.error('Aloha scraper failed:', error.message);
        console.error('Stack:', error.stack);
        results.aloha = { error: error.message };
    }

    // ---- SUMMARY ----
    results.endTime = new Date();
    results.duration = Math.round((results.endTime - results.startTime) / 1000);
    
    console.log(`
========================================
  Scrape Complete
  Duration: ${results.duration}s
  Aloha: ${results.aloha?.error ? 'FAILED' : 'OK'}
========================================
`);

    return results;
}
