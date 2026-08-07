export const cacheKeys = {
  tupMetaList: "catalog:tup:meta",
  tupDetail: (id: string, version: number) => `catalog:tup:detail:${id}:v${version}`,
  ktpMetaList: "catalog:ktp:meta",
  ktpDetail: (id: string, version: number) => `catalog:ktp:detail:${id}:v${version}`,
  profile: (userId: string) => `auth:profile:${userId}`,
} as const;
