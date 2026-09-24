// Матрица доступности учителей. 5 дней × 9 уроков (bool). false = недоступен.
// По умолчанию все доступны; совместители ограничены (данные пользователя).
// Запуск: node tools/bilimclass/build_availability.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const dir = path.join(ROOT, 'data', 'bilimclass');
const T = JSON.parse(fs.readFileSync(path.join(dir, 'teachers.json'), 'utf8'));

const DAYS = 5, PERIODS = 9;
const all = () => Array.from({ length: DAYS }, () => Array.from({ length: PERIODS }, () => true));

// ограничения: дни индексируются 0=Пн..4=Пт; уроки 0=1-й..8=9-й
const RULES = {
  'Сидоров Виктор Борисович':           { days: [1, 3] },                          // Вт и Чт, любые уроки
  'Аятова Анаргуль Жусуповна':          { days: [2] },                               // Ср, любые уроки
  'Байгазиева Айгерим Дуйсембековна':   { days: [1, 2, 3], periods: [3, 4] },        // Вт–Чт, 4–5 уроки
  'Иващенко Виталий Олегович':          { days: [0, 4], periods: [0, 1] },          // Пн и Пт, 1–2 уроки
  'Сапаргалиева Гульжихан Сансызбаевна':{ days: [2, 3], periods: [3, 4, 5, 6, 7, 8] },// Ср, Чт, с 4 урока
  'Жантимиров Асхат Каскарбаевич':      { days: [2, 3, 4] },                          // Ср, Чт, Пт
  'Жантимиров Эльдар Асхатович':        { days: [1, 4] },                             // Вт, Пт
  'Балташева Зару Такановна':           { days: [0], periods: [4, 5, 6, 7] },         // Пн, 5–8 уроки
  'Бедрина Мария Николаевна':           { days: [0, 1, 2, 3, 4], exceptDay: { 3: [0, 1, 2] } }, // все дни; Чт — только 1–3
  'Мельников Павел Викторович':         { days: [0, 1, 2, 3, 4], periods: [0, 1, 2, 3, 4] }   // только 1–5 уроки
};

function build(name) {
  const r = RULES[name];
  const m = all();
  if (!r) return m;
  for (let d = 0; d < DAYS; d++) for (let p = 0; p < PERIODS; p++) m[d][p] = false;
  const days = r.days || [0, 1, 2, 3, 4];
  const periods = r.periods || Array.from({ length: PERIODS }, (_, i) => i);
  for (const d of days) for (const p of periods) m[d][p] = true;
  if (r.exceptDay) for (const dStr in r.exceptDay) {
    const d = Number(dStr);
    for (let p = 0; p < PERIODS; p++) m[d][p] = false;
    for (const p of r.exceptDay[d]) m[d][p] = true;
  }
  return m;
}

const teachers = {};
const restricted = [];
for (const t of T.teachers) {
  teachers[t.fio] = build(t.fio);
  if (RULES[t.fio]) restricted.push(t.fio);
}

// учителя, добавленные вручную (нет в справочнике БилимКласса)
const OV = JSON.parse(fs.readFileSync(path.join(dir, 'overrides.json'), 'utf8'));
for (const t of OV.extra_teachers || []) if (!teachers[t.fio]) teachers[t.fio] = all();

// фиксированные занятия ЛУО/ДО: указанные учителя заняты в эти слоты
const SS = JSON.parse(fs.readFileSync(path.join(dir, 'special_ed_schedule.json'), 'utf8'));
const DAYIDX = { Пн: 0, Вт: 1, Ср: 2, Чт: 3, Пт: 4 };
for (const b of SS.busy_teachers || []) {
  if (!teachers[b.fio]) teachers[b.fio] = all();
  for (const d of b.days) for (const p of b.periods) teachers[b.fio][DAYIDX[d]][p - 1] = false;
  if (!restricted.includes(b.fio)) restricted.push(b.fio);
}

fs.writeFileSync(path.join(dir, 'teacher_availability.json'), JSON.stringify({
  note: 'Матрица доступности: [день 0=Пн..4=Пт][урок 0..8]. false = недоступен (ограничения совместителей + занятость на ЛУО/ДО). Остальные учителя — везде доступны.',
  days: DAYS, day_labels: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт'], periods_per_day: PERIODS,
  restricted_teachers: restricted, teachers
}, null, 2), 'utf8');
console.log('teachers=' + Object.keys(teachers).length + ' restricted=' + restricted.length);
