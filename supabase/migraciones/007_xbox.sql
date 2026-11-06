-- =============================================================================
-- CVJ · Migración 007 · Xbox (OpenXBL) y biblioteca multiplataforma
-- Pégala entera en Supabase → SQL Editor → New query → Run.
-- Necesita de la 003 a la 006 (ya ejecutadas). Se puede ejecutar más de una vez.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- biblioteca.fuente: de dónde viene cada título ('psn' | 'xbox'; 'steam' más adelante).
-- Lo que ya había es de PlayStation. El id del título sigue en psn_title_id
-- (los de Xbox van como "XBOX-{titleId}", así no chocan con los de PSN).
-- -----------------------------------------------------------------------------
alter table public.biblioteca add column if not exists fuente text not null default 'psn';
update public.biblioteca set fuente = 'psn' where fuente is null;
alter table public.biblioteca drop constraint if exists biblioteca_fuente_check;
alter table public.biblioteca add constraint biblioteca_fuente_check check (fuente in ('psn', 'xbox', 'steam'));
create index if not exists biblioteca_fuente_idx on public.biblioteca (usuario_id, fuente);

-- Plataformas: además de PS4 y PS5, las de Xbox y PC.
alter table public.biblioteca drop constraint if exists biblioteca_plataforma_check;
alter table public.biblioteca add constraint biblioteca_plataforma_check
  check (plataforma is null or plataforma in ('PS4', 'PS5', 'Xbox One', 'Xbox Series', 'Xbox 360', 'PC'));

-- -----------------------------------------------------------------------------
-- usuarios: datos de Xbox (visibles para el grupo; la clave NO va aquí)
-- -----------------------------------------------------------------------------
alter table public.usuarios add column if not exists xbox_gamertag       text;
alter table public.usuarios add column if not exists xbox_xuid           text;
alter table public.usuarios add column if not exists xbox_sincronizado_en timestamptz;
alter table public.usuarios add column if not exists xbox_reconectar     boolean not null default false;

-- -----------------------------------------------------------------------------
-- xbox_cuentas: la clave de OpenXBL de cada usuario (la que da "claim").
-- Sin políticas públicas: solo la usa la Edge Function xbox con la service role.
-- -----------------------------------------------------------------------------
create table if not exists public.xbox_cuentas (
  usuario_id      uuid primary key references public.usuarios(id) on delete cascade,
  xuid            text not null,
  gamertag        text not null,
  app_key         text not null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
alter table public.xbox_cuentas enable row level security;
revoke all on public.xbox_cuentas from anon, authenticated;
grant select, insert, update, delete on public.xbox_cuentas to service_role;
