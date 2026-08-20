const fs = require('fs');
const path = require('path');

const editorPath = path.join(__dirname, 'Desktop', 'src', 'panels', 'KtpEditor.tsx');
let content = fs.readFileSync(editorPath, 'utf8').replace(/\r\n/g, '\n');

const lines = content.split('\n');

const rbStart = lines.findIndex(l => l.includes('const rowBackground ='));
const rbEnd = lines.findIndex((l, i) => i > rbStart && l.trim() === '};');

const rowBackgroundCode = lines.slice(rbStart, rbEnd + 1).join('\n');

const propsStart = lines.findIndex(l => l.includes('interface KtpTableProps {'));
const tableEnd = lines.length - 1;

const tableCode = lines.slice(propsStart, tableEnd + 1).join('\n');

const ktpTablePath = path.join(__dirname, 'Desktop', 'src', 'ktp', 'KtpTable.tsx');
const ktpTableContent = `import { Fragment, useState, useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IKtpLesson, ILessonObjective, LessonRowType, KtpPlan as FlatPlan } from "./model/types";

${rowBackgroundCode}

${tableCode}
`;

fs.writeFileSync(ktpTablePath, ktpTableContent, 'utf8');

const newLines = [];
let skip = false;
for (let i = 0; i < lines.length; i++) {
  if (i === rbStart) {
    skip = true;
  }
  if (i === propsStart) {
    skip = true;
  }

  if (!skip) {
    newLines.push(lines[i]);
  }

  if (skip && i === rbEnd) {
    skip = false;
  }
}

const importLine = `import { KtpTable } from "../ktp/KtpTable";`;
newLines.splice(12, 0, importLine);

fs.writeFileSync(editorPath, newLines.join('\n'), 'utf8');

console.log("Extraction successful.");
