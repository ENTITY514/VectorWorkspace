import { KtpPlan } from "../../../../entities/ktp/model/types";
import { KtpCloudStatus, KtpDetail, KtpMeta } from "../types";

export interface KtpDocumentRow {
  id: string;
  owner_id: string;
  title: string;
  source_tup_id: string | null;
  subject: string;
  grade: string;
  language: string;
  class_name: string;
  status: KtpCloudStatus;
  content_version: number;
  plan_json: KtpPlan;
  total_hours: number;
  quarter_work_hours: { q1: number; q2: number; q3: number; q4: number };
  published_at: string | null;
  updated_at: string;
}

export function mapKtpMeta(row: KtpDocumentRow): KtpMeta {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    grade: row.grade,
    language: row.language,
    className: row.class_name,
    status: row.status,
    contentVersion: row.content_version,
    ownerId: row.owner_id,
    sourceTupId: row.source_tup_id,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

export function mapKtpDetail(row: KtpDocumentRow): KtpDetail {
  return {
    ...mapKtpMeta(row),
    plan: row.plan_json ?? [],
    totalHours: row.total_hours ?? 0,
    quarterWorkHours: row.quarter_work_hours ?? { q1: 0, q2: 0, q3: 0, q4: 0 },
  };
}
