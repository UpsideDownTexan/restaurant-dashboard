import React from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { formatPercent, formatDate, formatCurrency } from '../../utils/formatters';

export default function PrimeCostChart({ data = [], height = 350, showTarget = true }) {
  // Reverse to show oldest to newest
  const chartData = [...data].reverse().map((d) => ({
    ...d,
    date: formatDate(d.business_date),
    labor: d.labor_percent,
    cogs: d.cogs_percent,
    prime: d.prime_cost_percent,
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload;
      return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 min-w-[180px]">
          <p className="text-sm font-medium text-slate-900 mb-2">{label}</p>
          <div className="space-y-1">
            <p className="text-sm text-slate-600">
              Sales: <span className="font-medium text-slate-900">{formatCurrency(data?.net_sales)}</span>
            </p>
            <p className="text-sm text-blue-600">
              Labor: <span className="font-medium">{formatPercent(data?.labor)}</span>
            </p>
            <p className="text-sm text-orange-600">
              COGS: <span className="font-medium">{formatPercent(data?.cogs)}</span>
            </p>
            <p className="text-sm text-purple-600 font-medium border-t border-slate-200 pt-1 mt-1">
              Prime Cost: {formatPercent(data?.prime)}
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
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#64748b', fontSize: 12 }}
          tickFormatter={(value) => `${value}%`}
          domain={[0, 80]}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          verticalAlign="top"
          height={36}
          iconType="circle"
          formatter={(value) => <span className="text-sm text-slate-600">{value}</span>}
        />

        {/* Target line */}
        {showTarget && (
          <ReferenceLine
            y={65}
            stroke="#ef4444"
            strokeDasharray="5 5"
            label={{
              value: 'Target 65%',
              position: 'right',
              fill: '#ef4444',
              fontSize: 11,
            }}
          />
        )}

        {/* Stacked bars for labor and COGS */}
        <Bar
          dataKey="labor"
          name="Labor %"
          stackId="prime"
          fill="#3b82f6"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="cogs"
          name="COGS %"
          stackId="prime"
          fill="#f97316"
          radius={[4, 4, 0, 0]}
        />

        {/* Prime cost line */}
        <Line
          type="monotone"
          dataKey="prime"
          name="Prime Cost %"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={{ fill: '#8b5cf6', r: 4 }}
          activeDot={{ r: 6 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
