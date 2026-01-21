import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowDownRight, TrendingUp, AlertTriangle } from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber } from '../utils/formatters';

export default function RestaurantComparisonTable({
  data = [],
  type = 'primeCost', // 'primeCost', 'sales', 'labor'
}) {
  if (!data.length) {
    return (
      <div className="text-center py-8 text-slate-500">
        No data available for this period
      </div>
    );
  }

  // Sort by prime cost % or relevant metric
  const sortedData = [...data].sort((a, b) => {
    if (type === 'primeCost') return (a.prime_cost_percent || 0) - (b.prime_cost_percent || 0);
    if (type === 'labor') return (a.labor_percent || 0) - (b.labor_percent || 0);
    return (b.total_net_sales || b.total_sales || 0) - (a.total_net_sales || a.total_sales || 0);
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="table-header text-left py-3 px-4">Location</th>
            <th className="table-header text-right py-3 px-4">Net Sales</th>
            {(type === 'primeCost' || type === 'labor') && (
              <>
                <th className="table-header text-right py-3 px-4">Labor %</th>
                <th className="table-header text-right py-3 px-4">COGS %</th>
              </>
            )}
            {type === 'primeCost' && (
              <th className="table-header text-right py-3 px-4">Prime Cost %</th>
            )}
            {type === 'sales' && (
              <>
                <th className="table-header text-right py-3 px-4">Guests</th>
                <th className="table-header text-right py-3 px-4">Avg Check</th>
              </>
            )}
            <th className="table-header text-right py-3 px-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {sortedData.map((restaurant, index) => {
            const primePercent = restaurant.prime_cost_percent || 0;
            const laborPercent = restaurant.labor_percent || 0;
            const cogsPercent = restaurant.cogs_percent || 0;
            const isOverTarget = primePercent > 65;
            const isWarning = primePercent > 60 && primePercent <= 65;

            return (
              <tr
                key={restaurant.restaurant_id || index}
                className="restaurant-row border-b border-slate-100"
              >
                <td className="py-4 px-4">
                  <Link
                    to={`/locations/${restaurant.restaurant_id}`}
                    className="group"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          restaurant.brand === 'Marianos' ? 'bg-blue-500' : 'bg-orange-500'
                        }`}
                      />
                      <div>
                        <span className="font-medium text-slate-900 group-hover:text-brand-600 transition-colors">
                          {restaurant.restaurant_name || restaurant.short_name}
                        </span>
                        <div className="text-xs text-slate-500">{restaurant.short_name}</div>
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="py-4 px-4 text-right">
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(restaurant.total_sales || restaurant.total_net_sales, { compact: true })}
                  </span>
                </td>
                {(type === 'primeCost' || type === 'labor') && (
                  <>
                    <td className="py-4 px-4 text-right">
                      <span className={`font-medium ${laborPercent > 30 ? 'text-red-600' : 'text-slate-700'}`}>
                        {formatPercent(laborPercent)}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className={`font-medium ${cogsPercent > 32 ? 'text-red-600' : 'text-slate-700'}`}>
                        {formatPercent(cogsPercent)}
                      </span>
                    </td>
                  </>
                )}
                {type === 'primeCost' && (
                  <td className="py-4 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className={`font-semibold ${
                        isOverTarget ? 'text-red-600' : isWarning ? 'text-yellow-600' : 'text-green-600'
                      }`}>
                        {formatPercent(primePercent)}
                      </span>
                      <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            isOverTarget ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min((primePercent / 70) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                )}
                {type === 'sales' && (
                  <>
                    <td className="py-4 px-4 text-right">
                      <span className="text-slate-700">
                        {formatNumber(restaurant.total_guests)}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className="text-slate-700">
                        {formatCurrency(restaurant.avg_per_guest)}
                      </span>
                    </td>
                  </>
                )}
                <td className="py-4 px-4 text-right">
                  {isOverTarget ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      Over Target
                    </span>
                  ) : isWarning ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-50 text-yellow-700 rounded-full text-xs font-medium">
                      <TrendingUp className="w-3 h-3" />
                      Warning
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                      <ArrowDownRight className="w-3 h-3" />
                      On Track
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
