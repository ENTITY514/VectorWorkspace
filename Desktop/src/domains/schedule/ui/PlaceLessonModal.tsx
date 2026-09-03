import { useMemo, useState } from "react";
import type { ScheduleState } from "../../../types";

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export interface PlacementRequest {
  class_id: string;
  subject_id: string;
  teacher_id: string;
  room_id: string;
  day: number;
  period: number;
  joint_lesson_id: string | null;
}

/**
 * Ручная постановка урока в конкретную клетку расписания.
 *
 * Нужна для случаев, которые генератор сам решить не может: учитель ездит
 * только по вторникам, завуч ставит себе окно под совещание, предметник
 * приходит во второй половине дня. Урок закрепляется, и последующая
 * генерация обязана его сохранить.
 */
export function PlaceLessonModal({
  state, classId, day, period, onCancel, onPlace,
}: {
  state: ScheduleState;
  classId: string;
  day: number;
  period: number;
  onCancel: () => void;
  onPlace: (req: PlacementRequest) => Promise<void>;
}) {
  // Предметы берутся из учебного плана класса: ставить то, чего нет в
  // нагрузке, — верный способ разойтись с планом.
  const entries = useMemo(
    () => state.curriculum.filter((c) => c.class_id === classId),
    [state.curriculum, classId],
  );

  const [curriculumId, setCurriculumId] = useState(entries[0]?.id ?? "");
  const entry = entries.find((e) => e.id === curriculumId);

  // Учитель предопределён нагрузкой — менять его здесь означало бы тихо
  // разойтись с учебным планом.
  const teacher = state.teachers.find((t) => t.id === entry?.teacher_id);
  const subject = state.subjects.find((s) => s.id === entry?.subject_id);

  const suitableRooms = useMemo(() => {
    if (!subject) return state.rooms;
    const required = subject.required_room_type;
    if (!required) return state.rooms;
    return state.rooms.filter(
      (r) => r.room_type === required || r.room_type === "General",
    );
  }, [state.rooms, subject]);

  const defaultRoom = teacher?.base_room_id ?? suitableRooms[0]?.id ?? "";
  const [roomId, setRoomId] = useState(defaultRoom);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Занятость: тот же слот у учителя или кабинета в другом классе.
  const teacherBusy = state.slots.find(
    (s) => s.teacher_id === entry?.teacher_id && s.day === day && s.period === period && s.class_id !== classId,
  );
  const roomBusy = state.slots.find(
    (s) => s.room_id === roomId && roomId && s.day === day && s.period === period && s.class_id !== classId,
  );

  const cls = state.classes.find((c) => c.id === classId);
  const isRoomless = (cls?.class_type ?? "") === "do";

  const submit = async () => {
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      await onPlace({
        class_id: classId,
        subject_id: entry.subject_id,
        teacher_id: entry.teacher_id,
        room_id: isRoomless ? "" : roomId,
        day,
        period,
        joint_lesson_id: entry.joint_lesson_id ?? null,
      });
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2>Поставить урок</h2>
          <button className="clear-search-btn" onClick={onCancel} disabled={busy}>✕</button>
        </div>

        <p className="muted">
          {cls ? `${cls.grade}${cls.letter ? "-" + cls.letter : ""}` : classId} ·{" "}
          {DAY_NAMES[day]}, урок {period + 1}
        </p>

        {entries.length === 0 ? (
          <div className="card warn-soft">
            У класса нет ни одной записи в учебном плане. Сначала заполните
            нагрузку — иначе урок разойдётся с планом.
          </div>
        ) : (
          <>
            <div className="form-grid">
              <label className="form-label" htmlFor="place-subject">Предмет</label>
              <select
                id="place-subject"
                className="input"
                value={curriculumId}
                onChange={(e) => setCurriculumId(e.target.value)}
              >
                {entries.map((e) => {
                  const s = state.subjects.find((x) => x.id === e.subject_id);
                  const t = state.teachers.find((x) => x.id === e.teacher_id);
                  return (
                    <option key={e.id} value={e.id}>
                      {s?.name ?? e.subject_id} — {t?.full_name ?? e.teacher_id} ({e.hours_per_week} ч)
                    </option>
                  );
                })}
              </select>

              <span className="form-label">Учитель</span>
              <span>{teacher?.full_name ?? "—"} <span className="muted">(из учебного плана)</span></span>

              {!isRoomless && (
                <>
                  <label className="form-label" htmlFor="place-room">Кабинет</label>
                  <select
                    id="place-room"
                    className="input"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                  >
                    {suitableRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {teacher?.base_room_id === r.id ? " · закреплён за учителем" : ""}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>

            {isRoomless && (
              <p className="muted">
                Надомное обучение — кабинет не занимается.
              </p>
            )}
            {entry?.joint_lesson_id && (
              <div className="card warn-soft">
                Это совмещённый урок ({entry.joint_lesson_id}). Остальные классы
                комплекта нужно поставить в тот же слот, иначе группа
                рассыплется.
              </div>
            )}
            {teacherBusy && (
              <div className="card error-soft">
                Учитель уже занят в этом слоте — класс {teacherBusy.class_id}.
              </div>
            )}
            {roomBusy && !isRoomless && (
              <div className="card error-soft">
                Кабинет уже занят в этом слоте — класс {roomBusy.class_id}.
              </div>
            )}
            {error && <div className="error">{error}</div>}

            <div className="row gap-sm" style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={submit} disabled={busy || !entry}>
                {busy ? "Ставлю..." : "Поставить и закрепить"}
              </button>
              <button className="btn" onClick={onCancel} disabled={busy}>Отмена</button>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              Урок будет закреплён: генератор обязан сохранить его на этом месте.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
