import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DollarSign,
  Users,
  
  TrendingUp,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { api } from '../utils/api';
import KPICard from '../components/KPICard';
import PeriodSelector from '../components/PeriodSelector';
import RestaurantSelector from '../components/RestaurantSelector';
import SalesChart from '../components/charts/SalesChart';
import RestaurantComparisonTable from '../components/RestaurantComparisonTable';
import { formatCurrency, formatPercent, formatDate } from '../utils/formatters';

export default function Dashboard() {
  const [period, setPeriod] = useState('today')
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);

  // Fetch dashboard data
  const { data: summary, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard-summary', period, selectedRestaurant],
    queryFn: () => api.getDashboardSummary(period, selectedRestaurant),
  });

  const { data: restaurants } = useQuery({
    queryKey: ['restaurants'],
    queryFn: api.getRestaurants,
  });


  const { data: salesData } = useQuery({
    queryKey: ['sales', period, selectedRestaurant],
    queryFn: () => api.getSalesData(period, selectedRestaurant),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        <h3 className="font-medium">Error loading dashboard</h3>
        <p className="text-sm mt-1">{error.message}</p>
        <button
          onClick={() => refetch()}
          className="mt-2 btn btn-secondary text-sm"
        >
          Try Again
        </button>
      </div>
    );
  }

  const kpis = summary?.kpis || {};
  const alerts = [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">
            {summary?.period?.startDate && summary?.period?.endDate
              ? `${formatDate(summary.period.startDate, 'medium')} - ${formatDate(summary.period.endDate, 'medium')}`
              : 'Overview of all locations'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <RestaurantSelector
            restaurants={restaurants || []}
            value={selectedRestaurant}
            onChange={setSelectedRestaurant}
          />
          <PeriodSelector value={period} onChange={setPeriod} />
          <button
            onClick={() => refetch()}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            title="Refresh data"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Net Sales"
          value={kpis.netSales?.value}
          change={kpis.netSales?.change}
          format="currency"
          icon={DollarSign}
        />
        <KPICard
          title="Labor Cost"
          value={kpis.laborCost?.percent}
          target={kpis.laborCost?.target || 30}
          format="percent"
          icon={Users}
          inverse={true}
        />
        <KPICard
          title="Gross Profit"
          value={kpis.grossProfit?.percent}
          format="percent"
          icon={TrendingUp}
        />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-amber-800">Prime Cost Alerts</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {alerts.slice(0, 6).map((alert, index) => (
              <div key={index} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100">
                <span className="text-sm font-medium text-slate-700">{alert.restaurant_name}</span>
                <span className="text-sm font-bold text-red-600">{formatPercent(alert.prime_cost_percent)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Trend */}
        <div className="card">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Sales Trend</h3>
          <SalesChart data={salesData?.daily || []} height={280} />        </div>
          
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Location Performance</h3>
          <span className="text-sm text-slate-500">
            Sorted by sales (highest to lowest)
          </span>
        </div>
        <RestaurantComparisonTable
          data={summary?.restaurants || []}
          type="sales"
        />
      </div>
    </div>
  );
}
