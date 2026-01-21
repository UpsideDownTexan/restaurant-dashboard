import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Clock, DollarSign, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { api } from '../utils/api';
import KPICard from '../components/KPICard';
import PeriodSelector from '../components/PeriodSelector';
import RestaurantSelector from '../components/RestaurantSelector';
import LaborChart from '../components/charts/LaborChart';
import { formatCurrency, formatPercent, formatHours, formatDate } from '../utils/formatters';

export default function Labor() {
  const [period, setPeriod] = useState('7d');
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);

  const { data: laborData, isLoading } = useQuery({
    queryKey: ['labor', period, selectedRestaurant],
    queryFn: () => api.getLaborData(period, selectedRestaurant),
  });

  const { data: restaurants } = useQuery({
    queryKey: ['restaurants'],
    queryFn: api.getRestaurants,
  });

  const daily = laborData?.daily || [];
  const byRestaurant = laborData?.byRestaurant || [];
  const overtimeAlerts = laborData?.alerts?.overtime || [];

  // Calculate totals
  const totals = daily.reduce((acc, day) => ({
    laborCost: acc.laborCost + (day.labor_cost || 0),
    laborHours: acc.laborHours + (day.labor_hours || 0),
    sales: acc.sales + (day.net_sales || 0),
  }), { laborCost: 0, laborHours: 0, sales: 0 });

  const avgLaborPercent = totals.sales > 0 ? (totals.laborCost / totals.sales) * 100 : 0;
  const salesPerLaborHour = totals.laborHours > 0 ? totals.sales / totals.laborHours : 0;

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
          <h1 className="text-2xl font-bold text-slate-900">Labor Analysis</h1>
          <p className="text-slate-500 mt-1">Monitor labor costs, hours, and efficiency</p>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Labor Cost"
          value={totals.laborCost}
          format="currency"
          icon={DollarSign}
        />
        <KPICard
          title="Labor %"
          value={avgLaborPercent}
          target={30}
          format="percent"
          icon={Users}
          inverse={true}
        />
        <KPICard
          title="Total Hours"
          value={totals.laborHours}
          format="number"
          icon={Clock}
        />
        <KPICard
          title="Sales / Labor Hour"
          value={salesPerLaborHour}
          format="currency"
          icon={TrendingUp}
        />
      </div>

      {/* Overtime Alerts */}
      {overtimeAlerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-amber-800">Overtime Alerts</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {overtimeAlerts.slice(0, 6).map((alert, index) => (
              <div key={index} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100">
                <div>
                  <span className="text-sm font-medium text-slate-700">{alert.restaurant_name}</span>
                  <span className="text-xs text-slate-500 ml-2">{formatDate(alert.business_date)}</span>
                </div>
                <span className="text-sm font-bold text-amber-600">{formatHours(alert.overtime_hours)} OT</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Labor vs Sales Chart */}
      <div className="card">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Labor vs Sales</h3>
        <LaborChart data={daily} height={320} showSales={true} />
      </div>

      {/* Labor Breakdown by Day */}
      <div className="card">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Daily Labor Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="table-header text-left py-3 px-4">Date</th>
                <th className="table-header text-right py-3 px-4">Net Sales</th>
                <th className="table-header text-right py-3 px-4">Labor Cost</th>
                <th className="table-header text-right py-3 px-4">Labor %</th>
                <th className="table-header text-right py-3 px-4">Hours</th>
                <th className="table-header text-right py-3 px-4">$/Hour</th>
                <th className="table-header text-right py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((day, index) => {
                const laborPercent = day.labor_percent || 0;
                const isOver = laborPercent > 30;
                const isWarning = laborPercent > 27 && laborPercent <= 30;
                const salesPerHour = day.labor_hours > 0 ? day.net_sales / day.labor_hours : 0;

                return (
                  <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium">{formatDate(day.business_date, 'medium')}</td>
                    <td className="py-3 px-4 text-right">{formatCurrency(day.net_sales)}</td>
                    <td className="py-3 px-4 text-right font-semibold">{formatCurrency(day.labor_cost)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-semibold ${isOver ? 'text-red-600' : isWarning ? 'text-yellow-600' : 'text-green-600'}`}>
                        {formatPercent(laborPercent)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">{formatHours(day.labor_hours)}</td>
                    <td className="py-3 px-4 text-right">{formatCurrency(salesPerHour)}</td>
                    <td className="py-3 px-4 text-right">
                      {isOver ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium">
                          <TrendingUp className="w-3 h-3" />
                          Over
                        </span>
                      ) : isWarning ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-50 text-yellow-700 rounded-full text-xs font-medium">
                          Warning
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                          <TrendingDown className="w-3 h-3" />
                          Good
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Location Comparison */}
      {!selectedRestaurant && byRestaurant.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Labor by Location</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="table-header text-left py-3 px-4">Location</th>
                  <th className="table-header text-right py-3 px-4">Labor Cost</th>
                  <th className="table-header text-right py-3 px-4">Labor %</th>
                  <th className="table-header text-right py-3 px-4">Total Hours</th>
                  <th className="table-header text-right py-3 px-4">OT Hours</th>
                  <th className="table-header text-right py-3 px-4">Sales / Labor Hr</th>
                </tr>
              </thead>
              <tbody>
                {byRestaurant.map((r, index) => {
                  const laborPercent = r.labor_percent || 0;
                  const isOver = laborPercent > 30;

                  return (
                    <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${r.brand === 'Marianos' ? 'bg-blue-500' : 'bg-orange-500'}`} />
                          <span className="font-medium">{r.restaurant_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold">{formatCurrency(r.total_labor_cost)}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={`font-semibold ${isOver ? 'text-red-600' : 'text-green-600'}`}>
                          {formatPercent(laborPercent)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">{formatHours(r.total_hours)}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={r.overtime_hours > 10 ? 'text-amber-600 font-medium' : ''}>
                          {formatHours(r.overtime_hours)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">{formatCurrency(r.sales_per_labor_hour)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
