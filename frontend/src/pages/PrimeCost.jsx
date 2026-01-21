import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PieChart, DollarSign, Users, TrendingUp, AlertTriangle, Target } from 'lucide-react';
import { api } from '../utils/api';
import KPICard from '../components/KPICard';
import PeriodSelector from '../components/PeriodSelector';
import RestaurantSelector from '../components/RestaurantSelector';
import PrimeCostChart from '../components/charts/PrimeCostChart';
import RestaurantComparisonTable from '../components/RestaurantComparisonTable';
import { formatCurrency, formatPercent, formatDate } from '../utils/formatters';

export default function PrimeCost() {
  const [period, setPeriod] = useState('7d');
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);

  const { data: primeCostData, isLoading } = useQuery({
    queryKey: ['prime-cost', period, selectedRestaurant],
    queryFn: () => api.getPrimeCostData(period, selectedRestaurant),
  });

  const { data: restaurants } = useQuery({
    queryKey: ['restaurants'],
    queryFn: api.getRestaurants,
  });

  const summary = primeCostData?.summary || {};
  const trend = primeCostData?.trend || [];
  const byRestaurant = primeCostData?.byRestaurant || [];
  const alerts = primeCostData?.alerts || [];

  const isOverTarget = (summary.prime_cost_percent || 0) > 65;
  const varianceFromTarget = (summary.prime_cost_percent || 0) - 65;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Prime Cost Analysis</h1>
          <p className="text-slate-500 mt-1">Food + Labor = Prime Cost (Target: 65%)</p>
        </div>

        <div className="flex items-center gap-3">
          <RestaurantSelector
            restaurants={restaurants || []}
            value={selectedRestaurant}
            onChange={setSelectedRestaurant}
          />
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          title="Net Sales"
          value={summary.total_sales}
          format="currency"
          icon={DollarSign}
        />
        <KPICard
          title="COGS"
          value={summary.cogs_percent}
          target={32}
          format="percent"
          icon={PieChart}
          inverse={true}
        />
        <KPICard
          title="Labor"
          value={summary.labor_percent}
          target={30}
          format="percent"
          icon={Users}
          inverse={true}
        />
        <KPICard
          title="Prime Cost"
          value={summary.prime_cost_percent}
          target={65}
          format="percent"
          icon={Target}
          inverse={true}
        />
        <KPICard
          title="Gross Profit"
          value={summary.gross_profit_percent}
          format="percent"
          icon={TrendingUp}
        />
      </div>

      {/* Prime Cost Summary Card */}
      <div className={`rounded-xl p-6 ${isOverTarget ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-full ${isOverTarget ? 'bg-red-100' : 'bg-green-100'}`}>
              {isOverTarget ? (
                <AlertTriangle className={`w-8 h-8 text-red-600`} />
              ) : (
                <Target className={`w-8 h-8 text-green-600`} />
              )}
            </div>
            <div>
              <h3 className={`text-lg font-semibold ${isOverTarget ? 'text-red-800' : 'text-green-800'}`}>
                {isOverTarget ? 'Prime Cost Over Target' : 'Prime Cost On Track'}
              </h3>
              <p className={`text-sm ${isOverTarget ? 'text-red-600' : 'text-green-600'}`}>
                {isOverTarget
                  ? `${formatPercent(Math.abs(varianceFromTarget))} above the 65% target`
                  : `${formatPercent(Math.abs(varianceFromTarget))} below the 65% target`
                }
              </p>
            </div>
          </div>

          <div className="flex gap-6">
            <div className="text-center">
              <div className={`text-3xl font-bold ${isOverTarget ? 'text-red-700' : 'text-green-700'}`}>
                {formatPercent(summary.prime_cost_percent)}
              </div>
              <div className="text-sm text-slate-500">Prime Cost</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">
                {formatPercent(summary.labor_percent)}
              </div>
              <div className="text-sm text-slate-500">Labor</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-600">
                {formatPercent(summary.cogs_percent)}
              </div>
              <div className="text-sm text-slate-500">COGS</div>
            </div>
          </div>
        </div>

        {/* Visual breakdown bar */}
        <div className="mt-6">
          <div className="h-6 rounded-full overflow-hidden flex bg-white border border-slate-200">
            <div
              className="bg-blue-500 flex items-center justify-center text-xs font-medium text-white"
              style={{ width: `${summary.labor_percent || 0}%` }}
            >
              {(summary.labor_percent || 0) > 10 && 'Labor'}
            </div>
            <div
              className="bg-orange-500 flex items-center justify-center text-xs font-medium text-white"
              style={{ width: `${summary.cogs_percent || 0}%` }}
            >
              {(summary.cogs_percent || 0) > 10 && 'COGS'}
            </div>
            <div
              className="bg-green-500 flex items-center justify-center text-xs font-medium text-white"
              style={{ width: `${summary.gross_profit_percent || 0}%` }}
            >
              {(summary.gross_profit_percent || 0) > 10 && 'Profit'}
            </div>
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>0%</span>
            <span className="text-red-500 font-medium">Target: 65%</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-amber-800">Locations Over Target ({alerts.length})</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {alerts.slice(0, 9).map((alert, index) => (
              <div key={index} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100">
                <div>
                  <span className="text-sm font-medium text-slate-700">{alert.restaurant_name}</span>
                  <span className="text-xs text-slate-500 ml-2">{formatDate(alert.business_date)}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-red-600">{formatPercent(alert.prime_cost_percent)}</span>
                  <span className="text-xs text-slate-500 block">
                    +{formatPercent(alert.variance_percent)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prime Cost Trend Chart */}
      <div className="card">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Prime Cost Trend</h3>
        <PrimeCostChart data={trend} height={350} showTarget={true} />
      </div>

      {/* Location Performance */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Performance by Location</h3>
          <span className="text-sm text-slate-500">
            Sorted by Prime Cost % (lowest first)
          </span>
        </div>
        <RestaurantComparisonTable data={byRestaurant} type="primeCost" />
      </div>

      {/* Daily Breakdown */}
      <div className="card">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Daily Prime Cost Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="table-header text-left py-3 px-4">Date</th>
                <th className="table-header text-right py-3 px-4">Net Sales</th>
                <th className="table-header text-right py-3 px-4">COGS</th>
                <th className="table-header text-right py-3 px-4">Labor</th>
                <th className="table-header text-right py-3 px-4">Prime Cost</th>
                <th className="table-header text-right py-3 px-4">Prime %</th>
                <th className="table-header text-right py-3 px-4">vs Target</th>
              </tr>
            </thead>
            <tbody>
              {trend.slice().reverse().map((day, index) => {
                const primePercent = day.prime_cost_percent || 0;
                const variance = primePercent - 65;
                const isOver = primePercent > 65;

                return (
                  <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium">{formatDate(day.business_date, 'medium')}</td>
                    <td className="py-3 px-4 text-right">{formatCurrency(day.net_sales)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-orange-600">{formatPercent(day.cogs_percent)}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-blue-600">{formatPercent(day.labor_percent)}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold">{formatCurrency(day.prime_cost)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-bold ${isOver ? 'text-red-600' : 'text-green-600'}`}>
                        {formatPercent(primePercent)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`text-sm font-medium ${isOver ? 'text-red-600' : 'text-green-600'}`}>
                        {isOver ? '+' : ''}{formatPercent(variance)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
