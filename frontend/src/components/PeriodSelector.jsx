import React from 'react';

const periods = [
  { value: '1d', label: 'Today' },
  { value: '7d', label: '7 Days' },
  { value: '14d', label: '14 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'mtd', label: 'MTD' },
  { value: 'ytd', label: 'YTD' },
];

export default function PeriodSelector({ value, onChange }) {
  return (
    <div className="period-selector flex bg-slate-100 rounded-lg p-1">
      {periods.map((period) => (
        <button
          key={period.value}
          onClick={() => onChange(period.value)}
          className={value === period.value ? 'active' : ''}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}
