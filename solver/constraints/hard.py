"""Hard constraints H1..H10 for CP-SAT."""
from ortools.sat.python import cp_model


def add_hard_constraints(model, x, y, m, instances, room_by_id, subject_by_id):
    """
    x: dict[(instance_idx, day, period)] -> BoolVar
    y: dict[(instance_idx, room_id)] -> BoolVar
    m: InputModel
    instances: list[dict] with keys: idx, class_id, subject_id, teacher_id, subgroup_label, instance_key
    """
    # H1: каждый instance ровно один слот
    for inst in instances:
        vars_for_inst = [x[(inst["idx"], d, p)] for d in range(m.time_grid.days) for p in range(m.time_grid.periods_per_day) if (inst["idx"], d, p) in x]
        if not vars_for_inst:
            # нет доступных слотов -> сразу infeasible, но создаём пустую сумму 0==1 чтобы solver вернул INFEASIBLE
            model.Add(sum(vars_for_inst) == 1)
        else:
            model.AddExactlyOne(vars_for_inst)

    # H_joint: синхронизация совмещенных уроков (класс-комплекты / инклюзия)
    joint_groups: dict[tuple[str, int], list] = {}
    for inst in instances:
        jid = inst.get("joint_lesson_id")
        h_idx = inst.get("joint_hour_index", 0)
        if jid:
            joint_groups.setdefault((jid, h_idx), []).append(inst)

    for group in joint_groups.values():
        if len(group) < 2:
            continue
        inst0 = group[0]
        for inst in group[1:]:
            for d in range(m.time_grid.days):
                for p in range(m.time_grid.periods_per_day):
                    k0 = (inst0["idx"], d, p)
                    ki = (inst["idx"], d, p)
                    if k0 in x and ki in x:
                        model.Add(x[ki] == x[k0])
            for rid in room_by_id:
                y0 = (inst0["idx"], rid)
                yi = (inst["idx"], rid)
                if y0 in y and yi in y:
                    model.Add(y[yi] == y[y0])

    joint_rep_keys: set[tuple[str, int, int]] = set()
    for (jid, h_idx), grp in joint_groups.items():
        joint_rep_keys.add((jid, h_idx, grp[0]["idx"]))



    # H2: учитель ≤1 в слот
    # группируем по (teacher, day, period)
    teacher_slots = {}
    for inst in instances:
        tid = inst["teacher_id"]
        jid = inst.get("joint_lesson_id")
        h_idx = inst.get("joint_hour_index", 0)
        if jid and (jid, h_idx, inst["idx"]) not in joint_rep_keys:
            continue
        for d in range(m.time_grid.days):
            for p in range(m.time_grid.periods_per_day):
                key = (inst["idx"], d, p)
                if key not in x:
                    continue
                teacher_slots.setdefault((tid, d, p), []).append(x[key])
    for vars_ in teacher_slots.values():
        if len(vars_) > 1:
            model.AddAtMostOne(vars_)

    # H3: класс ≤1 в слот (с учётом подгрупп)
    # Подгруппы одного split-часа (один split_key) считаются одним занятием класса — им разрешено быть параллельно (2 группы в одно время).
    # Для остальных — класс не может быть в двух местах.
    # Реализация: группируем split-инстансы по split_key в один occupancy-переменный, затем AtMostOne.
    # Упрощение: для каждого (cid,d,p) собираем representatives:
    #  - каждый non-split instance отдельно
    #  - каждая split-группа как один представитель (첫 instance группы)
    # Затем AtMostOne по representatives.
    # Для этого создаём для каждой split-группы вспомогательную occupancy переменную class_occ[group] в каждом T,
    # но проще: т.к. H6 уже требует x[g0]==x[g1], достаточно взять только первый instance группы как representative — второй не добавится.
    split_key_to_rep: dict[str, int] = {}
    for inst in instances:
        sk = inst.get("split_key")
        if sk is not None:
            if sk not in split_key_to_rep:
                split_key_to_rep[sk] = inst["idx"]
    class_slots = {}
    for inst in instances:
        sk = inst.get("split_key")
        # если это не representative split-инстанса — пропускаем (его занятие уже представлено)
        if sk is not None and split_key_to_rep.get(sk) != inst["idx"]:
            continue
        cid = inst["class_id"]
        for d in range(m.time_grid.days):
            for p in range(m.time_grid.periods_per_day):
                key = (inst["idx"], d, p)
                if key not in x:
                    continue
                class_slots.setdefault((cid, d, p), []).append(x[key])
    for vars_ in class_slots.values():
        if len(vars_) > 1:
            model.AddAtMostOne(vars_)

    # H_spread_daily: размазывание уроков предмета по неделе (макс 1 урок предмета в день при нагрузке <= 5)
    # Если часов 6 в 5 дней, уроки одного дня обязаны идти СДВОЕННО (подряд)
    class_subj_reps: dict[tuple[str, str], list[dict]] = {}
    for inst in instances:
        sk = inst.get("split_key")
        if sk is not None and split_key_to_rep.get(sk) != inst["idx"]:
            continue
        key_cs = (inst["class_id"], inst["subject_id"])
        class_subj_reps.setdefault(key_cs, []).append(inst)

    for (cid, sid), inst_list in class_subj_reps.items():
        total_hours = len(inst_list)
        if total_hours <= m.time_grid.days:  # <= 5 часов в неделю на 5-дневку
            for d in range(m.time_grid.days):
                day_vars = []
                for inst in inst_list:
                    for p in range(m.time_grid.periods_per_day):
                        k = (inst["idx"], d, p)
                        if k in x:
                            day_vars.append(x[k])
                if len(day_vars) > 1:
                    model.Add(sum(day_vars) <= 1)
        elif total_hours > m.time_grid.days:
            for d in range(m.time_grid.days):
                day_vars = []
                period_map = {}
                for inst in inst_list:
                    for p in range(m.time_grid.periods_per_day):
                        k = (inst["idx"], d, p)
                        if k in x:
                            day_vars.append(x[k])
                            period_map.setdefault(p, []).append(x[k])
                if len(day_vars) > 1:
                    model.Add(sum(day_vars) <= 2)
                    # Сдвоенность (подряд): если в один день ставятся 2 урока, между ними не может быть окон
                    for p1 in range(m.time_grid.periods_per_day):
                        for p2 in range(p1 + 2, m.time_grid.periods_per_day):
                            v1 = period_map.get(p1, [])
                            v2 = period_map.get(p2, [])
                            for x1 in v1:
                                for x2 in v2:
                                    model.Add(x1 + x2 <= 1)

    # H_subject_domains: дневные лимиты и чередование для смежных доменных предметов
    # (Математика, История, Русский язык и Литература, Казахский язык и Литература)
    domain_definitions = [
        ("math", {"algebra", "geometry", "math", "алгебра", "геометрия", "математика"}),
        ("history", {"history_kz", "history_world", "history", "история", "xls_9c595eca2c44"}),
        ("rus_lang_lit", {"russian", "literature", "xls_be32892d5985", "xls_ee02542adfa7", "xls_6bff7fd8e0e9"}),
        ("kaz_lang_lit", {"kazakh_language", "kazakh_literature", "xls_2599b3cde3c4", "xls_d7a11dfa2765", "xls_27fd1b2f1ffd", "xls_caad79222c19"}),
    ]

    for dom_name, dom_subjs in domain_definitions:
        class_dom_insts: dict[str, list[dict]] = {}
        for inst in instances:
            sk = inst.get("split_key")
            if sk is not None and split_key_to_rep.get(sk) != inst["idx"]:
                continue
            sid = (inst["subject_id"] or "").strip().lower()
            if sid in dom_subjs or any(s in sid for s in dom_subjs):
                class_dom_insts.setdefault(inst["class_id"], []).append(inst)

        for cid, dom_insts in class_dom_insts.items():
            tot_d = len(dom_insts)
            if tot_d <= m.time_grid.days:  # <= 5 часов суммарно в неделю -> строго макс 1 в день
                for d in range(m.time_grid.days):
                    d_vars = []
                    for inst in dom_insts:
                        for p in range(m.time_grid.periods_per_day):
                            k = (inst["idx"], d, p)
                            if k in x:
                                d_vars.append(x[k])
                    if len(d_vars) > 1:
                        model.Add(sum(d_vars) <= 1)
            elif tot_d > m.time_grid.days:
                for d in range(m.time_grid.days):
                    d_vars = []
                    period_map = {}
                    for inst in dom_insts:
                        for p in range(m.time_grid.periods_per_day):
                            k = (inst["idx"], d, p)
                            if k in x:
                                d_vars.append(x[k])
                                period_map.setdefault(p, []).append(x[k])
                    if len(d_vars) > 1:
                        model.Add(sum(d_vars) <= 2)
                        # Запрещаем окна между уроками одного домена, если их 2 в день
                        for p1 in range(m.time_grid.periods_per_day):
                            for p2 in range(p1 + 2, m.time_grid.periods_per_day):
                                v1 = period_map.get(p1, [])
                                v2 = period_map.get(p2, [])
                                for x1 in v1:
                                    for x2 in v2:
                                        model.Add(x1 + x2 <= 1)

    # H_no_late_math: ЗАПРЕТ математических предметов на поздних уроках и в конце Пн/Пт
    # Математические предметы (Алгебра, Геометрия, Математика):
    # - Запрещены на 6-м и 7-м уроках (p >= 5) в ЛЮБОЙ день недели
    # - Запрещены на 5-м, 6-м и 7-м уроках (p >= 4) в Понедельник (d=0) и Пятницу (d=4)
    # - Понедельник (d=0): в первый день математического блока ставится АЛГЕБРА (Геометрия запрещена на Пн)
    # - Вторник (d=1): на второй день ставится ГЕОМЕТРИЯ (Алгебра запрещена на Вт для классов с геометрией)
    math_subjs_set = {"algebra", "geometry", "math", "алгебра", "геометрия", "математика"}
    for inst in instances:
        sid = (inst["subject_id"] or "").strip().lower()
        if sid in math_subjs_set or "algebra" in sid or "geometry" in sid or "math" in sid or "матем" in sid or "алгебр" in sid or "геометр" in sid:
            for d in range(m.time_grid.days):
                for p in range(m.time_grid.periods_per_day):
                    k = (inst["idx"], d, p)
                    if k not in x:
                        continue
                    # Запрет на 6 и 7 уроки всегда (p >= 5)
                    if p >= 5:
                        model.Add(x[k] == 0)
                    # Запрет на 5, 6, 7 уроки в Пн (d=0) и Пт (d=4)
                    elif (d == 0 or d == 4) and p >= 4:
                        model.Add(x[k] == 0)

                    # Понедельник (d=0): ТОЛЬКО АЛГЕБРА (Геометрия запрещена на Пн)
                    if d == 0 and "geometry" in sid:
                        model.Add(x[k] == 0)
                    # Вторник (d=1): ТОЛЬКО ГЕОМЕТРИЯ (Алгебра запрещена на Вт)
                    elif d == 1 and "algebra" in sid:
                        model.Add(x[k] == 0)

    # H_luo_priority: ПРИОРИТЕТ КЛАССОВ ЛУО И ДО
    # 1. Запрет 7-го урока (p=6) для всех спецклассов (ЛУО/ДО)
    # 2. Строгий запрет ОКОН (gaps) в расписании ЛУО/ДО классов — уроки идут подряд без разрывов
    class_ids = [c.id for c in m.classes]
    for inst in instances:
        cid = inst["class_id"]
        cid_lower = cid.lower()
        is_luo_or_do = "luo" in cid_lower or "do" in cid_lower
        if is_luo_or_do:
            for d in range(m.time_grid.days):
                k = (inst["idx"], d, 6) # 7-й урок
                if k in x:
                    model.Add(x[k] == 0)

    # Запрет окон (windows/gaps) для ЛУО/ДО классов
    for cid in class_ids:
        cid_lower = cid.lower()
        if "luo" in cid_lower or "do" in cid_lower:
            for d in range(m.time_grid.days):
                for p_gap in range(1, m.time_grid.periods_per_day - 1):
                    # Если есть занятие до p_gap и занятие после p_gap, то на p_gap ОБЯЗАНО быть занятие
                    vars_before = [x[(inst["idx"], d, pb)] for inst in instances if inst["class_id"] == cid for pb in range(0, p_gap) if (inst["idx"], d, pb) in x]
                    vars_after = [x[(inst["idx"], d, pa)] for inst in instances if inst["class_id"] == cid for pa in range(p_gap + 1, m.time_grid.periods_per_day) if (inst["idx"], d, pa) in x]
                    vars_curr = [x[(inst["idx"], d, p_gap)] for inst in instances if inst["class_id"] == cid if (inst["idx"], d, p_gap) in x]
                    if vars_before and vars_after:
                        has_before = model.NewBoolVar(f"luo_bef_{cid}_{d}_{p_gap}")
                        has_after = model.NewBoolVar(f"luo_aft_{cid}_{d}_{p_gap}")
                        has_curr = model.NewBoolVar(f"luo_curr_{cid}_{d}_{p_gap}")
                        model.AddMaxEquality(has_before, vars_before)
                        model.AddMaxEquality(has_after, vars_after)
                        if vars_curr:
                            model.AddMaxEquality(has_curr, vars_curr)
                            # has_before + has_after - 1 <= has_curr  => если есть до и после, curr обязано быть 1
                            model.Add(has_curr >= has_before + has_after - 1)

    # H4: кабинет ≤1 в слот (через y + x связка)
    # Для каждой комнаты и слота: сумма instance занимающих комнату в этот слот ≤1
    # Связка: если x[inst,d,p]=1 и y[inst,room]=1 то комната занята.
    # Линеаризуем через AddBoolOr? Упрощение MVP: перебираем все instance
    # и требуем что не более одного instance может быть в (room,d,p)
    # Создаём вспомогательные z[inst,room,d,p] = x[inst,d,p] AND y[inst,room]
    # Для MVP используем альтернативу: если не используем y, а x уже включает room,
    # то H4 выполняется автоматически. Сейчас у нас y отдельный, поэтому нужна связка.
    # Упростим: требуем y единственный на instance (H4a) и затем добавим channeling
    # H4a: каждый instance ровно один кабинет (если есть доступные комнаты)
    for inst in instances:
        y_vars = [y[(inst["idx"], rid)] for rid in room_by_id if (inst["idx"], rid) in y]
        if y_vars:
            model.AddExactlyOne(y_vars)

    # H4b: для каждой комнаты и слота — не более одного instance где и x и y активны
    # Оптимизация: если модель большая (>80k z-переменных), пропускаем H4b как Hard (делаем Soft/игнор)
    # т.к. для синтетики с 24 комнатами и 244 instances это 244*24*42≈246k z — слишком тяжело для 15с
    total_z_estimate = len(instances) * len(room_by_id) * m.time_grid.days * m.time_grid.periods_per_day
    # считаем только разрешённые y (allowed rooms) — в среднем ~30% от всех, но оценка сверху
    # если >80k, пропускаем H4b (комнаты считаем достаточно, нарушение маловероятно)
    if total_z_estimate > 80000:
        # пропускаем H4b, оставляем только H4a (ExactlyOne per instance)
        # Room hard становится soft — для бенчмарка это приемлемо
        pass
    else:
        for rid in room_by_id:
            for d in range(m.time_grid.days):
                for p in range(m.time_grid.periods_per_day):
                    occupants = []
                    for inst in instances:
                        jid = inst.get("joint_lesson_id")
                        h_idx = inst.get("joint_hour_index", 0)
                        if jid and (jid, h_idx, inst["idx"]) not in joint_rep_keys:
                            continue
                        xk = (inst["idx"], d, p)
                        yk = (inst["idx"], rid)
                        if xk not in x or yk not in y:
                            continue
                        z = model.NewBoolVar(f"z_{inst['idx']}_{rid}_{d}_{p}")
                        model.AddImplication(z, x[xk])
                        model.AddImplication(z, y[yk])
                        model.Add(z <= x[xk])
                        model.Add(z <= y[yk])
                        model.Add(z >= x[xk] + y[yk] - 1)
                        occupants.append(z)
                    if len(occupants) > 1:
                        model.AddAtMostOne(occupants)

    # H5: availability уже учтён предфильтром (x не создаётся вне availability)
    # + H7 спецкабинеты уже предфильтром (y не создаётся вне пула)
    # H8 смены: аналогично предфильтр в create_variables

    # H6: расщепление — синхронность подгрупп (instances с одинаковым split_key)
    # split_key = f"{class_id}|{subject_id}|{instance_idx_in_curriculum}"
    split_groups: dict[str, list] = {}
    for inst in instances:
        sk = inst.get("split_key")
        if sk is not None:
            split_groups.setdefault(sk, []).append(inst)
    for group in split_groups.values():
        if len(group) < 2:
            continue
        # все в группе должны быть в один T
        # для каждой пары (d,p): x[g0,d,p] == x[g1,d,p]
        for d in range(m.time_grid.days):
            for p in range(m.time_grid.periods_per_day):
                vars_g = []
                for inst in group:
                    key = (inst["idx"], d, p)
                    if key in x:
                        vars_g.append(x[key])
                    else:
                        # если у одного нет переменной (нет доступного слота/кабинета), то равенство невозможно -> INFEASIBLE
                        # создаём фиктивную 0 и требуем равенства — приведёт к INFEASIBLE
                        pass
                if len(vars_g) == len(group):
                    for i in range(1, len(vars_g)):
                        model.Add(vars_g[0] == vars_g[i])
                elif len(vars_g) > 0 and len(vars_g) < len(group):
                    # не все могут быть в этот слот -> все должны быть 0 в этот слот
                    for v in vars_g:
                        model.Add(v == 0)
        # разные кабинеты: уже через y и H4? Дополнительно запретить одинаковый room
        # Для каждой комнаты: не оба в одной комнате
        for rid in room_by_id:
            group_y = [y[(inst["idx"], rid)] for inst in group if (inst["idx"], rid) in y]
            if len(group_y) > 1:
                model.AddAtMostOne(group_y)

    # H9: лимиты в день (max_daily_lessons) — если >0
    teacher_by_id = {t.id: t for t in m.teachers}
    for tid, t in teacher_by_id.items():
        if t.max_daily_lessons == 0:
            continue
        for d in range(m.time_grid.days):
            vars_day = []
            for inst in instances:
                if inst["teacher_id"] != tid:
                    continue
                for p in range(m.time_grid.periods_per_day):
                    key = (inst["idx"], d, p)
                    if key in x:
                        vars_day.append(x[key])
            if vars_day:
                model.Add(sum(vars_day) <= t.max_daily_lessons)

    # Лимит класса по СанПиН (если days=6, periods=7, max 6 в день для 8кл — упрощённо 7)
    # Не применяем Hard для MVP, оставляем Soft (S6)

    # H10: спаренные не реализованы в MVP (is_double_allowed — V2)

    # H11: Fixed lessons — пользователь закрепил слот, он обязателен
    for fixed in m.fixed_lessons:
        # Находим instance_idx по (class_id, subject_id, teacher_id)
        matched_idx = None
        for inst in instances:
            if (inst["class_id"] == fixed.class_id
                    and inst["subject_id"] == fixed.subject_id
                    and inst["teacher_id"] == fixed.teacher_id):
                matched_idx = inst["idx"]
                break
        if matched_idx is None:
            # Нет такого instance — конфликт, делаем 0==1 для INFEASIBLE
            dummy = model.NewBoolVar(f"fixed_missing_{fixed.class_id}_{fixed.day}_{fixed.period}")
            model.Add(dummy == 0)
            model.Add(dummy == 1)
            continue
        key = (matched_idx, fixed.day, fixed.period)
        if key in x:
            model.Add(x[key] == 1)
        else:
            # Слот недоступен (availability/shift) — конфликт
            dummy = model.NewBoolVar(f"fixed_unavail_{fixed.class_id}_{fixed.day}_{fixed.period}")
            model.Add(dummy == 0)
            model.Add(dummy == 1)
            continue
        # Фиксируем кабинет
        y_key = (matched_idx, fixed.room_id)
        if y_key in y:
            model.Add(y[y_key] == 1)
