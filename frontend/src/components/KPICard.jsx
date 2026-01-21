import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatCurrency, formatPercent } from '../utils/formatters';

export default function KPICard({
  title,
  value,
  change,
  target,
  format = 'currency',
  icon: Icon,
  inverse = false, // For metrics where lower is better (like costs)
}) {
  // Format the display value
  const displayValue = format === 'currency'
    ? formatCurrency(value, { compact: true })
    : format === 'percent'
    ? formatPercent(value)
    : value;

  // Determine trend
  const hasChange = change !== null && change !== undefined;
  const isPositive = inverse ? change < 0 : change > 0;
  const isNegative = inverse ? change > 0 : change < 0;

  // Target comparison
  const hasTarget = target !== null && target !== undefined;
  const actualPercent = typeof value === 'number' && format === 'percent' ? value : null;
  const isOverTarget = hasTarget && actualPercent !== null && actualPercent > target;

  return (
    <div className="card group hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between mb-3">
        <span className="card-header">{title}</span>
        {Icon && (
          <div className="p-2 bg-brand-50 rounded-lg group-hover:bg-brand-100 transition-colors">
            <Icon className="w-5 h-5 text-brand-600" />
          </div>
        )}
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="kpi-value">{displayValue}</div>

          {hasChange && (
            <div className={`kpi-change flex items-center gap-1 mt-1 ${
              isPositive ? 'positive' : isNegative ? 'negative' : 'text-slate-500'
            }`}>
              {isPositive ? (
                <TrendingUp className="w-4 h-4" />
              ) : isNegative ? (
                <TrendingDown className="w-4 h-4" />
              ) : (
                <Minus className="w-4 h-4" />
              )}
              <span>{Math.abs(change).toFixed(1)}% vs last week</span>
            </div>
          )}
        </div>

        {hasTarget && format === 'percent' && (
          <div className="text-right">
            <div className={`text-sm font-medium ${
              isOverTarget ? (inverse ? 'text-green-600' : 'text-red-600') : 'text-green-600'
            }`}>
              Target: {formatPercent(target)}
            </div>
            <div className="w-24 h-2 mt-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isOverTarget ? (inverse ? 'bg-green-500' : 'bg-red-500') : 'bg-green-500'
                }`}
                style={{ width: `${Math.min((actualPercent / target) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
