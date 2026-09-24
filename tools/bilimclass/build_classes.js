// Сборка classes.json (численность, классный руководитель, смена) из people-management/group/list.
// Сырьё: data/bilimclass/raw/classes-raw.json
// Запуск: node tools/bilimclass/build_classes.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const dir = path.join(ROOT, 'data', 'bilimclass');
const raw = JSON.parse(fs.readFileSync(path.join(dir, 'raw', 'classes-raw.json'), 'utf8'));
const rows = raw.rows || raw.data || raw;

const CYR = { A:'А', B:'В', a:'а', b:'в' };
const toCyr = s => (s || '').replace(/[ABab]/g, ch => CYR[ch] || ch);

const classes = rows.map(r => ({
  group_id: r.id,
  class_name: toCyr(String(r.parallel.label) + r.letter),
  parallel: r.parallel.label,
  letter: toCyr(r.letter),
  language: r.language.label,
  headcount: r.contingent ? r.contingent.count : null,
  class_teacher: r.teacher ? r.teacher.name : null,
  shift: r.eduShift || 1,
  status: r.status,
  time_scheme: r.timeScheme ? r.timeScheme.name : null
})).sort((a, b) => a.parallel - b.parallel || a.class_name.localeCompare(b.class_name, 'ru'));

fs.writeFileSync(path.join(dir, 'classes.json'), JSON.stringify({
  source: 'https://www.bilimclass.kz/2026/backoffice/groups',
  school_id: 1017343, edu_year: 2026, parsed_at: new Date().toISOString(),
  counts: { classes: classes.length }, classes
}, null, 2), 'utf8');
console.log('classes=' + classes.length);
