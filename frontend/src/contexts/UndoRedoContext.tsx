/**
 * Undo/Redo History Context
 *
 * Provides centralized undo/redo functionality for:
 * - Assignment changes
 * - Drag-drop operations
 * - Bulk edits
 */

import React, { createContext, useContext, useState, useCallback, ReactNode, useRef } from 'react';

// Generic action type for undo/redo
export interface UndoableAction<T = any> {
  id: string;
  type: string;
  label: string;
  timestamp: number;
  data: T;
  // Functions to execute undo/redo
  undo: () => Promise<void> | void;
  redo: () => Promise<void> | void;
}

interface UndoRedoContextType {
  // State
  canUndo: boolean;
  canRedo: boolean;
  undoStack: UndoableAction[];
  redoStack: UndoableAction[];
  lastAction: UndoableAction | null;

  // Actions
  pushAction: (action: Omit<UndoableAction, 'id' | 'timestamp'>) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clearHistory: () => void;

  // Helpers for common operations
  recordAssignmentChange: (params: {
    carId: string;
    previousShopId: string | null;
    newShopId: string | null;
    previousMonth?: string;
    newMonth?: string;
    onUndo: () => Promise<void> | void;
    onRedo: () => Promise<void> | void;
    label?: string;
  }) => void;

  recordBulkOperation: (params: {
    operationType: string;
    itemCount: number;
    onUndo: () => Promise<void> | void;
    onRedo: () => Promise<void> | void;
    label?: string;
  }) => void;
}

const UndoRedoContext = createContext<UndoRedoContextType | null>(null);

export function useUndoRedo() {
  const context = useContext(UndoRedoContext);
  if (!context) {
    throw new Error('useUndoRedo must be used within an UndoRedoProvider');
  }
  return context;
}

// Optional hook that returns null if not in provider (for optional usage)
export function useUndoRedoOptional() {
  return useContext(UndoRedoContext);
}

interface UndoRedoProviderProps {
  children: ReactNode;
  maxHistorySize?: number;
}

export function UndoRedoProvider({ children, maxHistorySize = 50 }: UndoRedoProviderProps) {
  const [undoStack, setUndoStack] = useState<UndoableAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoableAction[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const actionIdRef = useRef(0);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;
  const lastAction = undoStack[undoStack.length - 1] || null;

  // Generate unique action ID
  const generateActionId = useCallback(() => {
    actionIdRef.current += 1;
    return `action-${actionIdRef.current}-${Date.now()}`;
  }, []);

  // Push a new action to the history
  const pushAction = useCallback((action: Omit<UndoableAction, 'id' | 'timestamp'>) => {
    const fullAction: UndoableAction = {
      ...action,
      id: generateActionId(),
      timestamp: Date.now(),
    };

    setUndoStack(prev => {
      const newStack = [...prev, fullAction];
      // Limit history size
      if (newStack.length > maxHistorySize) {
        return newStack.slice(-maxHistorySize);
      }
      return newStack;
    });

    // Clear redo stack when new action is pushed
    setRedoStack([]);
  }, [generateActionId, maxHistorySize]);

  // Undo the last action
  const undo = useCallback(async () => {
    if (!canUndo || isExecuting) return;

    const action = undoStack[undoStack.length - 1];
    if (!action) return;

    try {
      setIsExecuting(true);
      await action.undo();

      // Move action to redo stack
      setUndoStack(prev => prev.slice(0, -1));
      setRedoStack(prev => [...prev, action]);
    } catch (error) {
      console.error('Undo failed:', error);
      throw error;
    } finally {
      setIsExecuting(false);
    }
  }, [canUndo, isExecuting, undoStack]);

  // Redo the last undone action
  const redo = useCallback(async () => {
    if (!canRedo || isExecuting) return;

    const action = redoStack[redoStack.length - 1];
    if (!action) return;

    try {
      setIsExecuting(true);
      await action.redo();

      // Move action back to undo stack
      setRedoStack(prev => prev.slice(0, -1));
      setUndoStack(prev => [...prev, action]);
    } catch (error) {
      console.error('Redo failed:', error);
      throw error;
    } finally {
      setIsExecuting(false);
    }
  }, [canRedo, isExecuting, redoStack]);

  // Clear all history
  const clearHistory = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  // Helper: Record an assignment change
  const recordAssignmentChange = useCallback((params: {
    carId: string;
    previousShopId: string | null;
    newShopId: string | null;
    previousMonth?: string;
    newMonth?: string;
    onUndo: () => Promise<void> | void;
    onRedo: () => Promise<void> | void;
    label?: string;
  }) => {
    const { carId, previousShopId, newShopId, previousMonth, newMonth, onUndo, onRedo, label } = params;

    pushAction({
      type: 'assignment_change',
      label: label || `Moved car ${carId.slice(0, 8)}...`,
      data: {
        carId,
        previousShopId,
        newShopId,
        previousMonth,
        newMonth,
      },
      undo: onUndo,
      redo: onRedo,
    });
  }, [pushAction]);

  // Helper: Record a bulk operation
  const recordBulkOperation = useCallback((params: {
    operationType: string;
    itemCount: number;
    onUndo: () => Promise<void> | void;
    onRedo: () => Promise<void> | void;
    label?: string;
  }) => {
    const { operationType, itemCount, onUndo, onRedo, label } = params;

    pushAction({
      type: 'bulk_operation',
      label: label || `${operationType} (${itemCount} items)`,
      data: {
        operationType,
        itemCount,
      },
      undo: onUndo,
      redo: onRedo,
    });
  }, [pushAction]);

  return (
    <UndoRedoContext.Provider
      value={{
        canUndo,
        canRedo,
        undoStack,
        redoStack,
        lastAction,
        pushAction,
        undo,
        redo,
        clearHistory,
        recordAssignmentChange,
        recordBulkOperation,
      }}
    >
      {children}
    </UndoRedoContext.Provider>
  );
}

/**
 * Keyboard shortcut hook for undo/redo
 */
export function useUndoRedoKeyboard() {
  const context = useUndoRedoOptional();

  React.useEffect(() => {
    if (!context) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+Z (undo) or Cmd+Z on Mac
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        context.undo();
      }

      // Check for Ctrl+Y (redo) or Ctrl+Shift+Z or Cmd+Shift+Z on Mac
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        context.redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [context]);
}

export default UndoRedoContext;
