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

// Basic Authentication Middleware
const basicAuth = (req, res, next) => {
        // Skip auth for health check endpoint
        if (req.path === '/health' || req.path === '/api/health') {
                    return next();
        }

        // Check if auth is configured
        const authUser = process.env.AUTH_USERNAME;
        const authPass = process.env.AUTH_PASSWORD;

        if (!authUser || !authPass) {
                    // No auth configured, allow access
            return next();
        }

        // Check for Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Basic ')) {
                    res.setHeader('WWW-Authenticate', 'Basic realm="Restaurant Dashboard"');
                    return res.status(401).send('Authentication required');
        }

        // Decode credentials
        const base64Credentials = authHeader.split(' ')[1];
        const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
        const [username, password] = credentials.split(':');

        // Validate credentials
        if (username === authUser && password === authPass) {
                    return next();
        }

        res.setHeader('WWW-Authenticate', 'Basic realm="Restaurant Dashboard"');
        return res.status(401).send('Invalid credentials');
};

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Apply basic auth to all routes
app.use(basicAuth);

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/import', importRoutes);

// Manual scrape trigger endpoint
app.post('/api/scrape', async (req, res) => {
        try {
                    console.log('Manual scrape triggered');
                    const results = await runAllScrapers();
                    res.json({ success: true, results });
        } catch (error) {
                    console.error('Scrape failed:', error);
                    res.status(500).json({ success: false, error: error.message });
        }
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
        app.use(express.static(path.join(__dirname, '../../frontend/dist')));
        app.get('*', (req, res) => {
                    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
        });
}

// Initialize database and start server
async function startServer() {
        try {
                    // Initialize database
            await initDb();
                    console.log('Database initialized');

            // Schedule daily scrape at 1:30 AM CST (7:30 UTC)
            cron.schedule('30 7 * * *', async () => {
                            console.log('Running scheduled scrape at', new Date().toISOString());
                            try {
                                                await runAllScrapers();
                                                console.log('Scheduled scrape completed');
                            } catch (error) {
                                                console.error('Scheduled scrape failed:', error);
                            }
            });

            // Start server
            app.listen(PORT, () => {
                            console.log('Restaurant Dashboard API running on port', PORT);
                            console.log('Basic auth:', process.env.AUTH_USERNAME ? 'enabled' : 'disabled');
            });

        } catch (error) {
                    console.error('Failed to start server:', error);
                    process.exit(1);
        }
}

startServer();
