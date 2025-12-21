/**
 * StackedBarChart - Stacked bar chart component
 *
 * SVG-based stacked bar chart matching the Power BI style
 * Used for showing % of volume by network over time
 */

import { useMemo } from 'react';
import { NETWORK_COLORS } from './PieChart';

interface StackedBarData {
  label: string; // e.g., "January", "February"
  segments: {
    category: string; // e.g., "AITX", "Eagle"
    value: number;
  }[];
}

interface StackedBarChartProps {
  title: string;
  data: StackedBarData[];
  categories: string[];
  height?: number;
  showPercentage?: boolean;
  isLoading?: boolean;
}

export default function StackedBarChart({
  title,
  data,
  categories,
  height = 300,
  showPercentage = true,
  isLoading = false,
}: StackedBarChartProps) {
  // Calculate totals and percentages
  const processedData = useMemo(() => {
    return data.map((item) => {
      const total = item.segments.reduce((sum, s) => sum + s.value, 0);
      const segments = categories.map((cat) => {
        const segment = item.segments.find((s) => s.category === cat);
        const value = segment?.value || 0;
        const percentage = total > 0 ? (value / total) * 100 : 0;
        return {
          category: cat,
          value,
          percentage,
          color: NETWORK_COLORS[cat] || '#94A3B8',
        };
      });
      return {
        label: item.label,
        total,
        segments,
      };
    });
  }, [data, categories]);

  const barWidth = 40;
  const barGap = 8;
  const chartWidth = processedData.length * (barWidth + barGap) + 60;
  const chartHeight = height - 60; // Leave room for labels

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-steel-200 rounded w-32 mb-4"></div>
        <div className="flex items-end gap-2 h-64">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
            <div key={i} className="w-10 bg-steel-200 rounded-t" style={{ height: `${30 + Math.random() * 70}%` }}></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-steel-700 mb-3">{title}</h3>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4">
        <span className="text-xs text-steel-500 font-medium">Network</span>
        {categories.map((cat) => (
          <div key={cat} className="flex items-center gap-1.5 text-xs">
            <span
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: NETWORK_COLORS[cat] || '#94A3B8' }}
            />
            <span className="text-steel-600">{cat}</span>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="overflow-x-auto">
        <svg width={Math.max(chartWidth, 800)} height={height}>
          {/* Y-axis labels */}
          <g>
            {[0, 50, 100].map((val) => (
              <g key={val}>
                <text
                  x="35"
                  y={chartHeight - (val / 100) * chartHeight + 15}
                  textAnchor="end"
                  className="text-xs fill-steel-500"
                >
                  {val}%
                </text>
                <line
                  x1="40"
                  y1={chartHeight - (val / 100) * chartHeight + 10}
                  x2={chartWidth}
                  y2={chartHeight - (val / 100) * chartHeight + 10}
                  stroke="#E2E8F0"
                  strokeWidth="1"
                  strokeDasharray={val === 0 ? "0" : "4"}
                />
              </g>
            ))}
          </g>

          {/* Bars */}
          <g>
            {processedData.map((item, i) => {
              let currentY = chartHeight + 10; // Start from bottom
              const x = 50 + i * (barWidth + barGap);

              return (
                <g key={i}>
                  {/* Stacked segments */}
                  {item.segments.map((segment, j) => {
                    const segmentHeight = (segment.percentage / 100) * chartHeight;
                    currentY -= segmentHeight;

                    if (segmentHeight < 1) return null;

                    return (
                      <g key={j}>
                        <rect
                          x={x}
                          y={currentY}
                          width={barWidth}
                          height={segmentHeight}
                          fill={segment.color}
                          className="transition-opacity hover:opacity-80"
                        />
                        {/* Tooltip on hover would go here */}
                      </g>
                    );
                  })}

                  {/* X-axis label */}
                  <text
                    x={x + barWidth / 2}
                    y={chartHeight + 30}
                    textAnchor="middle"
                    className="text-xs fill-steel-500"
                    transform={`rotate(-45, ${x + barWidth / 2}, ${chartHeight + 30})`}
                  >
                    {item.label}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Y-axis label */}
          <text
            x="15"
            y={chartHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90, 15, ${chartHeight / 2})`}
            className="text-xs fill-steel-500"
          >
            %Volume
          </text>
        </svg>
      </div>
    </div>
  );
}
