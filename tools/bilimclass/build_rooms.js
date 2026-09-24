// Итоговые кабинеты: специализация + закреплённый учитель + кабинеты начальных классов.
// Ручные данные (по таблице пользователя). Запуск: node tools/bilimclass/build_rooms.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const dir = path.join(ROOT, 'data', 'bilimclass');
const T = JSON.parse(fs.readFileSync(path.join(dir, 'teachers.json'), 'utf8'));

const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const byFio = {};
for (const t of T.teachers) byFio[norm(t.fio)] = t.source_id;
byFio[norm('Романишина Ирина Михайловна')] = null; // manual teacher, нет source_id

const slug = s => s.toLowerCase().replace(/[^0-9a-zа-яёәіңғүұқөһ]+/gi, '_').replace(/^_|_$/g, '');

// [номер, название, тип, ФИО учителя, примечание]
const data = [
  ['01', 'Спортивный зал', 'Gym', null, 'физкультура (в целом)'],
  [null, 'Малый зал', 'Gym', null, 'физкультура (в целом)'],
  ['14', 'Кабинет истории', 'General', 'Досаева Мадина Хайрулловна', null],
  ['15', 'Кабинет робототехники', 'General', 'Ажикенова Мадина Аскаровна', 'универсальный, без специализации'],
  ['16', 'Кабинет физики', 'PhysicsLab', 'Русина Наталья Владимировна', null],
  ['17', 'Кабинет химии', 'ChemistryLab', 'Бабич Иман Денисович', null],
  ['18', 'Кабинет мультимедийный', 'General', 'Ильясова Алмагуль Бахтиаровна', null],
  ['19', 'Кабинет биологии', 'BiologyLab', 'Красноперова Ольга Викторовна', null],
  ['20', 'Кабинет русского языка', 'LanguageLab', 'Дмитриев Евгений Владимирович', null],
  ['23', 'Кабинет казахского языка и литературы', 'LanguageLab', 'Балгабаева Назигуль Кадыровна', null],
  ['24', 'Кабинет казахского языка', 'LanguageLab', 'Асаева Жанар Хайруллаевна', null],
  ['25', 'Кабинет математики', 'General', 'Пащенко Наталья Аркадьевна', null],
  ['26', 'Кабинет информатики', 'Informatics', 'Бедрина Мария Николаевна', null],
  ['27', 'Кабинет английского языка', 'LanguageLab', 'Акауова Индира Нурмухановна', null],
  ['28', 'Кабинет НВП', 'General', 'Боранбаев Дархан Боранбаевич', 'совместитель, в основном свободен'],
  ['29', 'Кабинет технологии (девочки)', 'Workshop', 'Романишина Ирина Михайловна', null],
  ['39', 'Кабинет технологии (мальчики)', 'Workshop', 'Жантимиров Асхат Каскарбаевич', 'совместитель, в основном свободен'],
  [null, 'Кабинет Шахмат', 'General', 'Ольков Геннадий Васильевич', null]
];

const rooms = data.map(([number, name, room_type, fio, note], i) => ({
  id: 'room_' + (number ? number : slug(name)),
  number: number,
  name: name + (number ? ` (№${number})` : ''),
  room_type,
  capacity: 30,
  base_teacher_id: fio ? (byFio[norm(fio)] ?? `manual:${slug(fio)}`) : null,
  base_teacher_name: fio || null,
  home_for: null,
  note: note
}));

// кабинеты начальных классов: кабинет привязан к классному руководителю;
// у Актаевой 2А и 4А учатся в одном кабинете №42.
const HOMES = [
  ['1А', '22', 'Жекеева Нурсулу Абуовна'],
  ['1Б', '8', 'Ажикенова Мадина Аскаровна'],
  ['2А', '42', 'Актаева Айгерим Ермеккызы'],
  ['2Б', '6', 'Квашнина Елена Витальевна'],
  ['3А', '7', 'Темерканова Олеся Владимировна'],
  ['4А', '42', 'Актаева Айгерим Ермеккызы'],
  ['4Б', '9', 'Радионова Наталья Александровна']
];
const homeByNumber = {};
for (const [cn, number, fio] of HOMES) {
  if (homeByNumber[number]) { homeByNumber[number].home_for_list.push(cn); homeByNumber[number].name = `Начальный класс ${homeByNumber[number].home_for_list.join('/')} (№${number})`; continue; }
  const room = {
    id: 'room_home_' + slug(number),
    number,
    name: `Начальный класс ${cn} (№${number})`,
    room_type: 'General',
    capacity: 30,
    base_teacher_id: byFio[norm(fio)] ?? `manual:${slug(fio)}`,
    base_teacher_name: fio,
    home_for: cn,
    home_for_list: [cn],
    note: 'кабинет классного руководителя; класс идёт сюда только на его уроки, на остальные — к другим учителям'
  };
  homeByNumber[number] = room;
  rooms.push(room);
}

// кабинет Шахмат — только для шахмат, в общий пул расписания не идёт
for (const r of rooms) r.usable = !/Шахмат/i.test(r.name);

fs.writeFileSync(path.join(dir, 'rooms.json'), JSON.stringify({
  source: 'БилимКласс (school-settings?tab=cabinets) + закрепление учителей (вручную)',
  school_id: 1017343, edu_year: 2026, parsed_at: new Date().toISOString(),
  counts: { rooms: rooms.length, home_rooms: rooms.filter(r => r.home_for).length },
  rooms
}, null, 2), 'utf8');
console.log('rooms=' + rooms.length);
