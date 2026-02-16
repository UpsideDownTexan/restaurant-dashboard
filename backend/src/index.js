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

// Apply auth to all routes in production
if (process.env.NODE_ENV === 'production') {
  app.use(basicAuth);
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: false
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

// Manual trigger for scrapers
app.post('/api/scrape/trigger', async (req, res) => {
  try {
    const { date } = req.body;
    console.log(`Manual scrape triggered for date: ${date || 'yesterday'}`);
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

// Synchronous scrape test - waits for result
app.post('/api/scrape/test', async (req, res) => {
  try {
    const { date } = req.body;
    console.log(`Synchronous scrape test for date: ${date || 'yesterday'}`);
    const result = await runAllScrapers(date);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Scrape test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Scrape status - check scrape_log table
app.get('/api/scrape/status', async (req, res) => {
  try {
    const { getDb } = await import('./database/db.js');
    const db = getDb();
    const logs = db.exec("SELECT * FROM scrape_log ORDER BY created_at DESC LIMIT 10");
    const restaurants = db.exec("SELECT id, restaurant_name, short_name FROM restaurants");
    const salesCount = db.exec("SELECT COUNT(*) as cnt FROM daily_sales");
    const laborCount = db.exec("SELECT COUNT(*) as cnt FROM daily_labor");
    res.json({
      scrape_logs: logs[0] || { columns: [], values: [] },
      restaurants: restaurants[0] || { columns: [], values: [] },
      sales_count: salesCount[0]?.values?.[0]?.[0] || 0,
      labor_count: laborCount[0]?.values?.[0]?.[0] || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist/frontend')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/frontend/index.html'));
  });
}

// Initialize database and start server
async function startServer() {
  try {
    await initDb();
    console.log('Database initialized');

    // Schedule daily scrape at 5:30 AM UTC (11:30 PM CST)
    cron.schedule('30 5 * * *', async () => {
      console.log('Running scheduled scrape...');
      try {
        await runAllScrapers();
      } catch (error) {
        console.error('Scheduled scrape failed:', error);
      }
    });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
