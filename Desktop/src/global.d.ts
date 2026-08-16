import type { AcademicPlan } from "./tup/model/types";

declare global {
  interface Window {
    __lastTupPlan?: AcademicPlan;
  }
}

export {};