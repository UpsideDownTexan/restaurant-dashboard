import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Store,
  MapPin,
  DollarSign,
  Users,
  PieChart,
  TrendingUp,
  Calendar
} from 'lucide-react';
import { api } from '../utils/api';
import KPICard from '../components/KPICard';
import PeriodSelector from '../components/PeriodSelector';
import SalesChart from '../components/charts/SalesChart';
import LaborChart from '../components/charts/LaborChart';
import PrimeCostChart from '../components/charts/PrimeCostChart';
import { formatCurrency, formatPercent, formatDate, formatHours } from '../utils/formatters';

export default function LocationDetail() {
  const { id } = useParams();
  const [period, setPeriod] = useState('7d');

  const { data, isLoading, error } = useQuery({
    queryKey: ['restaurant-detail', id, period],
    queryFn: () => api.getRestaurantDetail(id, period),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (error || !data?.restaurant) {
    return (
      <div className="text-center py-12">
        <Store className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900">Location not found</h3>
        <Link to="/locations" className="text-brand-600 hover:underline mt-2 inline-block">
          Back to all locations
        </Link>
      </div>
    );
  }

  const { restaurant, sales, labor, primeCost } = data;

  // Calculate totals
  const salesTotals = sales?.reduce((acc, day) => ({
    netSales: acc.netSales + (day.net_sales || 0),
    guests: acc.guests + (day.guest_count || 0),
  }), { netSales: 0, guests: 0 }) || { netSales: 0, guests: 0 };

  const laborTotals = labor?.reduce((acc, day) => ({
    cost: acc.cost + (day.total_labor_cost || 0),
    hours: acc.hours + (day.total_hours || 0),
  }), { cost: 0, hours: 0 }) || { cost: 0, hours: 0 };

  const avgPrimeCost = primeCost?.length > 0
    ? primeCost.reduce((sum, day) => sum + (day.prime_cost_percent || 0), 0) / primeCost.length
    : 0;

  const avgLaborPercent = salesTotals.netSales > 0
    ? (laborTotals.cost / salesTotals.netSales) * 100
    : 0;

  const isMarianos = restaurant.brand === 'Marianos';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <Link
            to="/locations"
            className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to all locations
          </Link>

          <div className="flex items-center gap-4">
            <div
              className={`p-3 rounded-xl ${
                isMarianos ? 'bg-blue-100' : 'bg-orange-100'
              }`}
            >
              <Store
                className={`w-8 h-8 ${
                  isMarianos ? 'text-blue-600' : 'text-orange-600'
                }`}
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{restaurant.name}</h1>
              <div className="flex items-center gap-4 mt-1 text-slate-500">
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {restaurant.city}, TX
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    isMarianos
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}
                >
                  {restaurant.brand}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          title="Net Sales"
          value={salesTotals.netSales}
          format="currency"
          icon={DollarSign}
        />
        <KPICard
          title="Guest Count"
          value={salesTotals.guests}
          format="number"
          icon={Users}
        />
        <KPICard
          title="Labor Cost"
          value={laborTotals.cost}
          format="currency"
          icon={Users}
        />
        <KPICard
          title="Labor %"
          value={avgLaborPercent}
          target={20}
          format="percent"
          icon={PieChart}
          inverse={true}
        />
        <KPICard
          title="Prime Cost %"
          value={avgPrimeCost}
          target={65}
          format="percent"
          icon={TrendingUp}
          inverse={true}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Sales Trend</h3>
          <SalesChart data={sales || []} height={280} />
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Labor vs Sales</h3>
          <LaborChart
            data={(labor || []).map((l, i) => ({
              ...l,
              net_sales: sales?.[i]?.net_sales || 0,
              labor_percent: sales?.[i]?.net_sales > 0
                ? ((l.total_labor_cost || 0) / sales[i].net_sales * 100)
                : 0
            }))}
            height={280}
          />
        </div>
      </div>

      {/* Prime Cost Chart */}
      <div className="card">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Prime Cost Analysis</h3>
        <PrimeCostChart data={primeCost || []} height={320} showTarget={true} />
      </div>

      {/* Daily Data Table */}
      <div className="card">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Daily Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="table-header text-left py-3 px-4">Date</th>
                <th className="table-header text-right py-3 px-4">Net Sales</th>
                <th className="table-header text-right py-3 px-4">Guests</th>
                <th className="table-header text-right py-3 px-4">Labor Cost</th>
                <th className="table-header text-right py-3 px-4">Labor %</th>
                <th className="table-header text-right py-3 px-4">COGS %</th>
                <th className="table-header text-right py-3 px-4">Prime %</th>
              </tr>
            </thead>
            <tbody>
              {sales?.map((day, index) => {
                const laborDay = labor?.[index];
                const primeDay = primeCost?.[index];
                const laborPercent = day.net_sales > 0 && laborDay
                  ? (laborDay.total_labor_cost / day.net_sales * 100)
                  : 0;
                const primePercent = primeDay?.prime_cost_percent || 0;
                const cogsPercent = primeDay?.cogs_percent || 0;

                return (
                  <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium">
                      {formatDate(day.business_date, 'medium')}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold">
                      {formatCurrency(day.net_sales)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {day.guest_count}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {formatCurrency(laborDay?.total_labor_cost)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-medium ${laborPercent > 20 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatPercent(laborPercent)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-orange-600">{formatPercent(cogsPercent)}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-bold ${primePercent > 65 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatPercent(primePercent)}
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
