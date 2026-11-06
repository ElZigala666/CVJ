-- =============================================================================
-- CVJ · Migración 004 · PlayStation: cada usuario conecta SU PROPIA cuenta
-- Pégala entera en Supabase → SQL Editor → New query → Run.
-- Necesita la 003 (ya ejecutada). Se puede ejecutar más de una vez.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- psn_cuentas: los tokens de cada usuario (NUNCA el NPSSO).
-- Sin políticas públicas: solo la usa la Edge Function psn con la service role.
-- -----------------------------------------------------------------------------
create table if not exists public.psn_cuentas (
  usuario_id         uuid primary key references public.usuarios(id) on delete cascade,
  account_id         text not null,
  online_id          text not null,
  access_token       text not null,
  refresh_token      text not null,
  expira_en          timestamptz not null,
  refresh_expira_en  timestamptz not null,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now()
);

alter table public.psn_cuentas enable row level security;
revoke all on public.psn_cuentas from anon, authenticated;
grant select, insert, update, delete on public.psn_cuentas to service_role;

-- -----------------------------------------------------------------------------
-- usuarios.psn_reconectar: la conexión de ese usuario ha caducado
-- (la pone la función; la app le enseña "Reconectar" solo a él).
-- -----------------------------------------------------------------------------
alter table public.usuarios add column if not exists psn_reconectar boolean not null default false;

-- -----------------------------------------------------------------------------
-- Limpieza del enfoque anterior (token global y "vincular por ID")
-- -----------------------------------------------------------------------------
drop table if exists public.psn_token;

-- Quien quedara vinculado por ID sin cuenta conectada: se desvincula y se borra
-- su biblioteca (tendrá que conectar su propia cuenta).
delete from public.biblioteca b
  where not exists (select 1 from public.psn_cuentas c where c.usuario_id = b.usuario_id);
update public.usuarios u
  set psn_online_id = null, psn_account_id = null, psn_sincronizado_en = null, psn_reconectar = false
  where psn_account_id is not null
    and not exists (select 1 from public.psn_cuentas c where c.usuario_id = u.id);
