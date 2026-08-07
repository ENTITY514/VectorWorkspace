# Supabase setup for KTPHUB

## 1. Apply SQL

Open Supabase → SQL Editor → paste and run:

- `supabase/migrations/001_init.sql`

## 2. Env

`.env.local` (already gitignored):

```
REACT_APP_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_anon_key
```

## 3. Auth URLs

Authentication → URL configuration:

- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/**`

For local testing, disable **Confirm email** under Auth → Providers → Email.

## 4. Make yourself admin

Register in the app, then run:

```sql
update public.profiles set role = 'admin' where email = 'YOUR@EMAIL';
```

## 5. Start

```bash
npm start
```

Flows:

- `/admin/tup` — upload TUP (admin)
- `/tup-catalog` — pick TUP → create KTP
- Editor / saved list — publish KTP
- `/ktp-catalog` — browse published KTP
