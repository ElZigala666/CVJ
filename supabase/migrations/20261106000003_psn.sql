-- =============================================================================
-- CVJ · Migración 003 · Sincronización con PlayStation (PSN)
-- Pégala entera en Supabase → SQL Editor → New query → Run.
-- Se puede ejecutar más de una vez sin romper nada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- usuarios: datos de PSN y administrador
-- -----------------------------------------------------------------------------
alter table public.usuarios add column if not exists psn_online_id       text;
alter table public.usuarios add column if not exists psn_account_id      text;
alter table public.usuarios add column if not exists psn_sincronizado_en timestamptz;
alter table public.usuarios add column if not exists es_admin            boolean not null default false;

-- -----------------------------------------------------------------------------
-- psn_token (una sola fila; solo la usa la Edge Function con la service role)
-- -----------------------------------------------------------------------------
create table if not exists public.psn_token (
  id                 smallint primary key default 1 check (id = 1),
  access_token       text not null,
  refresh_token      text not null,
  expira_en          timestamptz not null,
  refresh_expira_en  timestamptz not null,
  actualizado_en     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- psn_igdb: emparejamiento compartido título de PSN → juego de IGDB.
-- igdb_id nulo = se intentó emparejar automáticamente y no hubo uno claro.
-- confirmado = true cuando alguien lo eligió a mano.
-- -----------------------------------------------------------------------------
create table if not exists public.psn_igdb (
  psn_title_id    text primary key,
  igdb_id         bigint references public.juegos(igdb_id) on delete set null,
  confirmado      boolean not null default false,
  nombre_psn      text,
  actualizado_en  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- biblioteca: lo que cada usuario ha jugado en PlayStation
-- -----------------------------------------------------------------------------
create table if not exists public.biblioteca (
  id                 uuid primary key default gen_random_uuid(),
  usuario_id         uuid not null references public.usuarios(id) on delete cascade,
  psn_title_id       text not null,
  nombre_psn         text not null,
  plataforma         text check (plataforma is null or plataforma in ('PS4', 'PS5')),
  imagen_psn         text,
  horas              numeric(8,2),
  ultima_vez         timestamptz,
  progreso_trofeos   int check (progreso_trofeos is null or progreso_trofeos between 0 and 100),
  trofeos            jsonb,
  juego_id           bigint references public.juegos(igdb_id) on delete set null,
  actualizado_en     timestamptz not null default now(),
  unique (usuario_id, psn_title_id)
);
create index if not exists biblioteca_usuario_idx on public.biblioteca (usuario_id);
create index if not exists biblioteca_juego_idx on public.biblioteca (juego_id);

-- -----------------------------------------------------------------------------
-- Seguridad
--   biblioteca: la clave pública solo lee (la escribe la función psn).
--   psn_igdb:   la clave pública lee, crea y corrige emparejamientos ("¿Qué juego es?").
--   psn_token:  cerrada (solo service role).
-- -----------------------------------------------------------------------------
alter table public.psn_token  enable row level security;
alter table public.psn_igdb   enable row level security;
alter table public.biblioteca enable row level security;

drop policy if exists "publico_leer" on public.biblioteca;
create policy "publico_leer" on public.biblioteca for select to anon, authenticated using (true);
grant select on public.biblioteca to anon, authenticated;

drop policy if exists "publico_leer" on public.psn_igdb;
drop policy if exists "publico_crear" on public.psn_igdb;
drop policy if exists "publico_editar" on public.psn_igdb;
create policy "publico_leer" on public.psn_igdb for select to anon, authenticated using (true);
create policy "publico_crear" on public.psn_igdb for insert to anon, authenticated with check (true);
create policy "publico_editar" on public.psn_igdb for update to anon, authenticated using (true) with check (true);
grant select, insert, update on public.psn_igdb to anon, authenticated;

revoke all on public.psn_token from anon, authenticated;
grant select, insert, update, delete on public.psn_token, public.biblioteca, public.psn_igdb to service_role;

-- =============================================================================
-- MARCARTE COMO ADMIN (quita los "--" y cambia el nombre si hace falta)
-- =============================================================================
-- update public.usuarios set es_admin = true where nombre = 'Marcos';
