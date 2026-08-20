// React-обёртка над HistoryMachine (B1): undo/redo + лента действий.
// Объект стабилен между рендерами (useMemo), поэтому его можно безопасно
// класть в зависимости эффектов.

import { useCallback, useMemo, useRef, useState } from "react";
import { HistoryMachine, HistoryEntry } from "./history";

export interface HistoryApi<T> {
  readonly state: T;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly labels: HistoryEntry[];
  commit(next: T, label: string): void;
  reset(next: T): void;
  undo(): void;
  redo(): void;
}

export function useHistory<T>(initial: T): HistoryApi<T> {
  const machineRef = useRef<HistoryMachine<T> | null>(null);
  if (machineRef.current === null) machineRef.current = new HistoryMachine<T>(initial);
  const [, force] = useState(0);
  const rerender = useCallback(() => force((v) => v + 1), []);

  const commit = useCallback(
    (next: T, label: string) => {
      machineRef.current!.commit(next, label);
      rerender();
    },
    [rerender],
  );
  const reset = useCallback(
    (next: T) => {
      machineRef.current!.reset(next);
      rerender();
    },
    [rerender],
  );
  const undo = useCallback(() => {
    machineRef.current!.undo();
    rerender();
  }, [rerender]);
  const redo = useCallback(() => {
    machineRef.current!.redo();
    rerender();
  }, [rerender]);

  return useMemo(
    () => ({
      get state(): T {
        return machineRef.current!.present;
      },
      get canUndo(): boolean {
        return machineRef.current!.canUndo;
      },
      get canRedo(): boolean {
        return machineRef.current!.canRedo;
      },
      get labels(): HistoryEntry[] {
        return machineRef.current!.labels;
      },
      commit,
      reset,
      undo,
      redo,
    }),
    [commit, reset, undo, redo],
  );
}