import { AcademicPlan } from "../../../entities/circulumPlan/model/types";
import { KtpPlan } from "../../../entities/ktp/model/types";

export type UserRole = "teacher" | "admin";

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
}

export interface AuthSession {
  userId: string;
  email: string | null;
  accessToken: string;
}

export interface AuthRepository {
  getSession(): Promise<AuthSession | null>;
  getProfile(userId: string): Promise<UserProfile | null>;
  signIn(email: string, password: string): Promise<AuthSession>;
  signUp(email: string, password: string, displayName?: string): Promise<AuthSession>;
  signOut(): Promise<void>;
  onAuthStateChange(callback: (session: AuthSession | null) => void): () => void;
}

export type ProgramKind = "tup" | "tupr";
export type TupStatus = "draft" | "published" | "archived";

export interface TupMeta {
  id: string;
  title: string;
  subject: string;
  grade: string;
  language: string;
  programKind: ProgramKind;
  academicYear: string;
  status: TupStatus;
  contentVersion: number;
  updatedAt: string;
}

export interface TupDetail extends TupMeta {
  planData: AcademicPlan;
  sourceFilePath: string | null;
}

export interface TupListFilters {
  subject?: string;
  grade?: string;
  language?: string;
  academicYear?: string;
  /** admin can list drafts */
  includeDrafts?: boolean;
}

export interface UpsertTupInput {
  id?: string;
  title: string;
  subject: string;
  grade: string;
  language: string;
  programKind: ProgramKind;
  academicYear: string;
  status: TupStatus;
  planData: AcademicPlan;
  file?: File | null;
}

export interface TupCatalogRepository {
  listMeta(filters?: TupListFilters): Promise<TupMeta[]>;
  getDetail(id: string): Promise<TupDetail>;
  adminUpsert(input: UpsertTupInput): Promise<TupDetail>;
  adminSetStatus(id: string, status: TupStatus): Promise<void>;
  invalidateLocalCache(): Promise<void>;
}

export type KtpCloudStatus = "draft" | "published";

export interface KtpMeta {
  id: string;
  title: string;
  subject: string;
  grade: string;
  language: string;
  className: string;
  status: KtpCloudStatus;
  contentVersion: number;
  ownerId: string;
  sourceTupId: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface KtpDetail extends KtpMeta {
  plan: KtpPlan;
  totalHours: number;
  quarterWorkHours: { q1: number; q2: number; q3: number; q4: number };
}

export interface KtpListFilters {
  subject?: string;
  grade?: string;
  language?: string;
  onlyPublished?: boolean;
}

export interface PublishKtpInput {
  id?: string;
  title: string;
  subject: string;
  grade: string;
  language: string;
  className: string;
  sourceTupId?: string | null;
  plan: KtpPlan;
  totalHours: number;
  quarterWorkHours: { q1: number; q2: number; q3: number; q4: number };
  status: KtpCloudStatus;
}

export interface KtpRepository {
  listMeta(filters?: KtpListFilters): Promise<KtpMeta[]>;
  getDetail(id: string): Promise<KtpDetail>;
  upsert(input: PublishKtpInput): Promise<KtpDetail>;
  invalidateLocalCache(): Promise<void>;
}
