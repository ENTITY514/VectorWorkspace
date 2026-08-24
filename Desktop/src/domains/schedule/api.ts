import { invoke } from "@tauri-apps/api/core";
import type {
  ScheduleState,
  ScheduleTeacher,
  ScheduleRoom,
  ScheduleSubject,
  ScheduleCurriculum,
  ScheduleWeights,
  ScheduleSlot,
  ScheduleGenerateResult,
} from "../../types";

const isTauri = "__TAURI_INTERNALS__" in window;
async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!isTauri) throw new Error("Ядро недоступно вне Tauri");
  return invoke<T>(name, args);
}

export const scheduleApi = {
  getState(): Promise<ScheduleState> {
    return call<ScheduleState>("schedule_get_state");
  },
  upsertTeacher(input: { id?: string; full_name: string; base_room_id?: string | null; max_daily_lessons: number; availability_json: string }): Promise<ScheduleTeacher> {
    return call<ScheduleTeacher>("schedule_upsert_teacher", { input });
  },
  deleteTeacher(id: string): Promise<void> {
    return call<void>("schedule_delete_teacher", { id });
  },
  upsertRoom(input: { id?: string; name: string; room_type: string; capacity: number; base_teacher_id?: string | null; floor?: number | null }): Promise<ScheduleRoom> {
    return call<ScheduleRoom>("schedule_upsert_room", { input });
  },
  deleteRoom(id: string): Promise<void> {
    return call<void>("schedule_delete_room", { id });
  },
  upsertClass(input: { id?: string; grade: number; letter: string; headcount: number; shift: string }): Promise<unknown> {
    return call("schedule_upsert_class", { input });
  },
  deleteClass(id: string): Promise<void> {
    return call<void>("schedule_delete_class", { id });
  },
  upsertSubject(input: { id: string; name: string; sanitary_weight: number; required_room_type?: string | null; requires_split: boolean; is_double_allowed: boolean; related_subjects_json: string }): Promise<ScheduleSubject> {
    return call<ScheduleSubject>("schedule_upsert_subject", { input });
  },
  deleteSubject(id: string): Promise<void> {
    return call<void>("schedule_delete_subject", { id });
  },
  upsertSubgroupRule(input: { class_id: string; subject_id: string; group_count: number }): Promise<string> {
    return call<string>("schedule_upsert_subgroup_rule", { input });
  },
  setCurriculum(entries: Array<{ class_id: string; subject_id: string; teacher_id: string; split_teacher2_id?: string | null; hours_per_week: number }>): Promise<ScheduleCurriculum[]> {
    return call<ScheduleCurriculum[]>("schedule_set_curriculum", { entries });
  },
  deleteCurriculum(id: string): Promise<void> {
    return call<void>("schedule_delete_curriculum", { id });
  },
  setWeights(input: { window: number; room_displacement: number; sanpin_parabola: number; alternation: number; movement: number; load_balance: number }): Promise<ScheduleWeights> {
    return call<ScheduleWeights>("schedule_set_weights", { input });
  },
  getSlots(): Promise<ScheduleSlot[]> {
    return call<ScheduleSlot[]>("schedule_get_slots");
  },
  clearSlots(): Promise<void> {
    return call<void>("schedule_clear_slots");
  },
  generate(input?: { time_limit_sec?: number; num_workers?: number; seed?: number }): Promise<ScheduleGenerateResult> {
    return call<ScheduleGenerateResult>("schedule_generate", { input });
  },
  importLegacy(quarter?: number): Promise<unknown> {
    return call("schedule_import_legacy", { quarter });
  },
  getLegacy(quarter: number): Promise<ScheduleSlot[]> {
    return call<ScheduleSlot[]>("schedule_get_legacy", { quarter });
  },
  exportSchedule(format?: string): Promise<string> {
    return call<string>("schedule_export", { format });
  },
};
