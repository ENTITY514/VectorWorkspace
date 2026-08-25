const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const parsedPath = path.join(root, "data", "schedule_parsed.json");
const catalogPath = path.join(root, "data", "synthetic", "catalog.json");
const parsed = JSON.parse(fs.readFileSync(parsedPath, "utf8"));
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

const compact = value => String(value || "")
  .toLowerCase()
  .replace(/ё/g, "е")
  .replace(/[^a-zа-яәіңғқөұүһ0-9]+/gi, "");

const classKey = (grade, letter, type) => `${grade}|${letter || ""}|${type || "normal"}`;
const classByKey = new Map(catalog.classes.map(c => [classKey(c.grade, c.letter, c.type || c.class_type), c]));
const teacherByName = new Map(catalog.teachers.map(t => [compact(t.full_name), t]));

const subjectByName = new Map();
for (const subject of catalog.subjects) subjectByName.set(compact(subject.name), subject);

// Only high-confidence abbreviations are collapsed. Unknown variants remain
// separate subjects so no source lesson is silently lost.
const subjectAliases = new Map([
  [compact("Физкультура."), "pe"],
  [compact("Дене шынықтыру."), "pe"],
  [compact("Музыка."), "music"],
  [compact("Музыка и пение"), "music"],
  [compact("ИЗО."), "izo"],
  [compact("Алгебра ж. анализ б,"), "algebra"],
  [compact("Алгебра и нач. ан."), "algebra"],
  [compact("Труд. об."), "trud"],
  [compact("Ручной труд."), "trud"],
  [compact("Еңбекке баулу"), "к_ркем_е_бек"],
  [compact("бейнелеу өнері"), "izo"],
  [compact("Всемирная история"), "д_ниеж_з_тарихы"],
  [compact("История Каз-на"), "аза_стан_тарихы"],
  [compact("Букварь, Обучение гр"), "bukvar"],
  [compact("Английский язык (1гр.анг.яз)"), "english"],
  [compact("Английский язык (2гр.анг.яз)"), "english"],
  [compact("Рус. литература"), "literature"],
  [compact("Английский язык"), "english"],
  [compact("Информатика"), "informatics"],
  [compact("Қазақ тілі"), "аза_т_л"],
  [compact("Қазақ әдебиет"), "аза_дебиет"],
  [compact("Қазақстан тарихы"), "аза_стан_тарихы"],
  [compact("Құқық негіздері"), "ы_нег_здер"],
  [compact("Орыс тілі"), "орыс_т_л"],
  [compact("Орыс тілі ж/е әдеб."), "орыс_т_л_ж_е_деб"],
  [compact("Дүниежүзі тарихы"), "д_ниеж_з_тарихы"],
  [compact("Көркем еңбек."), "к_ркем_е_бек"],
  [compact("АФК"), "афк"],
  [compact("ЦГ"), "цг"],
  [compact("ЦС"), "цс"],
  [compact("НВиТП"), "нвитп"],
  [compact("РРиК"), "ррик"],
  [compact("ПТО"), "пто"],
  [compact("ПР"), "пр"],
  [compact("СБО."), "сбо"],
  [compact("Счет."), "счет"],
  [compact("Человек и мир."), "человек_и_мир"],
  [compact("Ч и РР"), "ч_и_рр"],
  [compact("Познание мира"), "poznanie"],
  [compact("Общество и право"), "общество_и_право"],
  [compact("Основы права"), "основы_права"],
]);

const subjectById = new Map(catalog.subjects.map(s => [s.id, s]));
const createdSubjects = [];
const subjectMappings = [];

function subjectFor(sourceName) {
  const source = String(sourceName || "").trim();
  const key = compact(source);
  let subject;
  let method;

  // Explicit aliases take precedence over subjects created by an earlier run.
  if (subjectAliases.has(key)) {
    subject = subjectById.get(subjectAliases.get(key));
    method = "alias";
  } else {
    subject = subjectByName.get(key);
    method = "exact-normalized";
  }

  if (!subject) {
    const id = `xls_${crypto.createHash("sha1").update(key, "utf8").digest("hex").slice(0, 12)}`;
    subject = {
      id,
      name: source,
      sanitary_weight: 5,
      required_room_type: null,
      requires_split: false,
      is_double_allowed: false,
      related_subjects_json: "[]",
    };
    subjectByName.set(key, subject);
    subjectById.set(id, subject);
    createdSubjects.push(subject);
    method = "created-from-xls";
  }

  subjectMappings.push({ source: source, subject_id: subject.id, subject_name: subject.name, method });
  return subject;
}

const roomByName = new Map(catalog.rooms.map(r => [compact(r.name), r]));
function roomFor(note) {
  const source = String(note || "").trim();
  const key = compact(source);
  if (source && roomByName.has(key)) return { id: roomByName.get(key).id, method: "exact" };

  const aliases = [
    [/спортивный зал/i, "r_2_gym"],
    [/нет кабинета/i, "r_20_general"],
    [/начальн|бастауыш/i, "r_1_general"],
    [/русский язык/i, "r_17_languagelab"],
    [/казахский язык/i, "r_12_languagelab"],
    [/английский язык|ағылшын тілі/i, "r_22_languagelab"],
    [/математик/i, "r_16_general"],
    [/физик/i, "r_7_general"],
    [/хими/i, "r_8_chemistrylab"],
    [/биологи/i, "r_23_biologylab"],
    [/географи/i, "r_18_general"],
    [/истори/i, "r_3_general"],
    [/информатик/i, "r_10_informatics"],
    [/технолог|труд/i, "r_19_workshop"],
    [/мультимеди/i, "r_11_general"],
    [/немецкий язык/i, "r_13_languagelab"],
    [/нвп/i, "r_9_general"],
  ];
  for (const [pattern, id] of aliases) if (pattern.test(source)) return { id, method: "alias" };
  return { id: "r_1_general", method: source ? "fallback-general" : "empty-note" };
}

const dayIndex = { пн: 0, вт: 1, ср: 2, чт: 3, пт: 4, сб: 5, вс: 6 };
const output = { 1: [], 2: [], 3: [], 4: [] };
const issues = { unknownClasses: [], unknownTeachers: [], invalidLessons: [], roomFallbacks: [], duplicates: [] };
const seenSlots = new Map();
let duplicateLessons = 0;

for (const [key, classData] of Object.entries(parsed.classes)) {
  const cls = classByKey.get(classKey(classData.grade, classData.letter, classData.type));
  if (!cls) { issues.unknownClasses.push({ key, grade: classData.grade, letter: classData.letter, type: classData.type }); continue; }

  for (const lesson of classData.lessons) {
    if (!lesson.quarter || lesson.period == null || dayIndex[lesson.day] == null || !lesson.subject || !lesson.teacher || !lesson.time) {
      issues.invalidLessons.push({ class: key, lesson });
      continue;
    }

    const teacher = teacherByName.get(compact(lesson.teacher));
    if (!teacher) { issues.unknownTeachers.push({ class: key, teacher: lesson.teacher, lesson }); continue; }
    const subject = subjectFor(lesson.subject);
    const room = roomFor(lesson.note);
    if (room.method !== "exact" && room.method !== "alias") issues.roomFallbacks.push({ class: key, note: lesson.note || "", room_id: room.id, method: room.method });

    const slotKey = [lesson.quarter, cls.id, lesson.week || 1, dayIndex[lesson.day], lesson.period, subject.id, teacher.id, room.id].join("|");
    if (seenSlots.has(slotKey)) {
      duplicateLessons++;
      issues.duplicates.push({ key: slotKey, first_file: seenSlots.get(slotKey), duplicate_file: lesson.source_file || "" });
      continue;
    }
    seenSlots.set(slotKey, lesson.source_file || "");

    output[lesson.quarter].push({
      class_id: cls.id,
      subject_id: subject.id,
      teacher_id: teacher.id,
      room_id: room.id,
      day: dayIndex[lesson.day],
      period: lesson.period - 1,
      quarter: lesson.quarter,
      week: lesson.week || 1,
      source_file: lesson.source_file || "",
      class_type: cls.type || "normal",
      source_subject: lesson.subject,
      source_teacher: lesson.teacher,
      source_time: lesson.time,
      source_note: lesson.note || "",
    });
  }
}

// Keep the catalog complete for the newly encountered subject names.
if (createdSubjects.length) catalog.subjects.push(...createdSubjects);
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");

const report = {
  generatedAt: new Date().toISOString(),
  source: "materials/Таблицы расписаний",
  totals: {
    sourceLessons: Object.values(parsed.classes).reduce((sum, c) => sum + c.lessons.length, 0),
    importedLessons: Object.values(output).reduce((sum, rows) => sum + rows.length, 0),
    duplicateLessons,
    createdSubjects: createdSubjects.length,
    mappings: subjectMappings.length,
  },
  byQuarter: Object.fromEntries(Object.entries(output).map(([q, rows]) => [q, { lessons: rows.length, classes: new Set(rows.map(r => r.class_id)).size, teachers: new Set(rows.map(r => r.teacher_id)).size, subjects: new Set(rows.map(r => r.subject_id)).size }])),
  byType: Object.fromEntries(["normal", "luo", "do"].map(type => [type, { lessons: Object.values(output).flat().filter(r => r.class_type === type).length, classes: new Set(Object.values(output).flat().filter(r => r.class_type === type).map(r => r.class_id)).size }])),
  subjectMappings: [...new Map(subjectMappings.map(m => [m.source, m])).values()].sort((a, b) => a.source.localeCompare(b.source)),
  issues,
};

const importSummaryPath = path.join(root, "data", "synthetic", "import_summary.json");
const previousSummary = fs.existsSync(importSummaryPath)
  ? JSON.parse(fs.readFileSync(importSummaryPath, "utf8"))
  : {};
previousSummary.total_files = Object.values(parsed.classes).reduce((sum, c) => sum + c.files.length, 0);
previousSummary.unique_class_quarter = new Set(Object.values(parsed.classes).flatMap(c => c.files.map(f => `${c.key}|${f.quarter}`))).size;
previousSummary.catalog_counts = {
  teachers: catalog.teachers.length,
  classes: catalog.classes.length,
  rooms: catalog.rooms.length,
  subjects: catalog.subjects.length,
};
previousSummary.per_quarter = Object.fromEntries([1, 2, 3, 4].map(q => [String(q), {
  ...(previousSummary.per_quarter?.[String(q)] || {}),
  legacy_slots: output[q].length,
}]));
previousSummary.xls_import = {
  source_lessons: report.totals.sourceLessons,
  imported_lessons: report.totals.importedLessons,
  duplicate_lessons_removed: report.totals.duplicateLessons,
  invalid_lessons: report.issues.invalidLessons.length,
  unknown_classes: report.issues.unknownClasses.length,
  unknown_teachers: report.issues.unknownTeachers.length,
  room_fallbacks: report.issues.roomFallbacks.length,
  by_quarter: report.byQuarter,
  by_type: report.byType,
};
fs.writeFileSync(importSummaryPath, JSON.stringify(previousSummary, null, 2) + "\n", "utf8");

for (const q of [1, 2, 3, 4]) {
  fs.writeFileSync(path.join(root, "data", "synthetic", `schedule_legacy_q${q}.json`), JSON.stringify(output[q], null, 2) + "\n", "utf8");
}
fs.writeFileSync(path.join(root, "data", "synthetic", "schedule_import_report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");

console.log(JSON.stringify({
  imported: report.totals.importedLessons,
  source: report.totals.sourceLessons,
  duplicatesRemoved: report.totals.duplicateLessons,
  createdSubjects: report.totals.createdSubjects,
  unknownClasses: issues.unknownClasses.length,
  unknownTeachers: issues.unknownTeachers.length,
  invalidLessons: issues.invalidLessons.length,
  roomFallbacks: issues.roomFallbacks.length,
  byQuarter: report.byQuarter,
  byType: report.byType,
}, null, 2));
