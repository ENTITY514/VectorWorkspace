const XLSX = require('C:/Projects/VectorWorkspace/Desktop/node_modules/xlsx');
const fs = require('fs');
const path = require('path');

const dir = 'C:/Projects/VectorWorkspace/Materials/Q4 Schedule 2026';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xls'));

function norm(s){ return (s==null?'':s.toString()).replace(/\s+/g,' ').trim(); }
const MONTHS = /(янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)/i;

const allLessons=[];
const teacherSet=new Set();
const subjectSet=new Set();
const classList=[];

for(const f of files){
  const wb=XLSX.readFile(path.join(dir,f));
  const ws=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
  let cls=null, quarter=null, dateRange=null;
  for(const r of rows) for(const c of r){
    const s=norm(c);
    let m=s.match(/Класс[:\s]+(.+)/i); if(m) cls=m[1].trim();
    m=s.match(/(\d+)\s*четверть/i); if(m) quarter=m[1];
    if(s.match(/\d+\s*—\s*\d+\s*[а-я]+/i)) dateRange=s;
  }
  let headerIdx=-1, dayCols=[], dayNames=[];
  for(let i=0;i<rows.length;i++){
    const hits=[];
    rows[i].forEach((c,ci)=>{
      const s=norm(c).toLowerCase();
      const dm=s.match(/^(пн|вт|ср|чт|пт|сб|вс)$/);
      if(dm) hits.push({ci,name:dm[1]});
    });
    if(hits.length>=5){ headerIdx=i; dayCols=hits.map(h=>h.ci); dayNames=hits.map(h=>h.name); break; }
  }
  if(headerIdx<0){ console.log(f+' no header'); continue; }
  const periodCol=Math.min(...dayCols)-1;
  let curPeriod=null;
  const lessons=[];
  let week=1;
  for(let i=headerIdx+1;i<rows.length;i++){
    const row=rows[i];
    // detect date row => skip whole row increment week
    const isDateRow=dayCols.some(dc=>MONTHS.test(norm(row[dc])));
    if(isDateRow) { week++; continue; }
    const s0=norm(row[periodCol]);
    const pn=parseInt(s0,10);
    const hasPeriod=Number.isInteger(pn)&&pn>=1&&pn<=12;
    if(hasPeriod) curPeriod=pn;
    const isSubgroupRow=s0==='#';
    const anyContent=dayCols.some(dc=>norm(row[dc]).length>0);
    if(!hasPeriod && !isSubgroupRow && !anyContent) continue;
    const period = (hasPeriod||isSubgroupRow)?curPeriod:null;
    if(period==null) continue;
    for(let k=0;k<dayCols.length;k++){
      const dc=dayCols[k]; const day=dayNames[k];
      const txt=norm(row[dc]);
      if(!txt) continue;
      const raw=row[dc].toString();
      const lines=raw.split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(x=>x.length);
      if(lines.length<2) continue; // ambiguous skip
      const subject=lines[0];
      const teacher=lines[1];
      const time=lines[2]||'';
      const note=lines.slice(3).join('; ');
      if(!teacher || !time) continue;
      // filter out date-like subjects
      if(MONTHS.test(subject)) continue;
      lessons.push({class:cls, file:f, day, period, week, subject, teacher, time, note});
      allLessons.push({class:cls, file:f, day, period, week, subject, teacher, time, note});
      if(teacher) teacherSet.add(teacher);
      if(subject) subjectSet.add(subject);
    }
  }
  classList.push({file:f, class:cls, quarter, dateRange, days:dayNames.join(','), lessons:lessons.length});
  console.log(`\n=== ${f} | Класс: ${cls} | ${dateRange} | Четверть ${quarter} | ${lessons.length} уроков ===`);
  for(const l of lessons){
    console.log(`  ${l.day} ур.${l.period} (н.${l.week}): "${l.subject}" — ${l.teacher} — ${l.time} — [${l.note}]`);
  }
}

console.log('\n\n========== СВОДКА Q4 2026 ==========');
console.log('Всего файлов:', files.length);
console.log('Всего уроков:', allLessons.length);
console.log('\nКлассы:');
for(const c of classList.sort((a,b)=>a.class.localeCompare(b.class))){
  console.log(`  ${c.class} (${c.file}) — ${c.lessons} уроков — ${c.dateRange}`);
}
console.log('\nУчителя ('+teacherSet.size+'):');
for(const t of [...teacherSet].sort((a,b)=>a.localeCompare(b,'ru'))) console.log('  '+t);
console.log('\nПредметы ('+subjectSet.size+'):');
for(const s of [...subjectSet].sort((a,b)=>a.localeCompare(b,'ru'))) console.log('  '+s);
const cntT={}; for(const l of allLessons) cntT[l.teacher]=(cntT[l.teacher]||0)+1;
console.log('\nНагрузка по учителям:');
for(const [t,c] of Object.entries(cntT).sort((a,b)=>b[1]-a[1])) console.log(`  ${t}: ${c}`);
const cntC={}; for(const l of allLessons) cntC[l.class]=(cntC[l.class]||0)+1;
console.log('\nНагрузка по классам:');
for(const [c,n] of Object.entries(cntC).sort((a,b)=>a[0].localeCompare(b[0]))) console.log(`  ${c}: ${n}`);

fs.writeFileSync('C:/Projects/VectorWorkspace/data/q4_2026_verification.json', JSON.stringify({generatedAt:new Date().toISOString(), classList, totals:{files:files.length, lessons:allLessons.length, teachers:teacherSet.size, subjects:subjectSet.size}, teachers:[...teacherSet].sort(), subjects:[...subjectSet].sort(), lessons:allLessons}, null,2),'utf8');
let txt=`Сводка Q4 2026 — Детальная верификация\nДата: ${new Date().toISOString()}\nВсего файлов: ${files.length}\nВсего уроков: ${allLessons.length}\nУчителей: ${teacherSet.size}\nПредметов: ${subjectSet.size}\n\n`;
txt+=classList.map(c=>`${c.class} | ${c.file} | ${c.lessons} уроков | ${c.dateRange}`).join('\n')+'\n';
fs.writeFileSync('C:/Projects/VectorWorkspace/data/q4_2026_summary.txt', txt,'utf8');
console.log('\nSaved data/q4_2026_verification.json and summary.txt');
