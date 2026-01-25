import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, Users, CreditCard, ShoppingBag, Coffee, Wine } from 'lucide-react';
import { api } from '../utils/api';
import KPICard from '../components/KPICard';
import PeriodSelector from '../components/PeriodSelector';
import RestaurantSelector from '../components/RestaurantSelector';
import SalesChart from '../components/charts/SalesChart';
import { formatCurrency, formatPercent, formatNumber, formatDate } from '../utils/formatters';

export default function Sales() {
  const [period, setPeriod] = useState('today');
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);

  const { data: salesData, isLoading } = useQuery({
    queryKey: ['sales', period, selectedRestaurant],
    queryFn: () => api.getSalesData(period, selectedRestaurant),
  });

  const { data: restaurants } = useQuery({
    queryKey: ['restaurants'],
    queryFn: api.getRestaurants,
  });

  const daily = salesData?.daily || [];
  const byRestaurant = salesData?.byRestaurant || [];

  // Calculate totals
  const totals = daily.reduce((acc, day) => ({
    netSales: acc.netSales + (day.net_sales || 0),
    guests: acc.guests + (day.guest_count || 0),
    checks: acc.checks + (day.check_count || 0),
    food: acc.food + (day.food_sales || 0),
    beverage: acc.beverage + (day.beverage_sales || 0),
    alcohol: acc.alcohol + (day.alcohol_sales || 0),
  }), { netSales: 0, guests: 0, checks: 0, food: 0, beverage: 0, alcohol: 0 });

  const avgCheck = totals.checks > 0 ? totals.netSales / totals.checks : 0;
  const avgPerGuest = totals.guests > 0 ? totals.netSales / totals.guests : 0;

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
          <h1 className="text-2xl font-bold text-slate-900">Sales Analysis</h1>
          <p className="text-slate-500 mt-1">Track revenue, guests, and check averages</p>
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
          title="Net Sales"
          value={totals.netSales}
          format="currency"
          icon={DollarSign}
        />
        <KPICard
          title="Guest Count"
          value={totals.guests}
          format="number"
          icon={Users}
        />
        <KPICard
          title="Avg Check"
          value={avgCheck}
          format="currency"
          icon={CreditCard}
        />
        <KPICard
          title="Avg Per Guest"
          value={avgPerGuest}
          format="currency"
          icon={ShoppingBag}
        />
      </div>

      {/* Sales Trend Chart */}
      <div className="card">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Daily Sales Trend</h3>
        <SalesChart data={daily} height={300} />
      </div>

      {/* Sales Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <Coffee className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Food Sales</h3>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totals.food)}</p>
            </div>
          </div>
          <div className="metric-bar">
            <div
              className="metric-bar-fill bg-green-500"
              style={{ width: `${totals.netSales > 0 ? (totals.food / totals.netSales) * 100 : 0}%` }}
            />
          </div>
          <p className="text-sm text-slate-500 mt-2">
            {formatPercent(totals.netSales > 0 ? (totals.food / totals.netSales) * 100 : 0)} of total sales
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ShoppingBag className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Beverage Sales</h3>
              <p className="text-2xl font-bold text-blue-600">{formatCurrency(totals.beverage)}</p>
            </div>
          </div>
          <div className="metric-bar">
            <div
              className="metric-bar-fill bg-blue-500"
              style={{ width: `${totals.netSales > 0 ? (totals.beverage / totals.netSales) * 100 : 0}%` }}
            />
          </div>
          <p className="text-sm text-slate-500 mt-2">
            {formatPercent(totals.netSales > 0 ? (totals.beverage / totals.netSales) * 100 : 0)} of total sales
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Wine className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Alcohol Sales</h3>
              <p className="text-2xl font-bold text-purple-600">{formatCurrency(totals.alcohol)}</p>
            </div>
          </div>
          <div className="metric-bar">
            <div
              className="metric-bar-fill bg-purple-500"
              style={{ width: `${totals.netSales > 0 ? (totals.alcohol / totals.netSales) * 100 : 0}%` }}
            />
          </div>
          <p className="text-sm text-slate-500 mt-2">
            {formatPercent(totals.netSales > 0 ? (totals.alcohol / totals.netSales) * 100 : 0)} of total sales
          </p>
        </div>
      </div>

      {/* Daily Breakdown Table */}
      <div className="card">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Daily Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="table-header text-left py-3 px-4">Date</th>
                <th className="table-header text-right py-3 px-4">Net Sales</th>
                <th className="table-header text-right py-3 px-4">Guests</th>
                <th className="table-header text-right py-3 px-4">Checks</th>
                <th className="table-header text-right py-3 px-4">Avg Check</th>
                <th className="table-header text-right py-3 px-4">Food</th>
                <th className="table-header text-right py-3 px-4">Beverage</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((day, index) => (
                <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 font-medium">{formatDate(day.business_date, 'medium')}</td>
                  <td className="py-3 px-4 text-right font-semibold">{formatCurrency(day.net_sales)}</td>
                  <td className="py-3 px-4 text-right">{formatNumber(day.guest_count)}</td>
                  <td className="py-3 px-4 text-right">{formatNumber(day.check_count)}</td>
                  <td className="py-3 px-4 text-right">{formatCurrency(day.avg_check)}</td>
                  <td className="py-3 px-4 text-right">{formatCurrency(day.food_sales)}</td>
                  <td className="py-3 px-4 text-right">{formatCurrency(day.beverage_sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Location Comparison */}
      {!selectedRestaurant && byRestaurant.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Sales by Location</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="table-header text-left py-3 px-4">Location</th>
                  <th className="table-header text-right py-3 px-4">Total Sales</th>
                  <th className="table-header text-right py-3 px-4">Avg Daily</th>
                  <th className="table-header text-right py-3 px-4">Total Guests</th>
                  <th className="table-header text-right py-3 px-4">Avg Per Guest</th>
                </tr>
              </thead>
              <tbody>
                {byRestaurant.map((r, index) => (
                  <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${r.brand === 'Marianos' ? 'bg-blue-500' : 'bg-orange-500'}`} />
                        <span className="font-medium">{r.restaurant_name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold">{formatCurrency(r.total_net_sales)}</td>
                    <td className="py-3 px-4 text-right">{formatCurrency(r.avg_daily_sales)}</td>
                    <td className="py-3 px-4 text-right">{formatNumber(r.total_guests)}</td>
                    <td className="py-3 px-4 text-right">{formatCurrency(r.avg_per_guest)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
