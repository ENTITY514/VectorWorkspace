// src/entities/academic-plan/model/selectors.ts

import { RootState } from "../../../store/store";
import { StoredTup } from "./types";

export const selectTupByIndex = (
  state: RootState,
  tupIndex: number
): StoredTup | undefined => {
  return state.academicPlan.tupList[tupIndex];
};

export const selectTupById = (
    state: RootState,
    tupId: string
  ): StoredTup | undefined => {
    return state.academicPlan.tupList.find(tup => tup.id === tupId);
  };
