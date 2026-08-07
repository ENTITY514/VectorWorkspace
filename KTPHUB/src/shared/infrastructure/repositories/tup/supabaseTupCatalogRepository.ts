import { cacheDelete, cacheGet, cacheSet } from "../../cache/localCache";
import { cacheKeys } from "../../cache/keys";
import { getSupabaseClient } from "../../supabase/client";
import {
  TupCatalogRepository,
  TupDetail,
  TupListFilters,
  TupMeta,
  TupStatus,
  UpsertTupInput,
} from "../types";
import { flattenPlanToBlocks, mapTupMeta, TupDocumentRow } from "./mappers";

const META_SELECT =
  "id, title, subject, grade, language, program_kind, academic_year, status, content_version, plan_json, source_file_path, updated_at";

export function createSupabaseTupCatalogRepository(): TupCatalogRepository {
  const supabase = getSupabaseClient();

  async function listMeta(filters: TupListFilters = {}): Promise<TupMeta[]> {
    const cacheKey = cacheKeys.tupMetaList;
    const preferCache = !filters.includeDrafts;

    if (preferCache) {
      const cached = await cacheGet<TupMeta[]>(cacheKey);
      if (cached?.value?.length) {
        return applyFilters(cached.value, filters);
      }
    }

    let query = supabase.from("tup_documents").select(META_SELECT).order("updated_at", {
      ascending: false,
    });

    if (!filters.includeDrafts) {
      query = query.eq("status", "published");
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as TupDocumentRow[];
    const metas = rows.map(mapTupMeta);

    if (!filters.includeDrafts) {
      await cacheSet(cacheKey, metas);
    }

    return applyFilters(metas, filters);
  }

  async function getDetail(id: string): Promise<TupDetail> {
    const metaCached = await cacheGet<TupMeta[]>(cacheKeys.tupMetaList);
    const meta = metaCached?.value?.find((item) => item.id === id);
    if (meta) {
      const cachedDetail = await cacheGet<TupDetail>(
        cacheKeys.tupDetail(id, meta.contentVersion)
      );
      if (cachedDetail?.value) return cachedDetail.value;
    }

    const { data, error } = await supabase
      .from("tup_documents")
      .select(META_SELECT)
      .eq("id", id)
      .single();

    if (error) throw error;
    const row = data as TupDocumentRow;
    const detail: TupDetail = {
      ...mapTupMeta(row),
      planData: row.plan_json ?? [],
      sourceFilePath: row.source_file_path,
    };

    await cacheSet(cacheKeys.tupDetail(id, detail.contentVersion), detail);
    return detail;
  }

  async function adminUpsert(input: UpsertTupInput): Promise<TupDetail> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Необходима авторизация");

    let sourceFilePath: string | null = null;
    if (input.file) {
      const ext = input.file.name.split(".").pop() || "bin";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("tup-sources")
        .upload(path, input.file, { upsert: false });
      if (uploadError) throw uploadError;
      sourceFilePath = path;
    }

    const payload = {
      title: input.title,
      subject: input.subject,
      grade: input.grade,
      language: input.language,
      program_kind: input.programKind,
      academic_year: input.academicYear,
      status: input.status,
      plan_json: input.planData,
      uploaded_by: user.id,
      ...(sourceFilePath ? { source_file_path: sourceFilePath } : {}),
      ...(input.id
        ? { content_version: undefined } // bumped below
        : {}),
    };

    let tupId = input.id;

    if (tupId) {
      const { data: existing, error: existingError } = await supabase
        .from("tup_documents")
        .select("content_version")
        .eq("id", tupId)
        .single();
      if (existingError) throw existingError;

      const { data, error } = await supabase
        .from("tup_documents")
        .update({
          ...payload,
          content_version: (existing.content_version ?? 1) + 1,
        })
        .eq("id", tupId)
        .select(META_SELECT)
        .single();
      if (error) throw error;

      await replaceBlocks(tupId, input.planData);
      await invalidateLocalCache();
      const row = data as TupDocumentRow;
      return {
        ...mapTupMeta(row),
        planData: row.plan_json ?? [],
        sourceFilePath: row.source_file_path,
      };
    }

    const { data, error } = await supabase
      .from("tup_documents")
      .insert(payload)
      .select(META_SELECT)
      .single();
    if (error) throw error;

    tupId = (data as TupDocumentRow).id;
    await replaceBlocks(tupId, input.planData);
    await invalidateLocalCache();

    const row = data as TupDocumentRow;
    return {
      ...mapTupMeta(row),
      planData: row.plan_json ?? [],
      sourceFilePath: row.source_file_path,
    };
  }

  async function replaceBlocks(tupId: string, plan: UpsertTupInput["planData"]) {
    await supabase.from("tup_quarters").delete().eq("tup_id", tupId);

    const quarters = flattenPlanToBlocks(plan);
    for (const quarter of quarters) {
      const { data: qRow, error: qError } = await supabase
        .from("tup_quarters")
        .insert({
          tup_id: tupId,
          sort_order: quarter.sort_order,
          name: quarter.name,
          repetition_info: quarter.repetition_info,
        })
        .select("id")
        .single();
      if (qError) throw qError;

      for (const section of quarter.sections) {
        const { data: sRow, error: sError } = await supabase
          .from("tup_sections")
          .insert({
            quarter_id: qRow.id,
            sort_order: section.sort_order,
            name: section.name,
          })
          .select("id")
          .single();
        if (sError) throw sError;

        for (const topic of section.topics) {
          const { data: tRow, error: tError } = await supabase
            .from("tup_topics")
            .insert({
              section_id: sRow.id,
              sort_order: topic.sort_order,
              name: topic.name,
            })
            .select("id")
            .single();
          if (tError) throw tError;

          if (topic.objectives.length) {
            const { error: oError } = await supabase.from("tup_objectives").insert(
              topic.objectives.map((obj) => ({
                topic_id: tRow.id,
                sort_order: obj.sort_order,
                objective_code: obj.objective_code,
                description: obj.description,
              }))
            );
            if (oError) throw oError;
          }
        }
      }
    }
  }

  async function adminSetStatus(id: string, status: TupStatus): Promise<void> {
    const { error } = await supabase.from("tup_documents").update({ status }).eq("id", id);
    if (error) throw error;
    await invalidateLocalCache();
  }

  async function invalidateLocalCache(): Promise<void> {
    await cacheDelete(cacheKeys.tupMetaList);
  }

  return {
    listMeta,
    getDetail,
    adminUpsert,
    adminSetStatus,
    invalidateLocalCache,
  };
}

function applyFilters(items: TupMeta[], filters: TupListFilters): TupMeta[] {
  return items.filter((item) => {
    if (filters.subject && item.subject !== filters.subject) return false;
    if (filters.grade && item.grade !== filters.grade) return false;
    if (filters.language && item.language !== filters.language) return false;
    if (filters.academicYear && item.academicYear !== filters.academicYear) return false;
    return true;
  });
}
