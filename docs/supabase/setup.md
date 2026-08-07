# Supabase: настройка и окружение

## Проект

| Поле | Значение |
|------|----------|
| Project ref | `rzmbtqhkwxudteyinkkw` |
| URL | `https://rzmbtqhkwxudteyinkkw.supabase.co` |
| Region | `ap-southeast-1` |

Секреты и ключи хранятся **только** в корневом `.env.local` (см. `.env.example`).

## Переменные

| Переменная | Кто использует | Можно в git? |
|------------|----------------|--------------|
| `SUPABASE_URL` / `REACT_APP_SUPABASE_URL` | клиенты | URL — да в example |
| `SUPABASE_ANON_KEY` / `REACT_APP_SUPABASE_ANON_KEY` | клиенты (публичный) | example без реального ключа |
| `SUPABASE_PUBLISHABLE_KEY` | новые клиенты Supabase | не коммитить прод-значения |
| `SUPABASE_DB_PASSWORD` | CLI / psql / агент | **никогда** |
| `DATABASE_URL` | прямые SQL-скрипты | **никогда** |
| `service_role` | только сервер/edge | **никогда во фронт и в чат** |

## Рекомендуемые настройки Dashboard

- **Enable Data API** — ON  
- **Automatically expose new tables** — OFF  
- **Enable automatic RLS** — ON  
- Auth Site URL (dev): `http://localhost:3000`  
- Redirect URLs: `http://localhost:3000/**`  
- Для локальной разработки можно отключить Confirm email  

## Миграции

Канонический путь: [`/supabase/migrations`](../../supabase/migrations).

Первичная схема уже применена через SQL Editor (`001_init.sql`).

Новые изменения:

1. Добавь файл `supabase/migrations/00X_description.sql`
2. Примени через SQL Editor **или** CLI (`supabase db push` / `psql "$DATABASE_URL" -f ...`) после `supabase login` + `link`
3. Обнови [schema.md](./schema.md)

## Сделать пользователя админом

```sql
update public.profiles
set role = 'admin'
where email = 'your@email.com';
```

## Безопасность

- Пароль БД, попавший в чат/лог, считай скомпрометированным → смени в Dashboard.
- Не коммить `.env.local`.
- Anon key защищён RLS; дырявые политики = дырявые данные.
