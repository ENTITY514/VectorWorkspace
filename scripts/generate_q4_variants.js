const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const catalogPath = path.join(root, 'data', 'synthetic', 'catalog.json');
const verificationPath = path.join(root, 'data', 'q4_2026_verification.json');

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const verification = JSON.parse(fs.readFileSync(verificationPath, 'utf8'));

// Helpers from import_xls_schedule.js
const compact = v => String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-яәіңғқөұүһ0-9]+/gi,'');
const classKey = (grade, letter, type) => `${grade}|${letter||''}|${type||'normal'}`;
const classByKey = new Map(catalog.classes.map(c => [classKey(c.grade, c.letter, c.type||c.class_type), c]));
const teacherByName = new Map(catalog.teachers.map(t => [compact(t.full_name), t]));
const roomByName = new Map(catalog.rooms.map(r => [compact(r.name), r]));

const subjectByName = new Map();
for(const s of catalog.subjects) subjectByName.set(compact(s.name), s);
const subjectById = new Map(catalog.subjects.map(s=>[s.id,s]));

// aliases high-confidence
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
  [compact("Всемирная история"), "history_world"],
  [compact("История Каз-на"), "history_kz"],
  [compact("Букварь, Обучение гр"), "bukvar"],
  [compact("Английский язык (1гр.анг.яз)"), "english"],
  [compact("Английский язык (2гр.анг.яз)"), "english"],
  [compact("Рус. литература"), "literature"],
  [compact("Английский язык"), "english"],
  [compact("Информатика"), "informatics"],
  [compact("Қазақ тілі"), "kazakh_language"],
  [compact("Қазақ әдебиет"), "kazakh_literature"],
  [compact("Қазақстан тарихы"), "history_kz"],
  [compact("Құқық негіздері"), "law"],
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

let createdSubjects=[];
function subjectFor(sourceName){
  const source=String(sourceName||'').trim();
  const key=compact(source);
  let subject; let method;
  if(subjectAliases.has(key)){
    subject=subjectById.get(subjectAliases.get(key));
    method='alias';
  } else {
    subject=subjectByName.get(key);
    method='exact-normalized';
  }
  if(!subject){
    const id=`xls_${crypto.createHash('sha1').update(key,'utf8').digest('hex').slice(0,12)}`;
    if(subjectById.has(id)){
      subject=subjectById.get(id);
    } else {
      subject={id, name:source, sanitary_weight:5, required_room_type:null, requires_split:false, is_double_allowed:false, related_subjects_json:'[]'};
      subjectByName.set(key, subject);
      subjectById.set(id, subject);
      createdSubjects.push(subject);
      method='created-from-xls';
    }
  }
  return subject;
}
function roomFor(note){
  const source=String(note||'').trim();
  const key=compact(source);
  if(source && roomByName.has(key)) return {id:roomByName.get(key).id, method:'exact'};
  const aliases=[
    [/спортивный зал/i,'r_2_gym'],
    [/нет кабинета/i,'r_20_general'],
    [/начальн|бастауыш/i,'r_1_general'],
    [/русский язык/i,'r_17_languagelab'],
    [/казахский язык/i,'r_12_languagelab'],
    [/английский язык|ағылшын тілі/i,'r_22_languagelab'],
    [/математик/i,'r_16_general'],
    [/физик/i,'r_7_general'],
    [/хими/i,'r_8_chemistrylab'],
    [/биологи/i,'r_23_biologylab'],
    [/географи/i,'r_18_general'],
    [/истори/i,'r_3_general'],
    [/информатик/i,'r_10_informatics'],
    [/технолог|труд/i,'r_19_workshop'],
    [/мультимеди/i,'r_11_general'],
    [/немецкий язык/i,'r_13_languagelab'],
    [/нвп/i,'r_9_general'],
  ];
  for(const [pat,id] of aliases) if(pat.test(source)) return {id, method:'alias'};
  return {id:'r_1_general', method: source? 'fallback-general':'empty-note'};
}

// normalize class like before
function normClass(raw){
  let t=String(raw).replace(/\s+/g,' ').trim().replace(/^Класс[:\s]+/i,'');
  let type='normal';
  const lower=t.toLowerCase();
  if(/лую/i.test(t) || /луо/i.test(t)) type='luo';
  else if(/д\.?\s*о\.?/i.test(t)) type='do';
  let tt=t.replace(/лую|луо|д\.?\s*о\.?/gi,'').trim();
  let m=tt.match(/^(\d+)\s*[-–]?\s*([а-яәА-ЯӘ]?)/);
  let grade=m?parseInt(m[1]):null;
  let letter=m?m[2].trim():'';
  return {grade, letter, type};
}

const dayIndex={пн:0,вт:1,ср:2,чт:3,пт:4, сб:5, вс:6};

const slotsV1=[];
const issues={unknownClasses:[], unknownTeachers:[], roomFallbacks:[]};
const seen=new Map();
let dup=0;

for(const lesson of verification.lessons){
  const nc=normClass(lesson.class);
  const cls=classByKey.get(classKey(nc.grade, nc.letter, nc.type));
  if(!cls){ issues.unknownClasses.push(lesson); continue; }
  const teacher=teacherByName.get(compact(lesson.teacher));
  if(!teacher){ issues.unknownTeachers.push(lesson); continue; }
  const subject=subjectFor(lesson.subject);
  const room=roomFor(lesson.note);
  if(room.method!=='exact' && room.method!=='alias') issues.roomFallbacks.push({cls:cls.id, note:lesson.note, room:room.id});
  const day = dayIndex[lesson.day];
  const period = lesson.period -1;
  if(day==null || period<0 || period>7) continue;
  const slotKey=[4, cls.id, lesson.week||1, day, period, subject.id, teacher.id, room.id].join('|');
  if(seen.has(slotKey)){ dup++; continue; }
  seen.set(slotKey, lesson.file);
  slotsV1.push({
    class_id: cls.id,
    subject_id: subject.id,
    teacher_id: teacher.id,
    room_id: room.id,
    day, period,
    subgroup_label: '',
    quarter:4, week:lesson.week||1,
    source_file: lesson.file,
    class_type: cls.type||'normal',
    source_subject: lesson.subject,
    source_teacher: lesson.teacher,
    source_time: lesson.time,
    source_note: lesson.note||'',
  });
}
// Assign subgroup labels for parallel lessons (same class/day/period)
{
  const groups=new Map();
  for(const s of slotsV1){
    const k=`${s.class_id}|${s.day}|${s.period}`;
    if(!groups.has(k)) groups.set(k,[]);
    groups.get(k).push(s);
  }
  let splitGroups=0;
  for(const [k, arr] of groups){
    if(arr.length>1){
      splitGroups++;
      // sort for determinism
      arr.sort((a,b)=>a.teacher_id.localeCompare(b.teacher_id)||a.subject_id.localeCompare(b.subject_id));
      arr.forEach((slot,i)=>{ slot.subgroup_label = i===0?'A':'B'; if(i>1) slot.subgroup_label=`${i+1}`; });
    }
  }
  console.log(`Split groups (parallel lessons) detected: ${splitGroups} slots=${[...groups.values()].filter(a=>a.length>1).reduce((s,a)=>s+a.length,0)}`);
}

// Add created subjects to catalog if any (ensure uniqueness by id)
const existingIds=new Set(catalog.subjects.map(s=>s.id));
for(const s of createdSubjects){
  if(!existingIds.has(s.id)){
    catalog.subjects.push(s);
    existingIds.add(s.id);
  }
}
// Deduplicate catalog subjects by id (fix previous duplicates)
const deduped=new Map();
for(const s of catalog.subjects){
  if(!deduped.has(s.id)) deduped.set(s.id,s);
}
catalog.subjects=[...deduped.values()];
fs.writeFileSync(catalogPath, JSON.stringify(catalog,null,2)+'\n','utf8');

console.log(`Variant1 slots: ${slotsV1.length} (dup removed ${dup})`);
console.log(`unknownClasses: ${issues.unknownClasses.length}, unknownTeachers: ${issues.unknownTeachers.length}, roomFallbacks: ${issues.roomFallbacks.length}`);
console.log(`createdSubjects new: ${createdSubjects.length}, total subjects now ${catalog.subjects.length}`);

// Curriculum derived: group by class_id, subject_id, teacher_id => count hours
const curriculumMap=new Map();
for(const s of slotsV1){
  const key=`${s.class_id}|${s.subject_id}|${s.teacher_id}`;
  const entry=curriculumMap.get(key);
  if(entry) entry.hours_per_week+=1;
  else curriculumMap.set(key,{class_id:s.class_id, subject_id:s.subject_id, teacher_id:s.teacher_id, split_teacher2_id:null, hours_per_week:1});
}
let curriculum=[...curriculumMap.values()];
console.log(`Curriculum entries (raw 667 lessons): ${curriculum.length}, total ${curriculum.reduce((s,c)=>s+c.hours_per_week,0)}`);
// Для 5-дневки используем корректный 5-day curriculum (651 периодов) если есть
const cur5Path=path.join(root,'data','synthetic','curriculum_q4_5day.json');
if(fs.existsSync(cur5Path)){
  curriculum=JSON.parse(fs.readFileSync(cur5Path,'utf8'));
  console.log(`→ Используем 5-day curriculum: ${curriculum.length} записей, ${curriculum.reduce((s,c)=>s+c.hours_per_week,0)} часов`);
} else {
  fs.writeFileSync(path.join(root,'data','synthetic','curriculum_q4_2026_variant.json'), JSON.stringify(curriculum,null,2)+'\n','utf8');
}

// Generate Variant heuristic
function generateVariant(slotsV1, curriculum, seedInit=42){
  const teacherBusy = new Map();
  const classBusy = new Map();
  const roomBusy = new Map();
  const result=[];
  const teacherLoad=new Map();
  for(const e of curriculum) teacherLoad.set(e.teacher_id, (teacherLoad.get(e.teacher_id)||0)+e.hours_per_week);
  const sortedCurriculum=[...curriculum].sort((a,b)=>{
    const la=teacherLoad.get(a.teacher_id)||0, lb=teacherLoad.get(b.teacher_id)||0;
    if(lb!==la) return lb-la;
    if(a.class_id!==b.class_id) return a.class_id.localeCompare(b.class_id);
    if(a.subject_id!==b.subject_id) return a.subject_id.localeCompare(b.subject_id);
    return a.teacher_id.localeCompare(b.teacher_id);
  });
  const roomsByType=new Map();
  for(const r of catalog.rooms){
    const t=r.room_type;
    if(!roomsByType.has(t)) roomsByType.set(t,[]);
    roomsByType.get(t).push(r.id);
  }
  const subjReq=new Map(catalog.subjects.map(s=>[s.id, s.required_room_type]));
  let seed=seedInit;
  function rand(){ seed = (seed*1664525+1013904223)%4294967296; return seed/4294967296; }
  function shuffle(arr){
    const a=[...arr];
    for(let i=a.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a;
  }

  const allDays=[0,1,2,3,4]; // 5 дней — Казахстан, 7 уроков макс
  const allPeriods=[0,1,2,3,4,5,6]; // 7 периодов

  // For each curriculum entry, allocate hours with retries
  for(const entry of sortedCurriculum){
    for(let h=0; h<entry.hours_per_week; h++){
      let placed=false;
      // try shuffle then exhaustive scan
      for(let attempt=0; attempt<15 && !placed; attempt++){
        const days=shuffle(allDays);
        for(const d of days){
          const periods=shuffle(allPeriods);
          for(const p of periods){
            const tKey=`${d}|${p}`;
            const cs=classBusy.get(entry.class_id);
            if(cs && cs.has(tKey)) continue;
            const ts=teacherBusy.get(entry.teacher_id);
            if(ts && ts.has(tKey)) continue;
            const reqType=subjReq.get(entry.subject_id);
            let candidates=[];
            if(reqType && roomsByType.has(reqType)) candidates=roomsByType.get(reqType);
            else candidates=catalog.rooms.map(r=>r.id);
            candidates=shuffle(candidates);
            let chosen=null;
            const FALLBACK_ROOMS=new Set(['r_1_general','r_20_general']);
            for(const rid of candidates){
              if(FALLBACK_ROOMS.has(rid)) { chosen=rid; break; }
              const rs=roomBusy.get(rid);
              if(rs && rs.has(tKey)) continue;
              chosen=rid; break;
            }
            if(!chosen) continue;
            if(!classBusy.has(entry.class_id)) classBusy.set(entry.class_id, new Set());
            if(!teacherBusy.has(entry.teacher_id)) teacherBusy.set(entry.teacher_id, new Set());
            if(!FALLBACK_ROOMS.has(chosen)){
              if(!roomBusy.has(chosen)) roomBusy.set(chosen, new Set());
              roomBusy.get(chosen).add(tKey);
            }
            classBusy.get(entry.class_id).add(tKey);
            teacherBusy.get(entry.teacher_id).add(tKey);
            const orig=slotsV1.find(s=>s.class_id===entry.class_id && s.subject_id===entry.subject_id && s.teacher_id===entry.teacher_id);
            result.push({
              class_id: entry.class_id,
              subject_id: entry.subject_id,
              teacher_id: entry.teacher_id,
              room_id: chosen,
              day: d, period: p,
              subgroup_label: '',
              quarter:4, week:1,
              source_subject: orig?orig.source_subject:subjectById.get(entry.subject_id)?.name||entry.subject_id,
              source_teacher: orig?orig.source_teacher: teacherByName.get(entry.teacher_id)?.full_name||entry.teacher_id,
              source_time: `${8+p}:00`,
              source_note: orig?orig.source_note:'',
            });
            placed=true;
            break;
          }
          if(placed) break;
        }
      }
      // Exhaustive fallback if shuffle failed
      if(!placed){
        for(let d=0; d<5 && !placed; d++){
          for(let p=0; p<7 && !placed; p++){
            const tKey=`${d}|${p}`;
            if(classBusy.get(entry.class_id)?.has(tKey)) continue;
            if(teacherBusy.get(entry.teacher_id)?.has(tKey)) continue;
            const reqType=subjReq.get(entry.subject_id);
            let candidates=[];
            if(reqType && roomsByType.has(reqType)) candidates=roomsByType.get(reqType);
            else candidates=catalog.rooms.map(r=>r.id);
            let chosen=null;
            const FALLBACK_ROOMS2=new Set(['r_1_general','r_20_general']);
            for(const rid of candidates){
              if(FALLBACK_ROOMS2.has(rid)) { chosen=rid; break; }
              if(roomBusy.get(rid)?.has(tKey)) continue;
              chosen=rid; break;
            }
            if(!chosen) continue;
            if(!classBusy.has(entry.class_id)) classBusy.set(entry.class_id, new Set());
            if(!teacherBusy.has(entry.teacher_id)) teacherBusy.set(entry.teacher_id, new Set());
            if(!FALLBACK_ROOMS2.has(chosen)){
              if(!roomBusy.has(chosen)) roomBusy.set(chosen, new Set());
              roomBusy.get(chosen).add(tKey);
            }
            classBusy.get(entry.class_id).add(tKey);
            teacherBusy.get(entry.teacher_id).add(tKey);
            const orig=slotsV1.find(s=>s.class_id===entry.class_id && s.subject_id===entry.subject_id && s.teacher_id===entry.teacher_id);
            result.push({
              class_id: entry.class_id,
              subject_id: entry.subject_id,
              teacher_id: entry.teacher_id,
              room_id: chosen,
              day: d, period: p,
              subgroup_label: '',
              quarter:4, week:1,
              source_subject: orig?orig.source_subject:subjectById.get(entry.subject_id)?.name||entry.subject_id,
              source_teacher: orig?orig.source_teacher: teacherByName.get(entry.teacher_id)?.full_name||entry.teacher_id,
              source_time: `${8+p}:00`,
              source_note: orig?orig.source_note:'',
            });
            placed=true;
          }
        }
      }
      if(!placed){
        console.warn(`Failed to place ${entry.class_id} ${entry.subject_id} ${entry.teacher_id} hour ${h+1}`);
      }
    }
  }
  return result;
}

const slotsV2=generateVariant(slotsV1, curriculum, 42);
console.log(`Variant2 generated slots: ${slotsV2.length}`);
const slotsV3=generateVariant(slotsV1, curriculum, 123);
console.log(`Variant3 generated slots: ${slotsV3.length}`);

// Write variant files
const outDir=path.join(root,'data','synthetic');
fs.writeFileSync(path.join(outDir,'schedule_q4_2026_variant1.json'), JSON.stringify(slotsV1,null,2)+'\n','utf8');
fs.writeFileSync(path.join(outDir,'schedule_q4_2026_variant2.json'), JSON.stringify(slotsV2,null,2)+'\n','utf8');
fs.writeFileSync(path.join(outDir,'schedule_q4_2026_variant3.json'), JSON.stringify(slotsV3,null,2)+'\n','utf8');

// Also produce human-readable verification for variants
const variantReport={
  generatedAt:new Date().toISOString(),
  variant1:{slots:slotsV1.length, classes:new Set(slotsV1.map(s=>s.class_id)).size, teachers:new Set(slotsV1.map(s=>s.teacher_id)).size, subjects:new Set(slotsV1.map(s=>s.subject_id)).size},
  variant2:{slots:slotsV2.length, classes:new Set(slotsV2.map(s=>s.class_id)).size, teachers:new Set(slotsV2.map(s=>s.teacher_id)).size, subjects:new Set(slotsV2.map(s=>s.subject_id)).size},
  variant3:{slots:slotsV3.length, classes:new Set(slotsV3.map(s=>s.class_id)).size, teachers:new Set(slotsV3.map(s=>s.teacher_id)).size, subjects:new Set(slotsV3.map(s=>s.subject_id)).size},
  curriculumEntries: curriculum.length,
  createdSubjects: createdSubjects.length,
  issues
};
fs.writeFileSync(path.join(root,'data','q4_2026_variants_report.json'), JSON.stringify(variantReport,null,2)+'\n','utf8');
console.log('Report',variantReport);

// Human-readable lessons per class for variant1
let humanReport=`# Q4 2026 — Вариант 1 (Импорт) и Вариант 2 (Автогенерация)\nДата: ${new Date().toISOString()}\n\n`;
humanReport+=`## Вариант 1: ${slotsV1.length} уроков, ${variantReport.variant1.classes} классов, ${variantReport.variant1.teachers} учителей, ${variantReport.variant1.subjects} предметов\n`;
humanReport+=`## Вариант 2: ${slotsV2.length} уроков (автогенерация, heuristic shuffle), ${variantReport.variant2.classes} классов\n\n`;
humanReport+=`## Список уроков Вариант 1 (человеко-читаемые):\n`;
const byClass=new Map();
for(const s of slotsV1){
  if(!byClass.has(s.class_id)) byClass.set(s.class_id,[]);
  byClass.get(s.class_id).push(s);
}
for(const [cid, arr] of [...byClass.entries()].sort()){
  const cls=catalog.classes.find(c=>c.id===cid);
  const label=cls?`${cls.display} (${cls.grade}${cls.letter} ${cls.type})` : cid;
  humanReport+=`\n### ${label} — ${arr.length} уроков\n`;
  for(const sl of arr.sort((a,b)=>a.day-b.day||a.period-b.period)){
    const subj=catalog.subjects.find(x=>x.id===sl.subject_id);
    const subjName=subj?subj.name:sl.subject_id;
    const teacher=catalog.teachers.find(t=>t.id===sl.teacher_id);
    const teacherName=teacher?teacher.full_name:sl.teacher_id;
    const room=catalog.rooms.find(r=>r.id===sl.room_id);
    const roomName=room?room.name:sl.room_id;
    const days=['Пн','Вт','Ср','Чт','Пт','Сб'][sl.day]||sl.day;
    humanReport+=` - ${days} ур.${sl.period+1}: "${sl.source_subject||subjName}" — ${teacherName} — каб. ${roomName} — [${sl.source_note}]\n`;
  }
}
humanReport+=`\n## Вариант 2 (фрагмент первые 100 уроков):\n`;
for(const sl of slotsV2.slice(0,100)){
  const subj=catalog.subjects.find(x=>x.id===sl.subject_id);
  const subjName=subj?subj.name:sl.subject_id;
  const teacher=catalog.teachers.find(t=>t.id===sl.teacher_id);
  const teacherName=teacher?teacher.full_name:sl.teacher_id;
  const days=['Пн','Вт','Ср','Чт','Пт','Сб'][sl.day]||sl.day;
  humanReport+=` - ${sl.class_id} ${days} ур.${sl.period+1}: "${subjName}" — ${teacherName}\n`;
}
fs.writeFileSync(path.join(root,'data','q4_2026_variants_human.md'), humanReport,'utf8');
console.log('Written human report to data/q4_2026_variants_human.md');
console.log('Done');
