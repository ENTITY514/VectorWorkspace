// Итоговые деления на подгруппы из curriculum.json.
// Запуск: node tools/bilimclass/build_divisions.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const dir = path.join(ROOT, 'data', 'bilimclass');
const C = JSON.parse(fs.readFileSync(path.join(dir, 'curriculum.json'), 'utf8'));

const divisions = [];
for (const e of C.entries) {
  const tagged = (e.teachers || []).filter(t => t.subgroup);
  const isSplit = e.requires_split || tagged.length > 1;
  if (!isSplit) continue;
  let groups = [];
  if (tagged.length) groups = tagged.map(t => ({ group: t.subgroup, teacher: t.fio }));
  else if (e.subgroup_teachers) groups = Object.entries(e.subgroup_teachers).map(([g, f]) => ({ group: g, teacher: f }));
  divisions.push({
    class: e.class_name,
    subject: e.subject_name,
    weekly_hours: e.weekly_hours,
    groups,
    cross_with: e.requires_split ? 'Иностранный язык' : null,
    note: e.requires_split ? 'делится теми же подгруппами, что английский; урок одной подгруппы идёт вместе с английским другой' : null
  });
}
divisions.sort((a, b) => a.class.localeCompare(b.class, 'ru') || a.subject.localeCompare(b.subject, 'ru'));

fs.writeFileSync(path.join(dir, 'divisions.json'), JSON.stringify({ source: 'derived: curriculum.json', edu_year: 2026, divisions }, null, 2), 'utf8');

const rows = ['| Класс | Предмет | ч/нед | Подгруппа | Учитель |', '|---|---|---:|---|---|'];
for (const d of divisions) {
  d.groups.forEach((g, i) => rows.push(`| ${i === 0 ? d.class : ''} | ${i === 0 ? d.subject : ''} | ${i === 0 ? d.weekly_hours : ''} | ${g.group} | ${g.teacher} |`));
}
fs.writeFileSync(path.join(dir, 'divisions.md'), rows.join('\n'), 'utf8');
console.log('divisions=' + divisions.length);
