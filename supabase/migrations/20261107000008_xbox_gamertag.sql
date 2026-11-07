-- =============================================================================
-- CVJ · Migración 008 · Xbox por gamertag (con la clave de API de Marcos)
-- Pégala entera en Supabase → SQL Editor → New query → Run.
-- Necesita la 007 (ya ejecutada). Se puede ejecutar más de una vez.
-- =============================================================================

-- Ya no hay inicio de sesión de cada usuario: la tabla de claves sobra.
drop table if exists public.xbox_cuentas;

-- -----------------------------------------------------------------------------
-- estado_servicios: si la clave de OpenXBL del grupo funciona (lo escribe la
-- función xbox; la app se lo enseña solo al admin cuando falla).
-- La clave pública solo lo lee.
-- -----------------------------------------------------------------------------
create table if not exists public.estado_servicios (
  id              text primary key,
  ok              boolean not null default true,
  mensaje         text,
  actualizado_en  timestamptz not null default now()
);
alter table public.estado_servicios enable row level security;
drop policy if exists "publico_leer" on public.estado_servicios;
create policy "publico_leer" on public.estado_servicios for select to anon, authenticated using (true);
grant select on public.estado_servicios to anon, authenticated;
grant select, insert, update, delete on public.estado_servicios to service_role;
