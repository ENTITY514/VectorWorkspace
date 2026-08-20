// История изменений (B1): чистая машина состояний past/present/future
// с лентой действий и капом. Не зависит от React — покрыта юнит-тестами.

export interface HistoryEntry {
  label: string;
  ts: number;
}

export class HistoryMachine<T> {
  past: T[] = [];
  present: T;
  future: T[] = [];
  labels: HistoryEntry[] = [];
  private cap: number;

  constructor(initial: T, cap = 100) {
    this.present = initial;
    this.cap = cap;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  commit(next: T, label: string): void {
    this.past.push(this.present);
    if (this.past.length > this.cap) this.past.shift();
    this.present = next;
    this.future = [];
    this.labels.push({ label, ts: Date.now() });
    if (this.labels.length > this.cap) this.labels.shift();
  }

  reset(next: T): void {
    this.past = [];
    this.future = [];
    this.labels = [];
    this.present = next;
  }

  undo(): T | null {
    if (!this.canUndo) return null;
    const prev = this.past.pop() as T;
    this.future.unshift(this.present);
    this.present = prev;
    this.labels.pop();
    return prev;
  }

  redo(): T | null {
    if (!this.canRedo) return null;
    const next = this.future.shift() as T;
    this.past.push(this.present);
    if (this.past.length > this.cap) this.past.shift();
    this.present = next;
    this.labels.push({ label: "Повторить", ts: Date.now() });
    return next;
  }
}