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
  ScheduleVariant,
  ScheduleFixedSlot,
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
  upsertClass(input: { id?: string; grade: number; letter: string; headcount: number; shift: string; class_type?: string }): Promise<unknown> {
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
  setWeights(input: { window: number; room_displacement: number; sanpin_parabola: number; alternation: number; movement: number; load_balance: number; change_slot: number }): Promise<ScheduleWeights> {
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
  exportSchedule(format?: string): Promise<string> {
    return call<string>("schedule_export", { format });
  },
  listVariants(): Promise<ScheduleVariant[]> {
    return call<ScheduleVariant[]>("schedule_list_variants");
  },
  createVariant(input: { name: string; academic_year: string; quarter_number?: number; variant_number?: number; copy_from_variant_id?: string }): Promise<ScheduleVariant> {
    return call<ScheduleVariant>("schedule_create_variant", { input });
  },
  setActiveVariant(variant_id: string): Promise<void> {
    return call<void>("schedule_set_active_variant", { variantId: variant_id });
  },
  deleteVariant(variant_id: string): Promise<void> {
    return call<void>("schedule_delete_variant", { variantId: variant_id });
  },
  portQuarter(from_quarter: number, to_quarter: number): Promise<{ cloned_teachers: number; cloned_classes: number }> {
    return call<{ cloned_teachers: number; cloned_classes: number }>("schedule_port_quarter", { fromQuarter: from_quarter, toQuarter: to_quarter });
  },
  pinSlot(input: { variant_id: string; class_id: string; subject_id: string; teacher_id: string; room_id: string; day: number; period: number; subgroup_label?: string }): Promise<ScheduleFixedSlot> {
    return call<ScheduleFixedSlot>("schedule_pin_slot", { input });
  },
  unpinSlot(slot_id: string): Promise<void> {
    return call<void>("schedule_unpin_slot", { slotId: slot_id });
  },
  getFixedSlots(variant_id: string): Promise<ScheduleFixedSlot[]> {
    return call<ScheduleFixedSlot[]>("schedule_get_fixed_slots", { variantId: variant_id });
  },
};
