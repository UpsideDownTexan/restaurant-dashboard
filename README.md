# Restaurant Dashboard

A MarginEdge/Restaurant365-style analytics dashboard for tracking Prime Cost, Labor %, and Sales metrics across your restaurant locations.

## Features

- **Dashboard Overview**: Real-time KPIs for all 5 Dallas-area restaurants
- **Prime Cost Tracking**: Labor + COGS with 65% target benchmarking
- **Labor Analysis**: Labor % vs sales, overtime alerts, department breakdowns
- **Sales Analytics**: Daily trends, guest counts, check averages, revenue mix
- **Multi-Location Views**: Consolidated view + drill-down to individual locations
- **Automated Data Pulls**: Nightly syncs from Aloha Enterprise and NetChex

## Restaurants

- Mariano's Arlington
- Mariano's Dallas
- La Hacienda Ranch Frisco
- La Hacienda Ranch Plano
- La Hacienda Ranch Colleyville

## Tech Stack

- **Frontend**: React 18, Vite, TailwindCSS, Recharts, TanStack Query
- **Backend**: Node.js, Express, better-sqlite3
- **Automation**: Puppeteer for browser automation
- **Scheduling**: node-cron for daily data pulls

## Quick Start

### 1. Install Dependencies

```bash
npm run install:all
```

### 2. Configure Environment

Copy the example environment file and add your credentials:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your Aloha and NetChex credentials:

```env
ALOHA_URL=https://enterprise.alohaenterprise.com
ALOHA_USERNAME=your-username
ALOHA_PASSWORD=your-password

NETCHEX_URL=https://www.netchexonline.com
NETCHEX_USERNAME=your-username
NETCHEX_PASSWORD=your-password
```

### 3. Initialize Database

```bash
npm run db:init
```

### 4. Start Development Server

```bash
npm run dev
```

This starts both the backend (port 3001) and frontend (port 3000).

Open http://localhost:3000 to view the dashboard.

## Cloud Deployment (Railway)

Railway is the easiest option for deploying this application:

### Option 1: One-Click Deploy

1. Go to [Railway](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Connect your GitHub account and select this repository
4. Add environment variables in Railway's dashboard
5. Railway will automatically build and deploy

### Option 2: Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Deploy
railway up
```

### Environment Variables for Production

Set these in your Railway dashboard:

```
NODE_ENV=production
JWT_SECRET=your-secure-random-string
ALOHA_URL=...
ALOHA_USERNAME=...
ALOHA_PASSWORD=...
NETCHEX_URL=...
NETCHEX_USERNAME=...
NETCHEX_PASSWORD=...
ENABLE_SCRAPING=true
```

## Docker Deployment

```bash
# Build image
docker build -t restaurant-dashboard .

# Run with docker-compose
docker-compose up -d
```

## Data Import

### Automated (Recommended)

The system automatically pulls data from Aloha and NetChex daily at 1:30 AM CST.

### Manual Trigger

Use the Settings page to trigger a manual sync, or call the API:

```bash
curl -X POST http://localhost:3001/api/scrape/trigger
```

### CSV Import

If you prefer manual data import, use the import API:

```bash
# Sales data
curl -X POST http://localhost:3001/api/import/sales \
  -H "Content-Type: application/json" \
  -d '{"data": [{"restaurant_id": 1, "business_date": "2026-01-20", "net_sales": 15000, ...}]}'

# Labor data
curl -X POST http://localhost:3001/api/import/labor \
  -H "Content-Type: application/json" \
  -d '{"data": [{"restaurant_id": 1, "business_date": "2026-01-20", "total_labor_cost": 3500, ...}]}'
```

## Customizing Scrapers

The scrapers in `backend/src/scrapers/` are templates. You'll need to customize the CSS selectors based on your actual Aloha and NetChex interfaces:

1. Open your Aloha/NetChex in a browser
2. Use browser DevTools to inspect the elements
3. Update the selectors in `AlohaScraper.js` and `NetchexScraper.js`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/dashboard/summary` | GET | Main dashboard KPIs |
| `/api/dashboard/sales` | GET | Sales data |
| `/api/dashboard/labor` | GET | Labor data |
| `/api/dashboard/prime-cost` | GET | Prime cost analysis |
| `/api/dashboard/restaurants` | GET | List all restaurants |
| `/api/dashboard/restaurant/:id` | GET | Single restaurant detail |
| `/api/import/sales` | POST | Import sales data |
| `/api/import/labor` | POST | Import labor data |
| `/api/import/food-cost` | POST | Import COGS data |
| `/api/scrape/trigger` | POST | Manual scrape trigger |

## Future Enhancements

- [ ] EDI vendor data integration
- [ ] Inventory tracking
- [ ] Menu engineering analysis
- [ ] Mobile app
- [ ] Email alerts for threshold breaches
- [ ] Budget vs actual comparisons
- [ ] Year-over-year analytics

## Support

For issues or questions, please open a GitHub issue.
