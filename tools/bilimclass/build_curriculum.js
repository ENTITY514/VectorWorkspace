// Сборка итоговой нагрузки (класс × предмет × учитель × часы).
// Источник часов — программы классов (programs.json). Учителя — teachers.json.
// Ручные правки — overrides.json (заменяют автопривязку целиком).
// Запуск: node tools/bilimclass/build_curriculum.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const dir = path.join(ROOT, 'data', 'bilimclass');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));

const T = read(path.join(dir, 'teachers.json'));
const P = read(path.join(dir, 'programs.json'));
const OV = read(path.join(dir, 'overrides.json'));

const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const CANON = { 'английский язык': 'иностранный язык', 'букварь': 'обучение грамоте' };
const key = name => { const n = norm(name); return CANON[n] || n; };

const byFio = {};
for (const t of T.teachers) byFio[norm(t.fio)] = t;
// учителя, добавленные вручную (нет в справочнике билимкласса)
for (const t of OV.extra_teachers || []) byFio[norm(t.fio)] = { source_id: null, fio: t.fio, manual: true };

// индекс: group_id -> canonical subject -> [teacher]
const idx = {};
for (const t of T.teachers) for (const s of t.subjects) for (const c of s.classes) {
  const k = key(s.subject_name);
  idx[c.group_id] = idx[c.group_id] || {};
  idx[c.group_id][k] = idx[c.group_id][k] || [];
  if (!idx[c.group_id][k].some(x => x.source_id === t.source_id))
    idx[c.group_id][k].push({ teacher_source_id: t.source_id, fio: t.fio });
}

const entries = [], unassigned = [], multi = [];
for (const gid in P.programs) {
  const prog = P.programs[gid];
  if (prog.status !== 'active' || prog.is_ipo) continue;
  for (const s of prog.subjects) {
    const cand = (idx[gid] && idx[gid][key(s.subject_name)]) || [];
    const e = {
      class_name: prog.class_name, group_id: Number(gid),
      subject_id: s.subject_id, subject_name: s.subject_name,
      weekly_hours: s.weekly_hours, period: s.period,
      teachers: cand.map(x => ({ teacher_source_id: x.teacher_source_id, fio: x.fio })),
      split: cand.length > 1, manual: false
    };
    entries.push(e);
  }
}

// применяем ручные правки
const applied = [], missing = [];
for (const ov of OV.assignments) {
  const e = entries.find(x => x.class_name === ov.class && x.subject_name === ov.subject);
  if (!e) { missing.push(`${ov.class} | ${ov.subject}`); continue; }
  const ts = [];
  for (const item of ov.teachers) {
    const fio = typeof item === 'string' ? item : item.fio;
    const subgroup = typeof item === 'string' ? null : (item.subgroup || null);
    const t = byFio[norm(fio)];
    if (!t) { missing.push(`учитель «${fio}» не найден`); continue; }
    ts.push({ teacher_source_id: t.source_id, fio: t.fio, ...(subgroup ? { subgroup } : {}) });
  }
  e.teachers = ts;
  e.split = ts.length > 1;
  e.manual = true;
  applied.push(`${ov.class} | ${ov.subject} -> ${ts.map(t => t.fio + (t.subgroup ? ' (' + t.subgroup + ')' : '')).join(' + ')}`);
}

// класс-комплекты (совмещённые уроки)
const JL = read(path.join(dir, 'joint_lessons.json'));
const jointApplied = [], jointProblems = [];
for (const j of JL.joint_lessons) {
  for (const cn of j.classes) {
    const subj = j.subjects ? j.subjects[cn] : j.subject;
    const e = entries.find(x => x.class_name === cn && x.subject_name === subj);
    if (!e) { jointProblems.push(`${j.id}: нет записи «${cn} | ${subj}»`); continue; }
    (e.joint_lessons = e.joint_lessons || []).push(j.id);
  }
  const label = j.subjects ? j.classes.map(c => `${c}:${j.subjects[c]}`).join(' + ') : `${j.classes.join(' + ')} | ${j.subject}`;
  jointApplied.push(`${j.id}: ${label} | ${j.hours_per_week}ч совместно`);
}
for (const e of entries) {
  if (!e.joint_lessons) continue;
  const need = e.joint_lessons.reduce((a, id) => a + (JL.joint_lessons.find(j => j.id === id).hours_per_week || 0), 0);
  if (need > (e.weekly_hours || 0)) jointProblems.push(`${e.class_name} | ${e.subject_name}: совместных ${need}ч > недельных ${e.weekly_hours}ч`);
}

// деления на подгруппы (в т.ч. перекрёстные: информатика ↔ английский)
const SR = read(path.join(dir, 'subgroup_rules.json'));
const subgroupProblems = [];
for (const g of SR.group_split_subjects || []) {
  for (const cn of g.classes) {
    const e = entries.find(x => x.class_name === cn && x.subject_name === g.subject);
    if (!e) { subgroupProblems.push(`${cn} | ${g.subject}`); continue; }
    e.requires_split = true;
    e.subgroups = g.groups;
    e.subgroup_teachers = g.teachers_by_group || null;
  }
}

for (const e of entries) {
  if (e.teachers.length === 0) unassigned.push(e);
  if (e.teachers.length > 1) multi.push(e);
}

const used = new Set();
for (const e of entries) for (const t of e.teachers) used.add(t.teacher_source_id + '|' + e.group_id + '|' + key(e.subject_name));
const leftover = [];
for (const t of T.teachers) for (const s of t.subjects) for (const c of s.classes) {
  if (!used.has(t.source_id + '|' + c.group_id + '|' + key(s.subject_name)))
    leftover.push({ teacher: t.fio, subject: s.subject_name, subject_id: s.subject_id, class: c.class_name, group_id: c.group_id });
}

const out = {
  source: 'derived: programs.json (часы) + teachers.json (учителя) + overrides.json',
  edu_year: 2026,
  rule: 'часы — из программы класса; учителя — из справочника; overrides переопределяют привязку',
  counts: {
    entries: entries.length, assigned: entries.filter(e => e.teachers.length).length,
    unassigned: unassigned.length, multi_teacher: multi.length,
    manual_overrides: applied.length, leftover_teacher_assignments: leftover.length,
    joint_groups: JL.joint_lessons.length
  },
  applied_overrides: applied,
  overrides_not_applied: missing,
  joint_lessons: JL.joint_lessons,
  joint_problems: jointProblems,
  subgroup_rules: SR.group_split_subjects || [],
  subgroup_cross_pairs: SR.cross_pairs || [],
  subgroup_problems: subgroupProblems,
  entries, unassigned, multi_teacher: multi, leftover_teacher_assignments: leftover
};
fs.writeFileSync(path.join(dir, 'curriculum.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify(out.counts));
if (missing.length) console.log('NOT APPLIED:', missing.join('; '));
