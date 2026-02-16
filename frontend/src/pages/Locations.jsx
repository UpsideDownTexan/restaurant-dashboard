import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Store, TrendingUp, TrendingDown, MapPin, Phone, ArrowRight } from 'lucide-react';
import { api } from '../utils/api';
import PeriodSelector from '../components/PeriodSelector';
import { formatCurrency, formatPercent } from '../utils/formatters';

export default function Locations() {
  const [searchParams] = useSearchParams();
  const brandFilter = searchParams.get('brand');
  const [period, setPeriod] = useState('7d');

  const { data: primeCostData, isLoading } = useQuery({
    queryKey: ['prime-cost', period],
    queryFn: () => api.getPrimeCostData(period),
  });

  const { data: restaurants } = useQuery({
    queryKey: ['restaurants'],
    queryFn: api.getRestaurants,
  });

  // Filter by brand if specified
  const filteredRestaurants = brandFilter
    ? restaurants?.filter((r) => r.brand === brandFilter) || []
    : restaurants || [];

  // Merge restaurant info with performance data
  const restaurantsWithData = filteredRestaurants.map((restaurant) => {
    const perfData = primeCostData?.byRestaurant?.find(
      (r) => r.restaurant_id === restaurant.id
    );
    return {
      ...restaurant,
      ...perfData,
    };
  });

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
          <h1 className="text-2xl font-bold text-slate-900">
            {brandFilter ? brandFilter : 'All Locations'}
          </h1>
          <p className="text-slate-500 mt-1">
            {filteredRestaurants.length} restaurant{filteredRestaurants.length !== 1 ? 's' : ''} in Dallas-Fort Worth
          </p>
        </div>

        <div className="flex items-center gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* Brand filter tabs */}
      <div className="flex gap-2">
        <Link
          to="/locations"
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            !brandFilter
              ? 'bg-brand-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          All Brands
        </Link>
        <Link
          to="/locations?brand=Marianos"
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            brandFilter === 'Marianos'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Mariano's
        </Link>
        <Link
          to="/locations?brand=La Hacienda Ranch"
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            brandFilter === 'La Hacienda Ranch'
              ? 'bg-orange-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          La Hacienda Ranch
        </Link>
      </div>

      {/* Location Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {restaurantsWithData.map((restaurant) => {
          const primePercent = restaurant.prime_cost_percent || 0;
          const isOverTarget = primePercent > 65;
          const isWarning = primePercent > 60 && primePercent <= 65;

          return (
            <Link
              key={restaurant.id}
              to={`/locations/${restaurant.id}`}
              className="card group hover:shadow-lg transition-all duration-300 hover:border-brand-200"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg ${
                      restaurant.brand === 'Marianos'
                        ? 'bg-blue-100'
                        : 'bg-orange-100'
                    }`}
                  >
                    <Store
                      className={`w-5 h-5 ${
                        restaurant.brand === 'Marianos'
                          ? 'text-blue-600'
                          : 'text-orange-600'
                      }`}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 group-hover:text-brand-600 transition-colors">
                      {restaurant.name}
                    </h3>
                    <p className="text-xs text-slate-500">{restaurant.short_name}</p>
                  </div>
                </div>

                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-brand-500 group-hover:translate-x-1 transition-all" />
              </div>

              {/* Location info */}
              <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
                <MapPin className="w-4 h-4" />
                <span>{restaurant.city}, TX</span>
              </div>

              {/* Performance metrics */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Net Sales</div>
                  <div className="font-semibold text-slate-900">
                    {formatCurrency(restaurant.total_sales, { compact: true })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Labor %</div>
                  <div className={`font-semibold ${
                    (restaurant.labor_percent || 0) > 20 ? 'text-red-600' : 'text-slate-900'
                  }`}>
                    {formatPercent(restaurant.labor_percent)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Prime Cost</div>
                  <div className={`font-semibold ${
                    isOverTarget ? 'text-red-600' : isWarning ? 'text-yellow-600' : 'text-green-600'
                  }`}>
                    {formatPercent(primePercent)}
                  </div>
                </div>
              </div>

              {/* Prime cost bar */}
              <div className="mt-4">
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isOverTarget ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min((primePercent / 70) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-xs text-slate-400">
                  <span>0%</span>
                  <span className={isOverTarget ? 'text-red-500' : 'text-slate-500'}>Target: 65%</span>
                </div>
              </div>

              {/* Status badge */}
              <div className="mt-4">
                {isOverTarget ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium">
                    <TrendingUp className="w-3 h-3" />
                    Over Target
                  </span>
                ) : isWarning ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-50 text-yellow-700 rounded-full text-xs font-medium">
                    Warning Zone
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                    <TrendingDown className="w-3 h-3" />
                    On Track
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {filteredRestaurants.length === 0 && (
        <div className="text-center py-12">
          <Store className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900">No locations found</h3>
          <p className="text-slate-500 mt-1">
            Try adjusting your filter or add new locations.
          </p>
        </div>
      )}
    </div>
  );
}
