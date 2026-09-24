// Сборка teachers.json и programs.json из сырых ответов API билимкласса.
// Сырьё: data/bilimclass/raw/{teachers-raw,eduprog-raw,subgroups}.json
// Запуск: node tools/bilimclass/build_teachers_programs.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const dir = path.join(ROOT, 'data', 'bilimclass');
const rawDir = path.join(dir, 'raw');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));

const CYR = { A:'А', B:'В', C:'С', E:'Е', H:'Н', K:'К', M:'М', O:'О', P:'Р', T:'Т', X:'Х', Y:'У', a:'а', b:'в', c:'с', e:'е', h:'н', k:'к', m:'м', o:'о', p:'р', t:'т', x:'х', y:'у' };
const toCyr = s => (s || '').replace(/[ABCEHKMOPTXYabcehkmoptxy]/g, ch => CYR[ch] || ch);

const traw = read(path.join(rawDir, 'teachers-raw.json'));
const eraw = read(path.join(rawDir, 'eduprog-raw.json'));
const subraw = read(path.join(rawDir, 'subgroups.json'));
const OV = fs.existsSync(path.join(dir, 'overrides.json')) ? read(path.join(dir, 'overrides.json')) : {};

// карта uuid -> имя подгруппы (иначе имена подгрупп не различные)
const subNameByUuid = {};
const classByUuid = {};
for (const it of subraw.flat) if (it.subgroupUuid) { subNameByUuid[it.subgroupUuid] = it.subgroupName; classByUuid[it.subgroupUuid] = it.name; }

// ---------- classes (from subgroups list, distinct group ids) ----------
const groupsMap = {};
for (const it of subraw.flat) {
  if (it.subgroupUuid) continue;
  groupsMap[it.groupId] = { group_id: it.groupId, class_name: toCyr(it.name), language: it.lang, subgroup_name: null };
}

// ---------- teachers ----------
function normClasses(list) {
  const seen = new Set(), out = [];
  for (const c of list || []) {
    const key = `${c.groupId}|${c.subgroupUuid || ''}`;
    if (seen.has(key)) continue; seen.add(key);
    out.push({
      group_id: c.groupId,
      class_name: toCyr(c.className),
      language: c.language,
      subgroup_uuid: c.subgroupUuid || null,
      subgroup_name: c.subgroupUuid ? (subNameByUuid[c.subgroupUuid] || null) : null
    });
  }
  return out;
}
let teachers = traw.teachers.map(t => ({
  source_id: t.id, fio: t.fio, position: t.position, languages: t.languages || [],
  max_weekly_hours: t.maxWeeklyHours,
  subjects: (t.subjects || [])
    // пустые квалификации без классов и часов (напр. «спортивные игры» директора) отбрасываем
    .filter(s => (s.groups || []).length > 0 || s.weeklyHours != null)
    .map(s => ({ subject_id: s.subjectId, subject_name: (s.name || '').trim(), total_weekly_hours: s.weeklyHours, classes: normClasses(s.groups) }))
}));

// объединяем дубль Квашниной
const DUP = [1852744, 1884822];
const dup = teachers.filter(t => DUP.includes(t.source_id));
const others = teachers.filter(t => !DUP.includes(t.source_id));
if (dup.length === 2) {
  const bySubj = {};
  for (const t of dup) for (const s of t.subjects) {
    const k = String(s.subject_id);
    if (!bySubj[k]) bySubj[k] = { subject_id: s.subject_id, subject_name: s.subject_name, total_weekly_hours: s.total_weekly_hours, classes: [] };
    if (s.total_weekly_hours != null) bySubj[k].total_weekly_hours = Math.max(bySubj[k].total_weekly_hours || 0, s.total_weekly_hours);
    for (const c of s.classes) if (!bySubj[k].classes.some(x => x.group_id === c.group_id && x.subgroup_uuid === c.subgroup_uuid)) bySubj[k].classes.push(c);
  }
  others.push({
    source_id: 1884822, merged_from: DUP, fio: dup[0].fio, position: 'учитель/заведующий',
    languages: [...new Set(dup.flatMap(t => t.languages))],
    max_weekly_hours: Math.max(...dup.map(t => t.max_weekly_hours || 0)),
    subjects: Object.values(bySubj)
  });
}
teachers = others.sort((a, b) => a.fio.localeCompare(b.fio, 'ru'));

const splits = {};
for (const t of teachers) for (const s of t.subjects) for (const c of s.classes) {
  if (!c.subgroup_uuid) continue;
  const k = `${c.class_name}|${s.subject_name}`;
  splits[k] = splits[k] || [];
  if (!splits[k].some(x => x.teacher_id === t.source_id)) splits[k].push({ teacher_id: t.source_id, fio: t.fio, subgroup: c.subgroup_name });
}
fs.writeFileSync(path.join(dir, 'teachers.json'), JSON.stringify({
  source: 'https://www.bilimclass.kz/2026/v3/backoffice/personnel', school_id: 1017343, edu_year: 2026,
  parsed_at: new Date().toISOString(),
  counts: { teachers: teachers.length, classes: Object.keys(groupsMap).length, split_cases: Object.keys(splits).length },
  classes: groupsMap, teachers, split_index: splits
}, null, 2), 'utf8');

// ---------- programs ----------
const classes = [], programs = {};
for (const g of eraw.groups) {
  const short = toCyr(String(g.parallel) + g.letter);
  const p = eraw.programs[g.id] || {};
  const subs = (p.data || []).map(s => ({
    subject_id: s.subjectId, subject_name: (s.subjectName || '').trim(),
    weekly_hours: s.classWeeklyHoursPlan, year_hours: s.classHoursPlan,
    score_type: s.scoreType, score_type_name: s.scoreTypeName,
    period: s.periodType, period_name: s.periodTypeName, difficulty: s.difficulty,
    subgroups_enabled: !!s.flagSubgroupsEnabled
  }));
  const sum = subs.reduce((a, s) => a + (Number(s.weekly_hours) || 0), 0);
  // тип сопровождения из описания (последнее слово): ДО / ЛУО / ЗПР / ООП
  const kindWord = String(g.inclusiveDescription || '').trim().split(/\s+/).pop();
  const support_type = ['ДО', 'ЛУО', 'ЗПР', 'ООП'].includes(kindWord) ? kindWord : null;
  const home_learning = support_type === 'ДО';
  classes.push({ group_id: g.id, class_name: short, full_name: toCyr(g.name), parallel: g.parallel, letter: toCyr(g.letter), language: g.lang, is_ipo: g.isIpo, inclusive_description: g.inclusiveDescription, support_type, home_learning, status: g.groupStatus, subjects: subs.length, weekly_hours_total: sum });
  programs[g.id] = { group_id: g.id, class_name: short, full_name: toCyr(g.name), is_ipo: g.isIpo, inclusive_description: g.inclusiveDescription, support_type, home_learning, status: g.groupStatus, subjects: subs, weekly_hours_total: sum };
}

// ручные метки классов (напр. 6В = ЛУО, записан как обычный)
for (const m of OV.class_marks || []) {
  for (const c of classes) if (c.class_name === m.class) { if (m.support_type) c.support_type = m.support_type; if (m.is_luo != null) c.is_luo = !!m.is_luo; if (m.note) c.mark_note = m.note; }
  for (const gid in programs) if (programs[gid].class_name === m.class) { if (m.support_type) programs[gid].support_type = m.support_type; if (m.is_luo != null) programs[gid].is_luo = !!m.is_luo; if (m.note) programs[gid].mark_note = m.note; }
}

fs.writeFileSync(path.join(dir, 'programs.json'), JSON.stringify({
  source: 'https://www.bilimclass.kz/2026/edu-prog', school_id: 1017343, edu_year: 2026, parsed_at: new Date().toISOString(),
  counts: { classes: classes.length, active: classes.filter(c => c.status === 'active').length, ipo: classes.filter(c => c.is_ipo).length },
  classes, programs
}, null, 2), 'utf8');

console.log('teachers=' + teachers.length + ' classes=' + classes.length);
