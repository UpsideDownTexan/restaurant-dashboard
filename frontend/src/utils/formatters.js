/**
 * Format currency values
 */
export function formatCurrency(value, options = {}) {
  const {
    minimumFractionDigits = 0,
    maximumFractionDigits = 0,
    compact = false,
  } = options;

  if (value === null || value === undefined) return '--';

  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (compact && Math.abs(num) >= 1000) {
    if (Math.abs(num) >= 1000000) {
      return `$${(num / 1000000).toFixed(1)}M`;
    }
    return `$${(num / 1000).toFixed(1)}K`;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(num);
}

/**
 * Format percentage values
 */
export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined) return '--';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `${num.toFixed(decimals)}%`;
}

/**
 * Format number with thousands separator
 */
export function formatNumber(value, decimals = 0) {
  if (value === null || value === undefined) return '--';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Format hours (e.g., 45.5 -> "45.5 hrs")
 */
export function formatHours(value) {
  if (value === null || value === undefined) return '--';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `${num.toFixed(1)} hrs`;
}

/**
 * Format date for display
 */
export function formatDate(dateString, format = 'short') {
  if (!dateString) return '--';

  const date = new Date(dateString + 'T00:00:00');

  switch (format) {
    case 'full':
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    case 'medium':
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    case 'short':
    default:
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
  }
}

/**
 * Get color class based on value vs target
 */
export function getStatusColor(value, target, options = {}) {
  const { inverse = false, threshold = 5 } = options;

  if (value === null || value === undefined || target === null || target === undefined) {
    return 'text-slate-500';
  }

  const diff = inverse ? target - value : value - target;

  if (diff > threshold) {
    return inverse ? 'text-green-600' : 'text-red-600';
  } else if (diff < -threshold) {
    return inverse ? 'text-red-600' : 'text-green-600';
  }
  return 'text-yellow-600';
}

/**
 * Get background color class for metric bars
 */
export function getMetricBarColor(value, target, options = {}) {
  const { inverse = false, threshold = 5 } = options;

  if (value === null || value === undefined) return 'bg-slate-300';

  const diff = inverse ? target - value : value - target;

  if (diff > threshold) {
    return inverse ? 'bg-green-500' : 'bg-red-500';
  } else if (diff < -threshold) {
    return inverse ? 'bg-red-500' : 'bg-green-500';
  }
  return 'bg-yellow-500';
}

/**
 * Calculate percentage change
 */
export function calcPercentChange(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
