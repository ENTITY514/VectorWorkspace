# -*- coding: utf-8 -*-
import json, os, sys
from pathlib import Path

ROOT = Path("E:/Projects/VectorWorkspace")
DATA = Path("E:/Projects/VectorWorkspace/data/bilimclass")

def load(p):
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)

# Load all data
classes = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/classes.json", encoding="utf-8"))
programs = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/programs.json", encoding="utf-8"))
teachers = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/teachers.json", encoding="utf-8"))
curriculum = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/curriculum.json", encoding="utf-8"))
teachers_avail = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/teacher_availability.json", encoding="utf-8"))
rooms = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/rooms.json", encoding="utf-8"))
room_rules = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/room_rules.json", encoding="utf-8"))
subject_weights = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/subject_weights.json", encoding="utf-8"))
scheduling_rules = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/scheduling_rules.json", encoding="utf-8"))
soft_prefs = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/soft_preferences.json", encoding="utf-8"))
do_sched = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/do_scheduling.json", encoding="utf-8"))
do_teachers = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/do_teachers.json", encoding="utf-8"))
spec_ed = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/special_ed_schedule.json", encoding="utf-8"))
luo_incl = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/luo_inclusion.json", encoding="utf-8"))
divisions = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/divisions.json", encoding="utf-8"))
joint_lessons = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/joint_lessons.json", encoding="utf-8"))
subgroup_rules = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/subgroup_rules.json", encoding="utf-8"))
rooms = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/rooms.json", encoding="utf-8"))
teacher_avail = json.load(open("E:/Projects/VectorWorkspace/data/bilimclass/teacher_availability.json", encoding="utf-8"))

# ... rest of analysis would go here

# For now just output a summary
report = []
report.append("# Сравнительный анализ BilimClass vs требования")
report.append("")
report.append("## 1. Проверка часов (programs.json vs curriculum.json)")
report.append("")
report.append("TODO: полная проверка часов")

output = "\n".join(report)
with open("E:/Projects/VectorWorkspace/COMPARISON_REPORT.md", "w", encoding="utf-8") as f:
    f.write("\n".join(report))
print("Report written")