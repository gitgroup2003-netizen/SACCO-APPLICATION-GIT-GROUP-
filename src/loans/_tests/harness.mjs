import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
export async function makeDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, email text, phone text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant usage on schema public to authenticated, anon;
  `);
  await db.exec(fs.readFileSync('base_schema.sql', 'utf8'));
  // mirror the REAL database: savings/shares carry an id column, and the audit function is the corrected one already deployed
  await db.exec(`alter table public.savings_accounts add column if not exists id uuid default gen_random_uuid();
                 alter table public.shares add column if not exists id uuid default gen_random_uuid();`);
  await db.exec(`create or replace function public.write_audit_log() returns trigger language plpgsql security definer set search_path = public as $$
    declare old_j jsonb; new_j jsonb; rid uuid;
    begin
      if TG_OP in ('UPDATE','DELETE') then old_j := to_jsonb(old); end if;
      if TG_OP in ('UPDATE','INSERT') then new_j := to_jsonb(new); end if;
      rid := coalesce(new_j->>'id', old_j->>'id', new_j->>'member_id', old_j->>'member_id')::uuid;
      insert into public.audit_log (table_name, row_id, action, actor_id, old_data, new_data) values (TG_TABLE_NAME, rid, TG_OP, auth.uid(), old_j, new_j);
      if TG_OP = 'DELETE' then return old; end if; return new;
    end; $$;`);
  // Supabase grants table access to authenticated by default; RLS is what restricts it
  await db.exec(`grant all on all tables in schema public to authenticated; grant all on all sequences in schema public to authenticated;
                 grant execute on all functions in schema public to authenticated;`);
  await db.exec(`alter default privileges in schema public grant all on tables to authenticated; alter default privileges in schema public grant all on sequences to authenticated;`);
  return db;
}
export async function migrate(db, files) {
  for (const f of files) await db.exec(fs.readFileSync('/home/claude/work/supabase/migrations/' + f, 'utf8'));
}
export async function as(db, uid, sql, params) {
  await db.exec(`set role authenticated; select set_config('app.uid', '${uid ?? ''}', false);`);
  try { return await db.query(sql, params); }
  finally { await db.exec(`reset role; select set_config('app.uid','',false);`); }
}
export async function expectFail(db, uid, sql, params, label) {
  try { await as(db, uid, sql, params); return { ok: false, label, why: 'expected an error but it succeeded' }; }
  catch (e) { return { ok: true, label, msg: e.message }; }
}
