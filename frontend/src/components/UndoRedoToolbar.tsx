/**
 * Undo/Redo Toolbar Component
 *
 * Displays undo/redo buttons with history info
 * Use this in pages that support undo/redo operations
 */

import { ArrowUturnLeftIcon, ArrowUturnRightIcon, ClockIcon } from '@heroicons/react/24/outline';
import { useUndoRedo, useUndoRedoKeyboard } from '../contexts/UndoRedoContext';
import { useState } from 'react';

interface UndoRedoToolbarProps {
  className?: string;
  showHistory?: boolean;
  compact?: boolean;
}

export default function UndoRedoToolbar({
  className = '',
  showHistory = false,
  compact = false,
}: UndoRedoToolbarProps) {
  const { canUndo, canRedo, undo, redo, undoStack, lastAction } = useUndoRedo();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Enable keyboard shortcuts
  useUndoRedoKeyboard();

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <button
          onClick={undo}
          disabled={!canUndo}
          className={`p-1.5 rounded transition-colors ${
            canUndo
              ? 'text-steel-600 hover:text-steel-900 hover:bg-steel-100'
              : 'text-steel-300 cursor-not-allowed'
          }`}
          title={canUndo ? `Undo: ${lastAction?.label || 'last action'}` : 'Nothing to undo'}
        >
          <ArrowUturnLeftIcon className="h-4 w-4" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className={`p-1.5 rounded transition-colors ${
            canRedo
              ? 'text-steel-600 hover:text-steel-900 hover:bg-steel-100'
              : 'text-steel-300 cursor-not-allowed'
          }`}
          title={canRedo ? 'Redo last undone action' : 'Nothing to redo'}
        >
          <ArrowUturnRightIcon className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex items-center rounded-lg border border-steel-200 bg-white overflow-hidden">
        <button
          onClick={undo}
          disabled={!canUndo}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-r border-steel-200 transition-colors ${
            canUndo
              ? 'text-steel-700 hover:bg-steel-50'
              : 'text-steel-300 cursor-not-allowed'
          }`}
          title="Ctrl+Z"
        >
          <ArrowUturnLeftIcon className="h-4 w-4" />
          Undo
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
            canRedo
              ? 'text-steel-700 hover:bg-steel-50'
              : 'text-steel-300 cursor-not-allowed'
          }`}
          title="Ctrl+Y"
        >
          <ArrowUturnRightIcon className="h-4 w-4" />
          Redo
        </button>
      </div>

      {/* History toggle */}
      {showHistory && undoStack.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-steel-600 hover:text-steel-900 border border-steel-200 rounded-lg bg-white hover:bg-steel-50 transition-colors"
          >
            <ClockIcon className="h-4 w-4" />
            History ({undoStack.length})
          </button>

          {isHistoryOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsHistoryOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-steel-200 z-20 py-2 max-h-64 overflow-y-auto">
                <div className="px-3 py-1.5 text-xs font-semibold text-steel-500 uppercase tracking-wider border-b border-steel-100">
                  Recent Actions
                </div>
                {undoStack
                  .slice()
                  .reverse()
                  .slice(0, 10)
                  .map((action, index) => (
                    <div
                      key={action.id}
                      className={`px-3 py-2 text-sm ${
                        index === 0 ? 'bg-rail-50 border-l-2 border-rail-500' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-steel-900 font-medium">
                          {action.label}
                        </span>
                        <span className="text-xs text-steel-400">
                          {formatTime(action.timestamp)}
                        </span>
                      </div>
                      <span className="text-xs text-steel-500 capitalize">
                        {action.type.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                {undoStack.length > 10 && (
                  <div className="px-3 py-2 text-xs text-steel-400 text-center">
                    +{undoStack.length - 10} more actions
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Last action indicator */}
      {lastAction && !showHistory && (
        <span className="text-xs text-steel-500 hidden sm:block">
          Last: {lastAction.label}
        </span>
      )}
    </div>
  );
}

/**
 * Floating undo/redo button for mobile
 */
export function UndoRedoFab() {
  const { canUndo, canRedo, undo, redo, lastAction } = useUndoRedo();

  useUndoRedoKeyboard();

  if (!canUndo && !canRedo) return null;

  return (
    <div className="fixed bottom-20 right-4 z-40 flex flex-col gap-2 sm:hidden">
      {canUndo && (
        <button
          onClick={undo}
          className="w-12 h-12 rounded-full bg-white shadow-lg border border-steel-200 flex items-center justify-center text-steel-700 active:bg-steel-100"
          title={`Undo: ${lastAction?.label}`}
        >
          <ArrowUturnLeftIcon className="h-5 w-5" />
        </button>
      )}
      {canRedo && (
        <button
          onClick={redo}
          className="w-12 h-12 rounded-full bg-white shadow-lg border border-steel-200 flex items-center justify-center text-steel-700 active:bg-steel-100"
          title="Redo"
        >
          <ArrowUturnRightIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
