/**
 * PieChart - Donut/Pie chart component
 *
 * SVG-based pie chart matching the Power BI style
 */

import { useMemo } from 'react';

interface PieChartData {
  label: string;
  value: number;
  color: string;
}

interface PieChartProps {
  title: string;
  data: PieChartData[];
  size?: number;
  innerRadius?: number; // 0 = pie, >0 = donut
  showLegend?: boolean;
  showLabels?: boolean;
  isLoading?: boolean;
}

// Network color palette matching Power BI
export const NETWORK_COLORS: Record<string, string> = {
  'Eagle': '#3B82F6',      // Blue
  'AITX': '#22C55E',       // Green
  'Marmon': '#0891B2',     // Cyan
  'Guardian': '#8B5CF6',   // Purple
  'Curry': '#6366F1',      // Indigo
  'Other': '#3B82F6',      // Blue
  'Trinity': '#EAB308',    // Yellow
  'Greenbrier': '#F97316', // Orange
  'Cathcart': '#EC4899',   // Pink
  'Procor': '#14B8A6',     // Teal
  'Transco': '#F43F5E',    // Rose
};

export default function PieChart({
  title,
  data,
  size = 200,
  innerRadius = 60,
  showLegend = true,
  showLabels = true,
  isLoading = false,
}: PieChartProps) {
  const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);

  const segments = useMemo(() => {
    let currentAngle = -90; // Start from top
    return data.map((item) => {
      const percentage = total > 0 ? (item.value / total) * 100 : 0;
      const angle = (percentage / 100) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      return {
        ...item,
        percentage,
        startAngle,
        endAngle,
        midAngle: startAngle + angle / 2,
      };
    });
  }, [data, total]);

  const outerRadius = size / 2 - 10;
  const center = size / 2;

  // Convert angle to radians
  const toRadians = (angle: number) => (angle * Math.PI) / 180;

  // Get arc path
  const getArcPath = (startAngle: number, endAngle: number, innerR: number, outerR: number) => {
    const startOuter = {
      x: center + outerR * Math.cos(toRadians(startAngle)),
      y: center + outerR * Math.sin(toRadians(startAngle)),
    };
    const endOuter = {
      x: center + outerR * Math.cos(toRadians(endAngle)),
      y: center + outerR * Math.sin(toRadians(endAngle)),
    };
    const startInner = {
      x: center + innerR * Math.cos(toRadians(endAngle)),
      y: center + innerR * Math.sin(toRadians(endAngle)),
    };
    const endInner = {
      x: center + innerR * Math.cos(toRadians(startAngle)),
      y: center + innerR * Math.sin(toRadians(startAngle)),
    };

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    return `
      M ${startOuter.x} ${startOuter.y}
      A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}
      L ${startInner.x} ${startInner.y}
      A ${innerR} ${innerR} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}
      Z
    `;
  };

  // Get label position
  const getLabelPosition = (midAngle: number) => {
    const labelRadius = outerRadius + 25;
    return {
      x: center + labelRadius * Math.cos(toRadians(midAngle)),
      y: center + labelRadius * Math.sin(toRadians(midAngle)),
    };
  };

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-steel-200 rounded w-24 mb-4"></div>
        <div className="flex items-center gap-8">
          <div className="w-[200px] h-[200px] bg-steel-200 rounded-full"></div>
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-3 h-3 bg-steel-200 rounded"></div>
                <div className="h-3 bg-steel-200 rounded w-16"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-steel-700 mb-3">{title}</h3>
      <div className="flex items-start gap-6">
        {/* Chart */}
        <svg width={size + 60} height={size + 40} className="overflow-visible">
          <g>
            {segments.map((segment, i) => (
              <g key={i}>
                <path
                  d={getArcPath(segment.startAngle, segment.endAngle, innerRadius, outerRadius)}
                  fill={segment.color}
                  stroke="white"
                  strokeWidth="2"
                  className="transition-opacity hover:opacity-80 cursor-pointer"
                />
                {/* Label line and text */}
                {showLabels && segment.percentage >= 5 && (
                  <>
                    {/* Label */}
                    <text
                      x={getLabelPosition(segment.midAngle).x}
                      y={getLabelPosition(segment.midAngle).y}
                      textAnchor={segment.midAngle > 90 && segment.midAngle < 270 ? 'end' : 'start'}
                      dominantBaseline="middle"
                      className="text-xs fill-steel-600"
                    >
                      {segment.value} ({segment.percentage.toFixed(0)}%)
                    </text>
                  </>
                )}
              </g>
            ))}
          </g>
        </svg>

        {/* Legend */}
        {showLegend && (
          <div className="flex flex-col gap-1.5 pt-2">
            {segments.map((segment, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: segment.color }}
                />
                <span className="text-steel-700">{segment.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
