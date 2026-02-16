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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Scrape state tracking
let scrapeState = {
    running: false,
    started: null,
    finished: null,
    result: null,
    error: null
};

// Basic Authentication Middleware
const basicAuth = (req, res, next) => {
    // Skip auth for health check endpoints (for Railway healthchecks)
    if (req.path === '/api/health') {
        return next();
    }
    // Skip auth for scrape status endpoint
    if (req.path === '/api/scrape/status') {
        return next();
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Restaurant Dashboard"');
        return res.status(401).send('Authentication required');
    }
    const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
    const [username, password] = credentials.split(':');
    if (username === process.env.AUTH_USERNAME && password === process.env.AUTH_PASSWORD) {
        return next();
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Restaurant Dashboard"');
    return res.status(401).send('Invalid credentials');
};

if (process.env.NODE_ENV === 'production') {
    app.use(basicAuth);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/import', importRoutes);

app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// Manual trigger - fire and forget, poll /api/scrape/status for result
app.post('/api/scrape/trigger', (req, res) => {
    const { date } = req.body;
    console.log('Manual scrape triggered for date: ' + (date || 'yesterday'));

    if (scrapeState.running) {
        return res.json({ success: false, message: 'Scrape already running', started: scrapeState.started });
    }

    scrapeState = { running: true, started: new Date().toISOString(), finished: null, result: null, error: null };

    runAllScrapers(date)
        .then(result => {
            scrapeState.result = result;
            scrapeState.running = false;
            scrapeState.finished = new Date().toISOString();
            console.log('Scrape completed successfully');
        })
        .catch(error => {
            scrapeState.error = { message: error.message, stack: error.stack };
            scrapeState.running = false;
            scrapeState.finished = new Date().toISOString();
            console.error('Scrape failed:', error);
        });

    res.json({ success: true, message: 'Scrape started', date: date || 'yesterday' });
});

// Status endpoint to check scrape results
app.get('/api/scrape/status', (req, res) => {
    res.json(scrapeState);
});

if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../dist/frontend')));
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../dist/frontend/index.html'));
    });
}

async function startServer() {
    try {
        await initDb();
        console.log('Database initialized');
        cron.schedule('30 5 * * *', async () => {
            console.log('Running scheduled scrape...');
            try { await runAllScrapers(); } catch (error) { console.error('Scheduled scrape failed:', error); }
        });
        app.listen(PORT, '0.0.0.0', () => {
            console.log('Server running on port ' + PORT);
            console.log('Environment: ' + process.env.NODE_ENV);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
