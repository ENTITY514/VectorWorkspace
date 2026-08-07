# Auth, роли и RLS

## Auth flow (клиент)

1. `AuthRepository.signUp` / `signIn` → Supabase Auth.
2. Триггер создаёт `profiles` с `role = teacher`.
3. `AuthProvider` держит `session` + `profile` в React context.
4. `RequireAuth` / `adminOnly` охраняют маршруты.

Код KTPHUB:
- `src/entities/session`
- `src/features/AuthForms`
- `src/features/RequireAuth`
- `src/shared/infrastructure/repositories/auth/*`

## Роли

| Role | Может |
|------|--------|
| `teacher` | читать published ТУП/КТП; создавать/публиковать свои КТП; свой профиль |
| `admin` | всё teacher + писать ТУП/блоки/storage; видеть draft ТУП |

Назначение admin — только SQL/оператор (см. setup.md). Не давать self-upgrade через UI.

## RLS (суть политик)

- **profiles**: select own (или admin); update own (без смены `role` через UI — следить при будущих forms).
- **tup_***: select если `published` или admin; write только admin.
- **ktp_documents**: select own или `published` или admin; insert/update/delete own (admin тоже).

Политики описаны в `001_init.sql`. При новых таблицах:

1. `enable row level security`
2. Явные `GRANT` (auto-expose tables выключен)
3. Политики под роль
4. Никогда не оставлять таблицу с RLS off + grant to anon/authenticated

## JWT

Клиенты используют anon key + user JWT после login.  
Ручная проверка ECC/HS256 ключей не нужна при работе через `supabase-js`.
