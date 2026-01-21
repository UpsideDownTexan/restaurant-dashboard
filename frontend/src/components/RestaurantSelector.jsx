import React from 'react';
import { Store, ChevronDown } from 'lucide-react';

export default function RestaurantSelector({
  restaurants = [],
  value,
  onChange,
  showAll = true,
}) {
  return (
    <div className="relative">
      <select
        value={value || 'all'}
        onChange={(e) => onChange(e.target.value === 'all' ? null : e.target.value)}
        className="appearance-none bg-white border border-slate-200 rounded-lg px-4 py-2 pr-10 text-sm font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 cursor-pointer"
      >
        {showAll && (
          <option value="all">All Locations</option>
        )}
        {restaurants.length > 0 && (
          <>
            <optgroup label="Mariano's">
              {restaurants
                .filter((r) => r.brand === 'Marianos')
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="La Hacienda Ranch">
              {restaurants
                .filter((r) => r.brand === 'La Hacienda Ranch')
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </optgroup>
          </>
        )}
      </select>
      <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </div>
    </div>
  );
}
