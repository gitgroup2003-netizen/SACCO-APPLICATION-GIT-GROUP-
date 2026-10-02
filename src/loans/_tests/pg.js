// A tiny PostgREST look-alike on top of a real Postgres (PGlite) so the real UI
// can be driven against the real loan SQL. Supports what the loan screens use.
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';

export async function makeBackend() {
  // PostgREST returns numeric/bigint as JSON numbers; mirror that
  const db = new PGlite({ parsers: { 1700: v => parseFloat(v), 20: v => parseInt(v, 10) } });
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create table auth.users (id uuid primary key, email text, phone text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant usage on schema public to authenticated, anon;`);
  const base = fs.readFileSync('/home/claude/dbtest/base_schema.sql', 'utf8');
  await db.exec(base);
  await db.exec(`alter table public.savings_accounts add column if not exists id uuid default gen_random_uuid();
                 alter table public.shares add column if not exists id uuid default gen_random_uuid();`);
  await db.exec(`create or replace function public.write_audit_log() returns trigger language plpgsql security definer set search_path = public as $$
    declare old_j jsonb; new_j jsonb; rid uuid; begin
      if TG_OP in ('UPDATE','DELETE') then old_j := to_jsonb(old); end if; if TG_OP in ('UPDATE','INSERT') then new_j := to_jsonb(new); end if;
      rid := coalesce(new_j->>'id', old_j->>'id', new_j->>'member_id', old_j->>'member_id')::uuid;
      insert into public.audit_log (table_name,row_id,action,actor_id,old_data,new_data) values (TG_TABLE_NAME,rid,TG_OP,auth.uid(),old_j,new_j);
      if TG_OP='DELETE' then return old; end if; return new; end; $$;`);
  await db.exec(`alter default privileges in schema public grant all on tables to authenticated;
                 grant all on all tables in schema public to authenticated;`);
  for (const f of ['01_loan_foundation.sql', '02_loan_engine.sql', '03_loan_hardening.sql'])
    await db.exec(fs.readFileSync('/home/claude/work/supabase/migrations/' + f, 'utf8'));
  return db;
}

const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const lit = v => v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? String(v) : q(typeof v === 'object' ? JSON.stringify(v) : v);

function filtersSql(params) {
  const out = [];
  for (const [k, v] of params) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    const m = /^(eq|gte|lte|gt|lt|neq)\.(.*)$/.exec(v);
    if (!m) throw new Error('unsupported filter ' + k + '=' + v);
    const op = { eq: '=', gte: '>=', lte: '<=', gt: '>', lt: '<', neq: '<>' }[m[1]];
    out.push(`"${k}" ${op} ${q(m[2])}`);
  }
  return out.length ? ' where ' + out.join(' and ') : '';
}

// session: { uid } — acts like the JWT behind each request
export function makeSb(db, session) {
  return async function sb(path, { method = 'GET', body } = {}) {
    const u = new URL('http://x' + path);
    await db.exec(`set role authenticated; select set_config('app.uid', '${session.uid}', false);`);
    try {
      const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(u.pathname);
      if (rpc) {
        const args = Object.entries(body || {}).map(([k, v]) => `${k} => ${lit(v)}`).join(', ');
        const r = await db.query(`select * from public.${rpc[1]}(${args})`);
        const rows = r.rows, f = r.fields || [];
        if (rows.length === 1 && f.length === 1) {
          const v = rows[0][f[0].name];
          return v === undefined ? null : v;
        }
        return rows;
      }
      const t = /^\/rest\/v1\/(\w+)$/.exec(u.pathname);
      if (!t) throw new Error('unsupported path ' + path);
      const table = t[1];
      if (method === 'GET') {
        const order = u.searchParams.get('order'); const limit = u.searchParams.get('limit');
        let sql = `select * from public."${table}"` + filtersSql(u.searchParams);
        if (order) sql += ' order by ' + order.split(',').map(o => { const [c, d] = o.split('.'); return `"${c}" ${d === 'desc' ? 'desc' : 'asc'}`; }).join(', ');
        if (limit) sql += ' limit ' + Number(limit);
        return (await db.query(sql)).rows;
      }
      if (method === 'POST') {
        const keys = Object.keys(body);
        await db.query(`insert into public."${table}" (${keys.map(k => `"${k}"`).join(',')}) values (${keys.map(k => lit(body[k])).join(',')})`);
        return null;
      }
      if (method === 'PATCH') {
        const sets = Object.entries(body).map(([k, v]) => `"${k}" = ${lit(v)}`).join(', ');
        await db.query(`update public."${table}" set ${sets}` + filtersSql(u.searchParams));
        return null;
      }
      throw new Error('unsupported method ' + method);
    } catch (e) {
      throw new Error(e.message);
    } finally {
      await db.exec(`reset role; select set_config('app.uid','',false);`);
    }
  };
}
