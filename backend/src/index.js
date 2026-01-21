import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDb } from './database/db.js';
import dashboardRoutes from './routes/dashboard.js';
import importRoutes from './routes/import.js';
import { runAllScrapers } from './scrapers/runAll.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({
    contentSecurityPolicy: false // Allow inline scripts for dev
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/import', importRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Manual trigger for scrapers (protected in production)
app.post('/api/scrape/trigger', async (req, res) => {
    try {
        const { date } = req.body;
        console.log(`🔄 Manual scrape triggered for date: ${date || 'yesterday'}`);

        // Run scrapers asynchronously
        runAllScrapers(date).catch(err => {
            console.error('Scraper error:', err);
        });

        res.json({
            success: true,
            message: 'Scrape job started',
            date: date || 'yesterday'
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to trigger scrape' });
    }
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../../frontend/dist')));

    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
    });
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Schedule automated scraping
const SCRAPE_SCHEDULE = process.env.SCRAPE_SCHEDULE || '30 1 * * *'; // Default: 1:30 AM daily

if (process.env.NODE_ENV === 'production' || process.env.ENABLE_SCRAPING === 'true') {
    cron.schedule(SCRAPE_SCHEDULE, async () => {
        console.log('⏰ Scheduled scrape job starting...');
        try {
            await runAllScrapers();
            console.log('✅ Scheduled scrape completed');
        } catch (error) {
            console.error('❌ Scheduled scrape failed:', error);
        }
    });
    console.log(`📅 Scraper scheduled: ${SCRAPE_SCHEDULE}`);
}

// Initialize database and start server
async function startServer() {
    try {
        // Initialize database
        console.log('🔄 Initializing database...');
        await initDb();
        console.log('✅ Database initialized');

        // Start server
        app.listen(PORT, () => {
            console.log(`
╔════════════════════════════════════════════════════════════╗
║     🍽️  Restaurant Dashboard Server                         ║
║     MarginEdge/R365 Style Analytics                        ║
╠════════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${PORT}                  ║
║  API Health: http://localhost:${PORT}/api/health              ║
║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(12)}                       ║
╚════════════════════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

export default app;
