const XLSX = require('C:/Projects/VectorWorkspace/Desktop/node_modules/xlsx');
const fs = require('fs');
const dir = 'C:/Projects/VectorWorkspace/materials/Таблицы расписаний';

function norm(s) { return (s == null ? '' : s.toString()).replace(/\s+/g, ' ').trim(); }

// normalize a "Класс: X" value into canonical {grade,letter,type,key}
const TYPE_BY_TOKEN = { luo: 'luo', do: 'do' };
function normClass(raw) {
  let t = norm(raw).replace(/^Класс[:\s]+/i, '');
  let type = 'normal';
  const lower = t.toLowerCase();
  if (/лую/i.test(t) || /луо/i.test(t)) type = 'luo';
  else if (/д\.?\s*о\.?/i.test(t)) type = 'do';
  let tt = t.replace(/лую|луо|д\.?\s*о\.?/gi, '').trim();
  let m = tt.match(/^(\d+)\s*[-–]?\s*([а-яәА-ЯӘ]?)/);
  let grade = m ? parseInt(m[1]) : null;
  let letter = m ? m[2].trim() : '';
  const key = (grade == null ? '?' : grade) + (letter || '') + (type === 'normal' ? '' : '(' + type + ')');
  return { raw: t, grade, letter, type, key };
}

function parseLessonCell(text) {
  const raw = text == null ? '' : text.toString();
  const lines = raw.split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(x => x.length);
  const res = { raw: text, subject: null, teacher: null, time: null, note: null, lineCount: lines.length, lines };
  if (lines.length >= 1) res.subject = lines[0];
  if (lines.length >= 2) res.teacher = lines[1];
  if (lines.length >= 3) res.time = lines[2];
  if (lines.length >= 4) res.note = lines.slice(3).join('; ');
  return res;
}

const MONTHS = /(янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)/i;

function parseFile(file) {
  const wb = XLSX.readFile(dir + '/' + file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

  let className = null, quarter = null;
  for (const r of rows) for (const c of r) {
    const s = norm(c);
    let m = s.match(/Класс[:\s]+(.+)/i); if (m) className = m[1].trim();
    m = s.match(/(\d+)\s*четверть/i); if (m) quarter = parseInt(m[1]);
  }

  // find day header row
  let headerIdx = -1, dayCols = [], dayNames = [];
  for (let i = 0; i < rows.length; i++) {
    const hits = [];
    rows[i].forEach((c, ci) => {
      const s = norm(c).toLowerCase();
      const dm = s.match(/^(пн|вт|ср|чт|пт|сб|вс)$/);
      if (dm) hits.push({ ci, name: dm[1] });
    });
    if (hits.length >= 5) { headerIdx = i; dayCols = hits.map(h => h.ci); dayNames = hits.map(h => h.name); break; }
  }
  if (headerIdx < 0) return { file, className, quarter, error: 'no day header row' };

  const periodCol = Math.min(...dayCols) - 1;
  const lessons = [];
  let week = 0;
  let currentPeriod = null;
  let emptySlots = 0, ambiguous = 0, dateRowsSkipped = 0, junkRows = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const wkCell = row[periodCol - 1] !== undefined ? norm(row[periodCol - 1]) : '';
    const wm = wkCell.match(/(\d+)\s*недел/i);
    const isDateRow = dayCols.some(dc => MONTHS.test(norm(row[dc])));
    // a week-block starts on a "N неделя" label or a date row -> advance week
    if (wm) { week = parseInt(wm[1]); dateRowsSkipped++; continue; }
    if (isDateRow) { week++; dateRowsSkipped++; continue; }

    const s0 = norm(row[periodCol]);
    const periodNum = parseInt(s0, 10);
    const hasPeriod = Number.isInteger(periodNum) && periodNum >= 1 && periodNum <= 12;
    const isSubgroupRow = s0 === "#";
    const anyDayContent = dayCols.some(dc => norm(row[dc]).length > 0);
    if (!hasPeriod && !anyDayContent) { junkRows++; continue; }

    if (hasPeriod) currentPeriod = periodNum;
    const period = hasPeriod || isSubgroupRow ? currentPeriod : null;
    const wk = week < 1 ? 1 : week;
    for (let k = 0; k < dayCols.length; k++) {
      const dc = dayCols[k], day = dayNames[k];
      const txt = norm(row[dc]);
      if (txt.length === 0) { emptySlots++; continue; }
      const les = parseLessonCell(row[dc]);
      les.day = day; les.period = period; les.week = wk;
      if (les.lineCount < 2 || !les.teacher || !les.time) ambiguous++;
      lessons.push(les);
    }
  }

  return {
    file, className, quarter,
    days: dayNames, dayCount: dayNames.length,
    lessonCount: lessons.length, emptySlots, ambiguous, dateRowsSkipped, junkRows,
    lessons
  };
}

// ---- run over all .xls (skip lock/temp) ----
const all = fs.readdirSync(dir).filter(f => f.endsWith('.xls') && !f.includes('lock') && !f.startsWith('~'));
const parsed = all.map(parseFile);

// per-file console summary
console.log('FILE | class | quarter | week? | days | lessons | empty | ambig | notes');
for (const p of parsed) {
  if (p.error) { console.log(`${p.file} | ERROR: ${p.error}`); continue; }
  console.log(`${p.file} | ${p.className} | q${p.quarter} | d=${p.dayCount} | L=${p.lessonCount} | empty=${p.emptySlots} | ambig=${p.ambiguous} | skipDate=${p.dateRowsSkipped}`);
}

// aggregate by canonical class
const byClass = {};
for (const p of parsed) {
  if (p.error || !p.className) continue;
  const nc = normClass(p.className);
  const key = nc.key;
  if (!byClass[key]) byClass[key] = { ...nc, files: [], lessons: [] };
  byClass[key].files.push({ file: p.file, quarter: p.quarter, days: p.dayCount, lessons: p.lessonCount, ambiguous: p.ambiguous, empty: p.emptySlots });
  for (const l of p.lessons) byClass[key].lessons.push({ source_file: p.file, quarter: p.quarter, week: l.week, day: l.day, period: l.period, subject: l.subject, teacher: l.teacher, time: l.time, note: l.note, ambiguous: (l.lineCount < 2 || !l.teacher || !l.time) });
}

const summary = Object.values(byClass).map(c => ({
  key: c.key, type: c.type, grade: c.grade, letter: c.letter,
  fileCount: c.files.length,
  quarters: [...new Set(c.files.map(f => f.quarter).filter(q => q))].sort(),
  totalLessons: c.lessons.length,
  ambiguousLessons: c.lessons.filter(l => l.ambiguous).length,
}));

console.log('\n=== AGGREGATE BY CLASS ===');
console.log('class | type | #files | quarters | #lessons | #ambiguous');
for (const s of summary.sort((a, b) => a.key.localeCompare(b.key))) {
  console.log(`${s.key} | ${s.type} | ${s.fileCount} | ${s.quarters.join(',') || '-'} | ${s.totalLessons} | ${s.ambiguousLessons}`);
}
console.log('\nTotal classes:', summary.length);
const byType = {};
for (const s of summary) byType[s.type] = (byType[s.type] || 0) + 1;
console.log('By type:', JSON.stringify(byType));

// write JSON
const out = { generatedAt: new Date().toISOString(), classes: byClass, summary };
fs.writeFileSync('C:/Projects/VectorWorkspace/data/schedule_parsed.json', JSON.stringify(out, null, 2), 'utf8');
console.log('\nWrote data/schedule_parsed.json');
