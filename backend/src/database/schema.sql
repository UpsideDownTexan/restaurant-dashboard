-- Restaurant Dashboard Database Schema
-- Designed to mimic MarginEdge/Restaurant365 data structure

-- Restaurants/Locations table
CREATE TABLE IF NOT EXISTS restaurants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        short_name TEXT NOT NULL,
        aloha_store_id TEXT,
        netchex_company_name TEXT,
        address TEXT,
        city TEXT,
        state TEXT DEFAULT 'TX',
        brand TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

-- Daily Sales Summary (from Aloha POS)
CREATE TABLE IF NOT EXISTS daily_sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurant_id INTEGER NOT NULL,
        business_date DATE NOT NULL,
        gross_sales REAL DEFAULT 0,
        net_sales REAL DEFAULT 0,
        comps REAL DEFAULT 0,
        voids REAL DEFAULT 0,
        discounts REAL DEFAULT 0,
        promos REAL DEFAULT 0,
        tax REAL DEFAULT 0,
        tips REAL DEFAULT 0,
        guest_count INTEGER DEFAULT 0,
        check_count INTEGER DEFAULT 0,
        avg_check REAL DEFAULT 0,
        ppa REAL DEFAULT 0,
        labor_percent REAL DEFAULT 0,
        food_sales REAL DEFAULT 0,
        beverage_sales REAL DEFAULT 0,
        alcohol_sales REAL DEFAULT 0,
        data_source TEXT DEFAULT 'aloha',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
        UNIQUE(restaurant_id, business_date)
    );

-- Daily Labor Summary (from NetChex)
CREATE TABLE IF NOT EXISTS daily_labor (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurant_id INTEGER NOT NULL,
        business_date DATE NOT NULL,
        total_hours REAL DEFAULT 0,
        regular_hours REAL DEFAULT 0,
        overtime_hours REAL DEFAULT 0,
        total_wages REAL DEFAULT 0,
        regular_wages REAL DEFAULT 0,
        overtime_wages REAL DEFAULT 0,
        employee_count INTEGER DEFAULT 0,
        foh_hours REAL DEFAULT 0,
        boh_hours REAL DEFAULT 0,
        foh_wages REAL DEFAULT 0,
        boh_wages REAL DEFAULT 0,
        data_source TEXT DEFAULT 'netchex',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
        UNIQUE(restaurant_id, business_date)
    );

-- Prime Cost Calculations (computed view)
CREATE TABLE IF NOT EXISTS daily_prime_cost (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurant_id INTEGER NOT NULL,
        business_date DATE NOT NULL,
        net_sales REAL DEFAULT 0,
        labor_cost REAL DEFAULT 0,
        labor_percent REAL DEFAULT 0,
        food_cost REAL DEFAULT 0,
        food_cost_percent REAL DEFAULT 0,
        prime_cost REAL DEFAULT 0,
        prime_cost_percent REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
        UNIQUE(restaurant_id, business_date)
    );

-- Scrape log for tracking data collection
CREATE TABLE IF NOT EXISTS scrape_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scrape_type TEXT NOT NULL,
        business_date DATE,
        status TEXT DEFAULT 'pending',
        records_processed INTEGER DEFAULT 0,
        error_message TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        duration_seconds INTEGER DEFAULT 0
    );

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'viewer',
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
    );

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_daily_sales_date ON daily_sales(business_date);
CREATE INDEX IF NOT EXISTS idx_daily_sales_restaurant ON daily_sales(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_daily_labor_date ON daily_labor(business_date);
CREATE INDEX IF NOT EXISTS idx_daily_labor_restaurant ON daily_labor(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_scrape_log_type ON scrape_log(scrape_type);
CREATE INDEX IF NOT EXISTS idx_scrape_log_date ON scrape_log(business_date);
