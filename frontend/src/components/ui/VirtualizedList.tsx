/**
 * Virtualized List Components
 *
 * High-performance list rendering using react-window for:
 * - Large car lists (1000+ items)
 * - Shop listings
 * - Any scrollable list data
 */

import { useRef, useCallback, CSSProperties, ReactNode, memo } from 'react';
import { FixedSizeList, VariableSizeList, areEqual } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

// ============================================================================
// FIXED SIZE LIST - For items with consistent height
// ============================================================================

interface VirtualizedListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number, style: CSSProperties) => ReactNode;
  className?: string;
  overscanCount?: number;
  onItemsRendered?: (startIndex: number, stopIndex: number) => void;
}

export function VirtualizedList<T>({
  items,
  itemHeight,
  renderItem,
  className = '',
  overscanCount = 5,
  onItemsRendered,
}: VirtualizedListProps<T>) {
  const listRef = useRef<FixedSizeList>(null);

  const Row = useCallback(
    ({ index, style }: { index: number; style: CSSProperties }) => {
      const item = items[index];
      return renderItem(item, index, style);
    },
    [items, renderItem]
  );

  return (
    <div className={`h-full ${className}`}>
      <AutoSizer>
        {({ height, width }) => (
          <FixedSizeList
            ref={listRef}
            height={height}
            width={width}
            itemCount={items.length}
            itemSize={itemHeight}
            overscanCount={overscanCount}
            onItemsRendered={({ visibleStartIndex, visibleStopIndex }) => {
              onItemsRendered?.(visibleStartIndex, visibleStopIndex);
            }}
          >
            {Row}
          </FixedSizeList>
        )}
      </AutoSizer>
    </div>
  );
}

// ============================================================================
// VARIABLE SIZE LIST - For items with different heights
// ============================================================================

interface VariableSizeListProps<T> {
  items: T[];
  getItemHeight: (index: number) => number;
  renderItem: (item: T, index: number, style: CSSProperties) => ReactNode;
  className?: string;
  overscanCount?: number;
}

export function VirtualizedVariableList<T>({
  items,
  getItemHeight,
  renderItem,
  className = '',
  overscanCount = 5,
}: VariableSizeListProps<T>) {
  const listRef = useRef<VariableSizeList>(null);

  const Row = useCallback(
    ({ index, style }: { index: number; style: CSSProperties }) => {
      const item = items[index];
      return renderItem(item, index, style);
    },
    [items, renderItem]
  );

  // Reset cache when items change
  const resetList = useCallback(() => {
    listRef.current?.resetAfterIndex(0);
  }, []);

  return (
    <div className={`h-full ${className}`}>
      <AutoSizer>
        {({ height, width }) => (
          <VariableSizeList
            ref={listRef}
            height={height}
            width={width}
            itemCount={items.length}
            itemSize={getItemHeight}
            overscanCount={overscanCount}
          >
            {Row}
          </VariableSizeList>
        )}
      </AutoSizer>
    </div>
  );
}

// ============================================================================
// VIRTUALIZED TABLE - Table-like virtualized rendering
// ============================================================================

interface Column<T> {
  key: string;
  header: string;
  width: number | string;
  render: (item: T, index: number) => ReactNode;
  className?: string;
}

interface VirtualizedTableProps<T> {
  items: T[];
  columns: Column<T>[];
  rowHeight?: number;
  headerHeight?: number;
  className?: string;
  onRowClick?: (item: T, index: number) => void;
  selectedId?: string | null;
  getRowId: (item: T) => string;
}

export function VirtualizedTable<T>({
  items,
  columns,
  rowHeight = 48,
  headerHeight = 40,
  className = '',
  onRowClick,
  selectedId,
  getRowId,
}: VirtualizedTableProps<T>) {
  const TableRow = memo(
    ({ index, style }: { index: number; style: CSSProperties }) => {
      const item = items[index];
      const itemId = getRowId(item);
      const isSelected = selectedId === itemId;

      return (
        <div
          style={style}
          className={`flex items-center border-b border-steel-100 ${
            onRowClick ? 'cursor-pointer hover:bg-steel-50' : ''
          } ${isSelected ? 'bg-rail-50' : ''}`}
          onClick={() => onRowClick?.(item, index)}
          role="row"
          aria-selected={isSelected}
        >
          {columns.map(col => (
            <div
              key={col.key}
              className={`px-3 py-2 truncate ${col.className || ''}`}
              style={{ width: col.width, flexShrink: 0 }}
              role="cell"
            >
              {col.render(item, index)}
            </div>
          ))}
        </div>
      );
    },
    areEqual
  );
  TableRow.displayName = 'TableRow';

  return (
    <div className={`flex flex-col h-full bg-white rounded-lg border border-steel-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div
        className="flex items-center bg-steel-50 border-b border-steel-200 flex-shrink-0"
        style={{ height: headerHeight }}
        role="row"
      >
        {columns.map(col => (
          <div
            key={col.key}
            className={`px-3 py-2 text-xs font-semibold text-steel-600 uppercase tracking-wider ${col.className || ''}`}
            style={{ width: col.width, flexShrink: 0 }}
            role="columnheader"
          >
            {col.header}
          </div>
        ))}
      </div>

      {/* Virtualized Body */}
      <div className="flex-1" role="rowgroup">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-steel-500">
            No items to display
          </div>
        ) : (
          <AutoSizer>
            {({ height, width }) => (
              <FixedSizeList
                height={height}
                width={width}
                itemCount={items.length}
                itemSize={rowHeight}
                overscanCount={10}
              >
                {TableRow}
              </FixedSizeList>
            )}
          </AutoSizer>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// VIRTUALIZED CARD GRID - For card-based layouts
// ============================================================================

interface VirtualizedCardGridProps<T> {
  items: T[];
  renderCard: (item: T, index: number) => ReactNode;
  cardHeight: number;
  cardsPerRow?: number;
  gap?: number;
  className?: string;
}

export function VirtualizedCardGrid<T>({
  items,
  renderCard,
  cardHeight,
  cardsPerRow = 3,
  gap = 16,
  className = '',
}: VirtualizedCardGridProps<T>) {
  // Calculate rows
  const rowCount = Math.ceil(items.length / cardsPerRow);
  const rowHeight = cardHeight + gap;

  const Row = useCallback(
    ({ index: rowIndex, style }: { index: number; style: CSSProperties }) => {
      const startIndex = rowIndex * cardsPerRow;
      const rowItems = items.slice(startIndex, startIndex + cardsPerRow);

      return (
        <div
          style={{
            ...style,
            display: 'flex',
            gap: `${gap}px`,
            paddingLeft: gap,
            paddingRight: gap,
          }}
        >
          {rowItems.map((item, i) => (
            <div
              key={startIndex + i}
              style={{ flex: `0 0 calc((100% - ${gap * (cardsPerRow - 1)}px) / ${cardsPerRow})` }}
            >
              {renderCard(item, startIndex + i)}
            </div>
          ))}
          {/* Fill empty slots */}
          {Array.from({ length: cardsPerRow - rowItems.length }).map((_, i) => (
            <div
              key={`empty-${i}`}
              style={{ flex: `0 0 calc((100% - ${gap * (cardsPerRow - 1)}px) / ${cardsPerRow})` }}
            />
          ))}
        </div>
      );
    },
    [items, cardsPerRow, gap, renderCard]
  );

  return (
    <div className={`h-full ${className}`}>
      <AutoSizer>
        {({ height, width }) => (
          <FixedSizeList
            height={height}
            width={width}
            itemCount={rowCount}
            itemSize={rowHeight}
            overscanCount={3}
          >
            {Row}
          </FixedSizeList>
        )}
      </AutoSizer>
    </div>
  );
}

// ============================================================================
// AUTO SIZER WRAPPER - Standalone auto-sizer
// ============================================================================

interface AutoSizerWrapperProps {
  children: (size: { width: number; height: number }) => ReactNode;
  className?: string;
}

export function AutoSizerWrapper({ children, className = '' }: AutoSizerWrapperProps) {
  return (
    <div className={`h-full w-full ${className}`}>
      <AutoSizer>{children}</AutoSizer>
    </div>
  );
}

export default VirtualizedList;
