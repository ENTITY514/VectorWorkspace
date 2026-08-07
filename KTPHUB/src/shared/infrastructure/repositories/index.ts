import { createSupabaseAuthRepository } from "./auth/supabaseAuthRepository";
import { createSupabaseKtpRepository } from "./ktp/supabaseKtpRepository";
import { createSupabaseTupCatalogRepository } from "./tup/supabaseTupCatalogRepository";
import type { AuthRepository, KtpRepository, TupCatalogRepository } from "./types";

export type {
  AuthRepository,
  AuthSession,
  UserProfile,
  UserRole,
  KtpRepository,
  KtpMeta,
  KtpDetail,
  KtpListFilters,
  PublishKtpInput,
  KtpCloudStatus,
  TupCatalogRepository,
  TupMeta,
  TupDetail,
  TupListFilters,
  UpsertTupInput,
  ProgramKind,
  TupStatus,
} from "./types";

let authRepo: AuthRepository | null = null;
let tupRepo: TupCatalogRepository | null = null;
let ktpRepo: KtpRepository | null = null;

export function getAuthRepository(): AuthRepository {
  if (!authRepo) authRepo = createSupabaseAuthRepository();
  return authRepo;
}

export function getTupCatalogRepository(): TupCatalogRepository {
  if (!tupRepo) tupRepo = createSupabaseTupCatalogRepository();
  return tupRepo;
}

export function getKtpRepository(): KtpRepository {
  if (!ktpRepo) ktpRepo = createSupabaseKtpRepository();
  return ktpRepo;
}
