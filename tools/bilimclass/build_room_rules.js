// Правила использования кабинетов и перемещений учителей.
// Запуск: node tools/bilimclass/build_room_rules.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const dir = path.join(ROOT, 'data', 'bilimclass');
const R = JSON.parse(fs.readFileSync(path.join(dir, 'rooms.json'), 'utf8'));
const T = JSON.parse(fs.readFileSync(path.join(dir, 'teachers.json'), 'utf8'));
const P = JSON.parse(fs.readFileSync(path.join(dir, 'programs.json'), 'utf8'));
const CL = JSON.parse(fs.readFileSync(path.join(dir, 'classes.json'), 'utf8'));

const roomById = {};
for (const r of R.rooms) roomById[r.id] = r;

// fio -> список кабинетов, где он «сидит» (спецкабинет или кабинет своего начального класса)
const teacherRooms = {};
const addRoom = (fio, roomId) => { if (!fio || !roomId) return; (teacherRooms[fio] = teacherRooms[fio] || []); if (!teacherRooms[fio].includes(roomId)) teacherRooms[fio].push(roomId); };

// спецкабинеты (закреплённый учитель)
for (const r of R.rooms) if (r.base_teacher_name) addRoom(r.base_teacher_name, r.id);

// кабинеты начальных классов: классный руководитель привязан к кабинету своего класса
const homeByClass = {};
for (const r of R.rooms) for (const cn of (r.home_for_list || (r.home_for ? [r.home_for] : []))) homeByClass[cn] = r.id;
for (const c of CL.classes) if (homeByClass[c.class_name] && c.class_teacher) addRoom(c.class_teacher, homeByClass[c.class_name]);

const withRoom = [], withoutRoom = [];
for (const t of T.teachers) {
  const rooms = teacherRooms[t.fio] || [];
  if (rooms.length) withRoom.push({ fio: t.fio, room_ids: rooms, room_names: rooms.map(id => roomById[id].name) });
  else withoutRoom.push(t.fio);
}
if (!teacherRooms['Романишина Ирина Михайловна']) addRoom('Романишина Ирина Михайловна', 'room_29');
if (!withRoom.some(x => x.fio === 'Романишина Ирина Михайловна')) {
  const rooms = teacherRooms['Романишина Ирина Михайловна'] || [];
  withRoom.push({ fio: 'Романишина Ирина Михайловна', room_ids: rooms, room_names: rooms.map(id => roomById[id] ? roomById[id].name : id) });
  const i = withoutRoom.indexOf('Романишина Ирина Михайловна'); if (i >= 0) withoutRoom.splice(i, 1);
}

// предметы, встречающиеся в нагрузке (для справки/маппинга)
const subjects = new Set();
for (const gid in P.programs) for (const s of P.programs[gid].subjects) subjects.add(s.subject_name);

const rules = {
  source: 'ручные правила (пользователь) + rooms.json',
  edu_year: 2026,
  fixed_room_types: {
    'Физическая культура': 'Gym',
    'Адаптивная физическая культура': 'Gym',
    'Физика': 'PhysicsLab',
    'Химия': 'ChemistryLab',
    'Биология': 'BiologyLab',
    'Информатика и искусственный интеллект': 'Informatics',
    'Цифровая грамотность и искусственный интеллект': 'Informatics',
    'Художественный труд': 'Workshop',
    'Трудовое обучение': 'Workshop',
    'Начальная военная подготовка': 'room_28'
  },
  languages_flexible: ['Русский язык', 'Русская литература', 'Русский язык и литература', 'Казахский язык', 'Казахская литература', 'Казахский язык и литература', 'Иностранный язык', 'Английский язык', 'Чтение и развитие речи'],
  workshop_subjects: ['Художественный труд', 'Трудовое обучение', 'Хозяйственный труд'],
  general_subjects: ['Музыка', 'Изобразительное искусство', 'Математика', 'Алгебра', 'Геометрия', 'Алгебра и начала анализа', 'История Казахстана', 'Всемирная история', 'География', 'Естествознание', 'Познание мира', 'Обучение грамоте', 'Букварь', 'Литературное чтение'],
  home_rooms: Object.fromEntries(Object.entries(homeByClass)),
  teacher_base_room: Object.fromEntries(withRoom.map(x => [x.fio, x.room_ids[0]])),
  teacher_rooms: Object.fromEntries(withRoom.map(x => [x.fio, x.room_ids])),
  teachers_with_base_room: withRoom,
  teachers_without_base_room: withoutRoom,
  never_move: ['Пащенко Наталья Аркадьевна'],
  rules_text: [
    'Учителя, закреплённые за кабинетом, ведут уроки у себя и не перемещаются.',
    'Перемещаются только учителя без закреплённого кабинета; при окне у «кабинетного» учителя свободный кабинет отдаётся учителю без кабинета.',
    'Языки можно проводить в обычных кабинетах.',
    'Музыка, ИЗО, математика, история и пр. — в любом обычном (General) кабинете.',
    'Наталья Аркадьевна (Пащенко Н.А.) — только у себя, не перемещать.',
    'Особый случай (свап): уроки химии ведёт Красноперова О.В. в кабинете химии (room_17); Бабич И.Д. в это время переезжает в кабинет биологии (room_19).'
  ],
  room_swaps: [
    { subject: 'Химия', teacher: 'Красноперова Ольга Викторовна', uses_room_id: 'room_17', displaced_teacher: 'Бабич Иман Денисович', displaced_to_room_id: 'room_19', note: 'свап кабинетами' }
  ],
  pending_notes: [
    'Дни/уроки совместителей (Боранбаев, Жантимиров) — ожидаются.',
    'Труды в начальных классах: уточнить кабинет (мастерские или свой).',
    'Цифровая грамотность (2-4): уточнить кабинет (свой/информатики).'
  ]
};
fs.writeFileSync(path.join(dir, 'room_rules.json'), JSON.stringify(rules, null, 2), 'utf8');
console.log('with_room=' + withRoom.length + ' without_room=' + withoutRoom.length);
