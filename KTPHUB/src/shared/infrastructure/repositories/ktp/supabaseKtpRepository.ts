import { cacheDelete, cacheGet, cacheSet } from "../../cache/localCache";
import { cacheKeys } from "../../cache/keys";
import { getSupabaseClient } from "../../supabase/client";
import {
  KtpDetail,
  KtpListFilters,
  KtpMeta,
  KtpRepository,
  PublishKtpInput,
} from "../types";
import { KtpDocumentRow, mapKtpDetail, mapKtpMeta } from "./mappers";

const SELECT =
  "id, owner_id, title, source_tup_id, subject, grade, language, class_name, status, content_version, plan_json, total_hours, quarter_work_hours, published_at, updated_at";

export function createSupabaseKtpRepository(): KtpRepository {
  const supabase = getSupabaseClient();

  async function listMeta(filters: KtpListFilters = {}): Promise<KtpMeta[]> {
    const onlyPublished = filters.onlyPublished !== false;
    const cacheKey = cacheKeys.ktpMetaList;

    if (onlyPublished) {
      const cached = await cacheGet<KtpMeta[]>(cacheKey);
      if (cached?.value?.length) {
        return applyFilters(cached.value, filters);
      }
    }

    let query = supabase.from("ktp_documents").select(SELECT).order("updated_at", {
      ascending: false,
    });

    if (onlyPublished) {
      query = query.eq("status", "published");
    }

    const { data, error } = await query;
    if (error) throw error;

    const metas = ((data ?? []) as KtpDocumentRow[]).map(mapKtpMeta);
    if (onlyPublished) {
      await cacheSet(cacheKey, metas);
    }
    return applyFilters(metas, filters);
  }

  async function getDetail(id: string): Promise<KtpDetail> {
    const metaCached = await cacheGet<KtpMeta[]>(cacheKeys.ktpMetaList);
    const meta = metaCached?.value?.find((item) => item.id === id);
    if (meta) {
      const cachedDetail = await cacheGet<KtpDetail>(
        cacheKeys.ktpDetail(id, meta.contentVersion)
      );
      if (cachedDetail?.value) return cachedDetail.value;
    }

    const { data, error } = await supabase
      .from("ktp_documents")
      .select(SELECT)
      .eq("id", id)
      .single();
    if (error) throw error;

    const detail = mapKtpDetail(data as KtpDocumentRow);
    await cacheSet(cacheKeys.ktpDetail(id, detail.contentVersion), detail);
    return detail;
  }

  async function upsert(input: PublishKtpInput): Promise<KtpDetail> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Необходима авторизация");

    const base = {
      owner_id: user.id,
      title: input.title,
      subject: input.subject,
      grade: input.grade,
      language: input.language,
      class_name: input.className,
      source_tup_id: input.sourceTupId ?? null,
      plan_json: input.plan,
      total_hours: input.totalHours,
      quarter_work_hours: input.quarterWorkHours,
      status: input.status,
      published_at: input.status === "published" ? new Date().toISOString() : null,
    };

    if (input.id) {
      const { data: existing, error: existingError } = await supabase
        .from("ktp_documents")
        .select("content_version")
        .eq("id", input.id)
        .single();
      if (existingError) throw existingError;

      const { data, error } = await supabase
        .from("ktp_documents")
        .update({
          ...base,
          content_version: (existing.content_version ?? 1) + 1,
        })
        .eq("id", input.id)
        .select(SELECT)
        .single();
      if (error) throw error;
      await invalidateLocalCache();
      return mapKtpDetail(data as KtpDocumentRow);
    }

    const { data, error } = await supabase
      .from("ktp_documents")
      .insert(base)
      .select(SELECT)
      .single();
    if (error) throw error;
    await invalidateLocalCache();
    return mapKtpDetail(data as KtpDocumentRow);
  }

  async function invalidateLocalCache(): Promise<void> {
    await cacheDelete(cacheKeys.ktpMetaList);
  }

  return { listMeta, getDetail, upsert, invalidateLocalCache };
}

function applyFilters(items: KtpMeta[], filters: KtpListFilters): KtpMeta[] {
  return items.filter((item) => {
    if (filters.subject && item.subject !== filters.subject) return false;
    if (filters.grade && item.grade !== filters.grade) return false;
    if (filters.language && item.language !== filters.language) return false;
    return true;
  });
}
