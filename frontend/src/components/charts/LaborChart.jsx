import React from 'react';
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import { formatCurrency, formatPercent, formatDate, formatHours } from '../../utils/formatters';

export default function LaborChart({ data = [], height = 300, showSales = true }) {
  // Reverse to show oldest to newest
  const chartData = [...data].reverse().map((d) => ({
    ...d,
    date: formatDate(d.business_date),
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload;
      return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 min-w-[160px]">
          <p className="text-sm font-medium text-slate-900 mb-2">{label}</p>
          <div className="space-y-1">
            {showSales && (
              <p className="text-sm text-slate-600">
                Sales: <span className="font-medium text-slate-900">{formatCurrency(data?.net_sales)}</span>
              </p>
            )}
            <p className="text-sm text-blue-600">
              Labor: <span className="font-medium">{formatCurrency(data?.labor_cost)}</span>
            </p>
            <p className="text-sm text-slate-600">
              Hours: <span className="font-medium">{formatHours(data?.labor_hours)}</span>
            </p>
            <p className="text-sm text-purple-600 font-medium border-t border-slate-200 pt-1 mt-1">
              Labor %: {formatPercent(data?.labor_percent)}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#64748b', fontSize: 12 }}
        />
        <YAxis
          yAxisId="left"
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#64748b', fontSize: 12 }}
          tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#64748b', fontSize: 12 }}
          tickFormatter={(value) => `${value}%`}
          domain={[0, 40]}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          verticalAlign="top"
          height={36}
          iconType="circle"
          formatter={(value) => <span className="text-sm text-slate-600">{value}</span>}
        />

        {showSales && (
          <Bar
            yAxisId="left"
            dataKey="net_sales"
            name="Net Sales"
            fill="#22c55e"
            fillOpacity={0.3}
            radius={[4, 4, 0, 0]}
          />
        )}

        <Bar
          yAxisId="left"
          dataKey="labor_cost"
          name="Labor Cost"
          fill="#ef4444"
          radius={[4, 4, 0, 0]}
        />

        <Line
          yAxisId="right"
          type="monotone"
          dataKey="labor_percent"
          name="Labor %"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={{ fill: '#8b5cf6', r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
