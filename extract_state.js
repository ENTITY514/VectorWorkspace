const fs = require('fs');
const path = require('path');

const editorPath = path.join(__dirname, 'Desktop', 'src', 'panels', 'KtpEditor.tsx');
let content = fs.readFileSync(editorPath, 'utf8').replace(/\r\n/g, '\n');
const lines = content.split('\n');

const stateStart = lines.findIndex(l => l.includes('const [dbPlan, setDbPlan] = useState<KtpPlan | null>(null);'));
const stateEnd = lines.findIndex((l, i) => i > stateStart && l.includes('const planName = dbPlan'));

if (stateStart === -1 || stateEnd === -1) {
  console.error("Could not find boundaries");
  process.exit(1);
}

const stateLines = lines.slice(stateStart, stateEnd);

const hookContent = `import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DragEndEvent } from "@dnd-kit/core";
import { v4 as uuidv4 } from "uuid";
import { api } from "../api";
import type { KtpPlan, TupDocumentListItem } from "../types";
import { SUBJECT_NAMES } from "../panels/SubjectNames";
import { IKtpLesson, ILessonObjective, KtpPlan as FlatPlan, LessonRowType } from "./model/types";
import {
  flattenPlan,
  unflattenPlan,
  renumberPlan,
  addHourToPlan,
  deleteLessonFromPlan,
  splitObjectivesInPlan,
  addSorToPlan,
  mergeLessonWithNext,
  reorderPlan,
  mergeObjectivesIntoLesson,
  mergeObjectivesWithNext,
  updateLessonInPlan,
} from "./editorModel";
import { generateWordDocument } from "../lib/word-generator";
import { generateXlsx, generateKundelikXlsx } from "../lib/xlsx-generator";
import { totalHoursOf } from "./fromDb";
import { sourceDocLabel, matchSourceDoc } from "../lib/sourceDoc";
import { validateHours } from "./hoursValidation";
import { useHistory } from "./useHistory";
import { saveTemplate, KtpTemplate } from "./templateLib";

export function useKtpEditorState(planId: string) {
${stateLines.join('\n')}

  return {
    dbPlan, history, flat, loading, error, status, toast, busy, daysOfWeek, sourceDoc,
    historyOpen, templateFor, templateName, unfilledQuarter, editing, draft, mergeFor, mergeReason,
    setDaysOfWeek, setHistoryOpen, setTemplateFor, setTemplateName, setUnfilledQuarter, setDraft, setMergeFor, setMergeReason,
    save, recalcSchedule, applyEdit, beginEdit, doAddHour, doDeleteLesson, doSplit, doAddSor, doMergeObjectivesNext,
    handleDragEnd, updateLesson, confirmMerge, doSaveTemplate, exportWord, exportXlsx,
    hoursReport, progress
  };
}
`;

const hookPath = path.join(__dirname, 'Desktop', 'src', 'ktp', 'useKtpEditorState.ts');
fs.writeFileSync(hookPath, hookContent, 'utf8');

// Now replace stateLines in KtpEditor.tsx with the hook call
const replacement = `  const {
    dbPlan, history, flat, loading, error, status, toast, busy, daysOfWeek, sourceDoc,
    historyOpen, templateFor, templateName, unfilledQuarter, editing, draft, mergeFor, mergeReason,
    setDaysOfWeek, setHistoryOpen, setTemplateFor, setTemplateName, setUnfilledQuarter, setDraft, setMergeFor, setMergeReason,
    save, recalcSchedule, applyEdit, beginEdit, doAddHour, doDeleteLesson, doSplit, doAddSor, doMergeObjectivesNext,
    handleDragEnd, updateLesson, confirmMerge, doSaveTemplate, exportWord, exportXlsx,
    hoursReport, progress
  } = useKtpEditorState(planId);
`;

const newLines = [
  ...lines.slice(0, stateStart),
  replacement,
  ...lines.slice(stateEnd)
];

// add import for the hook
const importLine = `import { useKtpEditorState } from "../ktp/useKtpEditorState";`;
newLines.splice(10, 0, importLine);

fs.writeFileSync(editorPath, newLines.join('\n'), 'utf8');
console.log("State extraction successful.");
