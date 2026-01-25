import React from 'react';

const periods = [
  { value: 'today', label: 'Today' },
  { value: 'wtd', label: 'WTD' },
  { value: 'mtd', label: 'MTD' },
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
