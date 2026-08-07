# Repository pattern

## Зачем

UI и Redux **не зависят** от Supabase. Смена на Nest/VPS = новый adapter за тем же интерфейсом.

## Где лежит (KTPHUB)

```text
src/shared/infrastructure/
  supabase/client.ts
  supabase/env.ts
  cache/localCache.ts
  cache/keys.ts
  repositories/
    types.ts                      # контракты + DTO
    index.ts                      # фабрика getXxxRepository()
    auth/supabaseAuthRepository.ts
    tup/supabaseTupCatalogRepository.ts
    tup/mappers.ts
    ktp/supabaseKtpRepository.ts
    ktp/mappers.ts
```

## Контракты (сейчас)

- `AuthRepository` — session, profile, signIn/Up/Out
- `TupCatalogRepository` — listMeta, getDetail, adminUpsert, adminSetStatus, invalidate
- `KtpRepository` — listMeta, getDetail, upsert, invalidate

Фабрики: `getAuthRepository()`, `getTupCatalogRepository()`, `getKtpRepository()`.

## Правила написания adapter'а

1. Снаружи — доменные типы (`TupMeta`), внутри — snake_case row + mapper.
2. Cache-first для list/detail где это безопасно.
3. После мутаций — `invalidateLocalCache()` для meta.
4. Не светлить service role в браузере.
5. Новый домен (КСП, курс) = **новый** repository + префикс таблиц, не «раздувать» `TupCatalogRepository`.

## Будущий shared-пакет

Когда появится второе приложение:

```text
packages/platform-sdk/
  auth/
  cache/
  supabase/
```

Пока дублирование минимальных типов допустимо; копипасту толстых адаптеров лучше сразу выносить.
