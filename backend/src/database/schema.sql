-- Restaurant Dashboard Database Schema
-- Designed to mimic MarginEdge/Restaurant365 data structure

-- Restaurants/Locations table
CREATE TABLE IF NOT EXISTS restaurants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    aloha_store_id TEXT,
    netchex_location_id TEXT,
    address TEXT,
    city TEXT,
    state TEXT DEFAULT 'TX',
    brand TEXT, -- 'Marianos' or 'La Hacienda Ranch'
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Daily Sales Summary (from Aloha POS)
CREATE TABLE IF NOT EXISTS daily_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    business_date DATE NOT NULL,

    -- Sales Metrics
    gross_sales DECIMAL(12,2) DEFAULT 0,
    net_sales DECIMAL(12,2) DEFAULT 0,
    comps DECIMAL(12,2) DEFAULT 0,
    discounts DECIMAL(12,2) DEFAULT 0,
    voids DECIMAL(12,2) DEFAULT 0,
    refunds DECIMAL(12,2) DEFAULT 0,

    -- Payment Breakdown
    cash_sales DECIMAL(12,2) DEFAULT 0,
    credit_card_sales DECIMAL(12,2) DEFAULT 0,
    gift_card_sales DECIMAL(12,2) DEFAULT 0,
    other_payments DECIMAL(12,2) DEFAULT 0,

    -- Guest Metrics
    guest_count INTEGER DEFAULT 0,
    check_count INTEGER DEFAULT 0,
    avg_check DECIMAL(8,2) DEFAULT 0,
    avg_guest_spend DECIMAL(8,2) DEFAULT 0,

    -- Revenue Centers (typical restaurant categories)
    food_sales DECIMAL(12,2) DEFAULT 0,
    beverage_sales DECIMAL(12,2) DEFAULT 0,
    alcohol_sales DECIMAL(12,2) DEFAULT 0,

    -- Time-based breakdown (JSON for flexibility)
    hourly_sales TEXT, -- JSON: {"10": 500.00, "11": 750.00, ...}
    daypart_sales TEXT, -- JSON: {"lunch": 2500, "dinner": 5000, ...}

    -- Metadata
    data_source TEXT DEFAULT 'aloha',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
    UNIQUE(restaurant_id, business_date)
);

-- Daily Labor Summary (from NetChex + Aloha)
CREATE TABLE IF NOT EXISTS daily_labor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    business_date DATE NOT NULL,

    -- Hours Worked
    total_hours DECIMAL(10,2) DEFAULT 0,
    regular_hours DECIMAL(10,2) DEFAULT 0,
    overtime_hours DECIMAL(10,2) DEFAULT 0,

    -- Labor Costs
    total_labor_cost DECIMAL(12,2) DEFAULT 0,
    regular_wages DECIMAL(12,2) DEFAULT 0,
    overtime_wages DECIMAL(12,2) DEFAULT 0,

    -- Labor by Category
    foh_hours DECIMAL(10,2) DEFAULT 0, -- Front of House
    foh_cost DECIMAL(12,2) DEFAULT 0,
    boh_hours DECIMAL(10,2) DEFAULT 0, -- Back of House
    boh_cost DECIMAL(12,2) DEFAULT 0,
    management_hours DECIMAL(10,2) DEFAULT 0,
    management_cost DECIMAL(12,2) DEFAULT 0,

    -- Payroll Taxes & Benefits (estimated or from NetChex)
    payroll_taxes DECIMAL(12,2) DEFAULT 0,
    benefits_cost DECIMAL(12,2) DEFAULT 0,
    total_labor_burden DECIMAL(12,2) DEFAULT 0, -- Total loaded labor cost

    -- Employee Count
    employee_count INTEGER DEFAULT 0,

    -- Calculated Metrics (stored for quick access)
    labor_percent DECIMAL(5,2) DEFAULT 0, -- Labor as % of sales
    hourly_labor_data TEXT, -- JSON for hourly breakdown

    -- Metadata
    data_source TEXT DEFAULT 'netchex',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
    UNIQUE(restaurant_id, business_date)
);

-- Food Cost / COGS (for Prime Cost calculation)
CREATE TABLE IF NOT EXISTS daily_food_cost (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    business_date DATE NOT NULL,

    -- Cost of Goods Sold
    food_cost DECIMAL(12,2) DEFAULT 0,
    beverage_cost DECIMAL(12,2) DEFAULT 0,
    alcohol_cost DECIMAL(12,2) DEFAULT 0,
    total_cogs DECIMAL(12,2) DEFAULT 0,

    -- Percentages (calculated)
    food_cost_percent DECIMAL(5,2) DEFAULT 0,
    beverage_cost_percent DECIMAL(5,2) DEFAULT 0,
    total_cogs_percent DECIMAL(5,2) DEFAULT 0,

    -- Inventory-related (for future EDI integration)
    beginning_inventory DECIMAL(12,2),
    ending_inventory DECIMAL(12,2),
    purchases DECIMAL(12,2),

    -- Metadata
    data_source TEXT DEFAULT 'manual', -- Will be 'edi' when vendor data integrated
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
    UNIQUE(restaurant_id, business_date)
);

-- Prime Cost Summary (calculated daily)
CREATE TABLE IF NOT EXISTS daily_prime_cost (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    business_date DATE NOT NULL,

    -- Sales
    net_sales DECIMAL(12,2) DEFAULT 0,

    -- Prime Cost Components
    total_cogs DECIMAL(12,2) DEFAULT 0,
    total_labor DECIMAL(12,2) DEFAULT 0,
    prime_cost DECIMAL(12,2) DEFAULT 0,

    -- Percentages
    cogs_percent DECIMAL(5,2) DEFAULT 0,
    labor_percent DECIMAL(5,2) DEFAULT 0,
    prime_cost_percent DECIMAL(5,2) DEFAULT 0,

    -- Targets & Variance
    target_prime_cost_percent DECIMAL(5,2) DEFAULT 65.00,
    variance_percent DECIMAL(5,2) DEFAULT 0,
    variance_dollars DECIMAL(12,2) DEFAULT 0,

    -- Gross Profit
    gross_profit DECIMAL(12,2) DEFAULT 0,
    gross_profit_percent DECIMAL(5,2) DEFAULT 0,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
    UNIQUE(restaurant_id, business_date)
);

-- Hourly Sales Detail (for intraday analysis)
CREATE TABLE IF NOT EXISTS hourly_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    business_date DATE NOT NULL,
    hour INTEGER NOT NULL, -- 0-23

    net_sales DECIMAL(10,2) DEFAULT 0,
    guest_count INTEGER DEFAULT 0,
    check_count INTEGER DEFAULT 0,
    labor_hours DECIMAL(6,2) DEFAULT 0,
    labor_cost DECIMAL(10,2) DEFAULT 0,

    -- Calculated
    sales_per_labor_hour DECIMAL(8,2) DEFAULT 0,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
    UNIQUE(restaurant_id, business_date, hour)
);

-- Scrape Log (track data pull history)
CREATE TABLE IF NOT EXISTS scrape_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scrape_type TEXT NOT NULL, -- 'aloha', 'netchex', 'edi'
    restaurant_id INTEGER,
    business_date DATE,
    status TEXT NOT NULL, -- 'success', 'failed', 'partial'
    records_processed INTEGER DEFAULT 0,
    error_message TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    duration_seconds INTEGER,

    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
);

-- User accounts for dashboard access
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'viewer', -- 'admin', 'manager', 'viewer'
    restaurant_access TEXT, -- JSON array of restaurant IDs, null = all
    is_active INTEGER DEFAULT 1,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Dashboard preferences per user
CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    default_view TEXT DEFAULT 'consolidated', -- 'consolidated' or specific restaurant
    date_range_default TEXT DEFAULT '7d', -- '1d', '7d', '30d', 'mtd', 'ytd'
    dashboard_widgets TEXT, -- JSON config for widget layout
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_daily_sales_date ON daily_sales(business_date);
CREATE INDEX IF NOT EXISTS idx_daily_sales_restaurant ON daily_sales(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_daily_labor_date ON daily_labor(business_date);
CREATE INDEX IF NOT EXISTS idx_daily_labor_restaurant ON daily_labor(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_daily_prime_date ON daily_prime_cost(business_date);
CREATE INDEX IF NOT EXISTS idx_hourly_sales_date ON hourly_sales(business_date);
