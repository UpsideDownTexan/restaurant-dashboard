const API_BASE = '/api';

async function fetchApi(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || 'API request failed');
  }

  return response.json();
}

export const api = {
  // Dashboard endpoints
  getDashboardSummary: (period = '7d', restaurantId = null) => {
    const params = new URLSearchParams({ period });
    if (restaurantId) params.append('restaurant_id', restaurantId);
    return fetchApi(`/dashboard/summary?${params}`);
  },

  getSalesData: (period = '7d', restaurantId = null) => {
    const params = new URLSearchParams({ period });
    if (restaurantId) params.append('restaurant_id', restaurantId);
    return fetchApi(`/dashboard/sales?${params}`);
  },

  getLaborData: (period = '7d', restaurantId = null) => {
    const params = new URLSearchParams({ period });
    if (restaurantId) params.append('restaurant_id', restaurantId);
    return fetchApi(`/dashboard/labor?${params}`);
  },

  getPrimeCostData: (period = '7d', restaurantId = null) => {
    const params = new URLSearchParams({ period });
    if (restaurantId) params.append('restaurant_id', restaurantId);
    return fetchApi(`/dashboard/prime-cost?${params}`);
  },

  getRestaurants: () => fetchApi('/dashboard/restaurants'),

  getRestaurantDetail: (id, period = '7d') => {
    const params = new URLSearchParams({ period });
    return fetchApi(`/dashboard/restaurant/${id}?${params}`);
  },

  // Import endpoints
  importSales: (data) => fetchApi('/import/sales', {
    method: 'POST',
    body: JSON.stringify({ data }),
  }),

  importLabor: (data) => fetchApi('/import/labor', {
    method: 'POST',
    body: JSON.stringify({ data }),
  }),

  importFoodCost: (data) => fetchApi('/import/food-cost', {
    method: 'POST',
    body: JSON.stringify({ data }),
  }),

  importBulk: (data) => fetchApi('/import/bulk', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Trigger manual scrape
  triggerScrape: (date = null) => fetchApi('/scrape/trigger', {
    method: 'POST',
    body: JSON.stringify({ date }),
  }),

  // Health check
  healthCheck: () => fetchApi('/health'),
};

export default api;
