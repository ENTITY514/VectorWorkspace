const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/synthetic/catalog.json'),'utf8'));
const v1=JSON.parse(fs.readFileSync(path.join(root,'data/synthetic/schedule_q4_2026_variant1.json'),'utf8'));
const v2=JSON.parse(fs.readFileSync(path.join(root,'data/synthetic/schedule_q4_2026_variant2.json'),'utf8'));
const v3=JSON.parse(fs.readFileSync(path.join(root,'data/synthetic/schedule_q4_2026_variant3.json'),'utf8'));
const solverOut=JSON.parse(fs.readFileSync(path.join(root,'data/q4_2026_variant3_output.json'),'utf8'));

const weights={window:400, room_displacement:50, sanpin_parabola:100, alternation:80, movement:20, load_balance:80, change_slot:0};
// weights for comparison should match solver's tuned weights for fair

const subjectById=new Map(catalog.subjects.map(s=>[s.id,s]));
const roomById=new Map(catalog.rooms.map(r=>[r.id,r]));
const teacherById=new Map(catalog.teachers.map(t=>[t.id,t]));

function computeMetrics(slots){
  const FALLBACK=new Set(['r_1_general','r_20_general']);
  let hard_teacher=0, hard_room=0, hard_room_f=0, hard_class=0;
  const tSlot=new Map(), rSlot=new Map(), rFilt=new Map(), cSlot=new Map();
  for(const s of slots){
    const tk=`${s.teacher_id}|${s.day}|${s.period}`; tSlot.set(tk,(tSlot.get(tk)||0)+1);
    const ck=`${s.class_id}|${s.day}|${s.period}|${s.subgroup_label||''}`; cSlot.set(ck,(cSlot.get(ck)||0)+1);
    const rk=`${s.room_id}|${s.day}|${s.period}`; rSlot.set(rk,(rSlot.get(rk)||0)+1);
    if(!FALLBACK.has(s.room_id)) rFilt.set(rk,(rFilt.get(rk)||0)+1);
  }
  for(const v of tSlot.values()) if(v>1) hard_teacher+=v-1;
  for(const v of rSlot.values()) if(v>1) hard_room+=v-1;
  for(const v of rFilt.values()) if(v>1) hard_room_f+=v-1;
  for(const v of cSlot.values()) if(v>1) hard_class+=v-1;

  let win=0;
  const teachers=[...new Set(slots.map(s=>s.teacher_id))];
  for(const tid of teachers) for(let d=0;d<5;d++){
    const busy=[...Array(8)].map((_,p)=>slots.some(s=>s.teacher_id===tid&&s.day===d&&s.period===p));
    const idxs=busy.map((b,i)=>b?i:-1).filter(i=>i>=0);
    if(idxs.length<2) continue;
    const f=Math.min(...idxs), l=Math.max(...idxs);
    for(let p=f+1;p<l;p++) if(!busy[p]) win++;
  }
  let sanpin=0; const ideal=[7,11,11,9,7,5];
  for(const c of catalog.classes){
    for(let d=0;d<5;d++){
      let daily=0; for(const s of slots.filter(x=>x.class_id===c.id&&x.day===d)) daily+= (subjectById.get(s.subject_id)?.sanitary_weight||5);
      if(daily===0) continue;
      const dev=Math.max(0, Math.abs(daily-(ideal[d]||6))-2);
      sanpin+=dev;
    }
  }
  let bal=0;
  for(const c of catalog.classes){
    const cnts=[0,1,2,3,4].map(d=>slots.filter(s=>s.class_id===c.id&&s.day===d).length);
    bal+= Math.max(...cnts)-Math.min(...cnts);
  }
  let classWin=0;
  for(const c of catalog.classes) for(let d=0;d<5;d++){
    const busy=[...Array(8)].map((_,p)=>slots.some(s=>s.class_id===c.id&&s.day===d&&s.period===p));
    const idxs=busy.map((b,i)=>b?i:-1).filter(i=>i>=0);
    if(idxs.length<2) continue;
    const f=Math.min(...idxs), l=Math.max(...idxs);
    for(let p=f+1;p<l;p++) if(!busy[p]) classWin++;
  }
  const total = weights.window*win + weights.sanpin_parabola*sanpin + weights.load_balance*bal;
  return {hard:{teacher:hard_teacher, room:hard_room, roomF:hard_room_f, class:hard_class}, soft:{win, sanpin, bal, classWin, total}};
}

const m1=computeMetrics(v1), m2=computeMetrics(v2), m3=computeMetrics(v3);
console.log('=== Q4 2026: V1 ручное vs V2 heuristic vs V3 CP-SAT (180с, 6дн×7) ===');
console.log(`Слотов: V1 ${v1.length} V2 ${v2.length} V3 ${v3.length}`);
console.log(`Hard teacher: ${m1.hard.teacher} ${m2.hard.teacher} ${m3.hard.teacher}`);
console.log(`Hard roomF: ${m1.hard.roomF} ${m2.hard.roomF} ${m3.hard.roomF}`);
console.log(`Soft win: ${m1.soft.win} ${m2.soft.win} ${m3.soft.win}`);
console.log(`Sanpin: ${m1.soft.sanpin} ${m2.soft.sanpin} ${m3.soft.sanpin}`);
console.log(`Balance: ${m1.soft.bal} ${m2.soft.bal} ${m3.soft.bal}`);
console.log(`ClassWin: ${m1.soft.classWin} ${m2.soft.classWin} ${m3.soft.classWin}`);
console.log(`Weighted total (w400/100/80): ${m1.soft.total} ${m2.soft.total} ${m3.soft.total}`);
console.log(`Solver own penalties V3:`, solverOut.penalties, `status ${solverOut.status} wall ${solverOut.solver_stats.wall_ms}ms branches ${solverOut.solver_stats.branches}`);

fs.writeFileSync(path.join(root,'data/q4_2026_comparison_3.json'), JSON.stringify({v1:{hard:m1.hard, soft:m1.soft}, v2:{hard:m2.hard, soft:m2.soft}, v3:{hard:m3.hard, soft:m3.soft, solver:solverOut.penalties}}, null,2),'utf8');
console.log('saved data/q4_2026_comparison_3.json');
