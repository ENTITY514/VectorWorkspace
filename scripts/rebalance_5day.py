import json, pathlib, collections, random

root=pathlib.Path(r"C:\Projects\VectorWorkspace")
cat=json.loads((root/"data"/"synthetic"/"catalog.json").read_text(encoding='utf-8'))
curr=json.loads((root/"data"/"synthetic"/"curriculum_q4_5day.json").read_text(encoding='utf-8'))

# Build teacher subject mapping
teacher_subjects={}
for t in cat['teachers']:
    # subject_ids may be empty, but we can infer from curriculum?
    subj_ids = json.loads(t.get('subject_ids','[]')) if isinstance(t.get('subject_ids'),str) else t.get('subject_ids',[])
    teacher_subjects[t['id']] = set(subj_ids)

# For teachers with empty, infer from curriculum they teach
for e in curr:
    tid=e['teacher_id']
    sid=e['subject_id']
    if tid in teacher_subjects:
        teacher_subjects[tid].add(sid)
    else:
        teacher_subjects[tid]={sid}

# Count loads
cnt=collections.Counter()
for e in curr:
    cnt[e['teacher_id']]+=e['hours_per_week']
print("before max", max(cnt.values()))
for tid, v in cnt.most_common(5):
    print(tid, v)

# For overloaded >35, move hours
# Find per subject alternative teachers
subject_teachers={}
for tid, subs in teacher_subjects.items():
    for s in subs:
        subject_teachers.setdefault(s, []).append(tid)

# Sort teachers by load ascending for alternative
for _ in range(10):
    # find most overloaded
    overloaded = [tid for tid, c in cnt.items() if c>35]
    if not overloaded:
        break
    tid = max(overloaded, key=lambda x: cnt[x])
    # find an entry of this teacher to move
    # pick entry with smallest hours maybe 1-2, to move 1 hour
    candidates = [e for e in curr if e['teacher_id']==tid]
    # sort by hours ascending to move small
    candidates.sort(key=lambda x: x['hours_per_week'])
    moved=False
    for cand in candidates:
        sid=cand['subject_id']
        alts = [a for a in subject_teachers.get(sid,[]) if cnt[a]<35 and a!=tid]
        if not alts:
            continue
        # pick least loaded alt
        alt = min(alts, key=lambda x: cnt[x])
        # move 1 hour from cand to alt
        # if cand has 1 hour, reassign whole entry to alt
        if cand['hours_per_week']==1:
            cand['teacher_id']=alt
            cnt[tid]-=1
            cnt[alt]+=1
            moved=True
            print(f"moved 1h {sid} from {tid} to {alt}")
            break
        else:
            # split entry: reduce cand by 1, create new entry for alt with 1 hour if not exists, else increase
            cand['hours_per_week']-=1
            # check if alt already has entry for same class/subject
            existing=None
            for e in curr:
                if e['class_id']==cand['class_id'] and e['subject_id']==sid and e['teacher_id']==alt:
                    existing=e
                    break
            if existing:
                existing['hours_per_week']+=1
            else:
                curr.append({"class_id":cand['class_id'],"subject_id":sid,"teacher_id":alt,"split_teacher2_id":None,"hours_per_week":1})
                # update subject_teachers
                subject_teachers.setdefault(sid, []).append(alt)
            cnt[tid]-=1
            cnt[alt]+=1
            moved=True
            print(f"split 1h {sid} {cand['class_id']} from {tid} to {alt}")
            break
    if not moved:
        print(f"cannot move from {tid}")
        break

print("after max", max(collections.Counter({e['teacher_id']: sum(x['hours_per_week'] for x in curr if x['teacher_id']==e['teacher_id']) for e in curr}).values()))
# recompute class loads
class_cnt=collections.Counter()
for e in curr:
    class_cnt[e['class_id']]+=e['hours_per_week']
print("max class", max(class_cnt.values()))
for cid, v in class_cnt.most_common(5):
    print(cid, v)

# Save
out=root/"data"/"synthetic"/"curriculum_q4_5day_balanced.json"
out.write_text(json.dumps(curr, ensure_ascii=False, indent=2), encoding='utf-8')
print(f"saved {out} entries {len(curr)} total {sum(x['hours_per_week'] for x in curr)}")
