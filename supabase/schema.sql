-- =============================================================================
-- CVJ · Críticas de VideoJuegos · esquema de la base de datos (fase 1)
-- Pégalo entero en Supabase → SQL Editor → New query → Run.
-- Se puede ejecutar más de una vez sin romper nada (usa IF NOT EXISTS / OR REPLACE).
-- =============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- usuarios
-- -----------------------------------------------------------------------------
create table if not exists public.usuarios (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  inicial      text not null check (char_length(inicial) between 1 and 2),
  color        text not null default '#6D28D9' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  acento       text check (acento is null or acento ~ '^#[0-9A-Fa-f]{6}$'),
  codigo_hash  text not null unique check (codigo_hash ~ '^[0-9a-f]{64}$'),
  creado_en    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- juegos (caché del catálogo de IGDB)
-- -----------------------------------------------------------------------------
create table if not exists public.juegos (
  igdb_id         bigint primary key,
  nombre          text not null,
  slug            text,
  cover_id        text,                 -- image_id de IGDB
  anio            smallint,
  plataformas     text[] not null default '{}',
  desarrolladora  text,
  generos         text[] not null default '{}',
  resumen         text,
  actualizado_en  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- valoraciones (una por usuario y juego)
-- -----------------------------------------------------------------------------
create table if not exists public.valoraciones (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references public.usuarios(id) on delete cascade,
  juego_id        bigint not null references public.juegos(igdb_id) on delete cascade,
  estado          text not null check (estado in ('jugando', 'completado', 'abandonado', 'pendiente')),
  nota            numeric(3,1) check (nota is null or (nota >= 0 and nota <= 10)),
  recomendado     boolean,
  plataforma      text,
  resena          text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  unique (usuario_id, juego_id)
);
create index if not exists valoraciones_juego_idx on public.valoraciones (juego_id);

-- -----------------------------------------------------------------------------
-- actividad (feed de Inicio)
-- -----------------------------------------------------------------------------
create table if not exists public.actividad (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references public.usuarios(id) on delete cascade,
  juego_id     bigint not null references public.juegos(igdb_id) on delete cascade,
  tipo         text not null check (tipo in ('valoro', 'empezo', 'completo', 'abandono', 'pendiente')),
  nota         numeric(3,1) check (nota is null or (nota >= 0 and nota <= 10)),
  recomendado  boolean,
  texto        text,
  creado_en    timestamptz not null default now()
);
create index if not exists actividad_creado_idx on public.actividad (creado_en desc);

-- -----------------------------------------------------------------------------
-- igdb_token (una sola fila; solo la usa la Edge Function con la service role)
-- -----------------------------------------------------------------------------
create table if not exists public.igdb_token (
  id            smallint primary key default 1 check (id = 1),
  access_token  text not null,
  expira_en     timestamptz not null
);

-- -----------------------------------------------------------------------------
-- actualizado_en automático en valoraciones
-- -----------------------------------------------------------------------------
create or replace function public.tocar_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists valoraciones_actualizado on public.valoraciones;
create trigger valoraciones_actualizado
  before update on public.valoraciones
  for each row execute function public.tocar_actualizado_en();

-- -----------------------------------------------------------------------------
-- Seguridad: RLS en todas las tablas.
-- Es una app entre amigos: la clave pública puede leer y escribir en
-- usuarios, juegos, valoraciones y actividad. igdb_token queda cerrada.
-- -----------------------------------------------------------------------------
alter table public.usuarios      enable row level security;
alter table public.juegos        enable row level security;
alter table public.valoraciones  enable row level security;
alter table public.actividad     enable row level security;
alter table public.igdb_token    enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['usuarios', 'juegos', 'valoraciones', 'actividad'] loop
    execute format('drop policy if exists "publico_leer" on public.%I', t);
    execute format('drop policy if exists "publico_crear" on public.%I', t);
    execute format('drop policy if exists "publico_editar" on public.%I', t);
    execute format('drop policy if exists "publico_borrar" on public.%I', t);
    execute format('create policy "publico_leer" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "publico_crear" on public.%I for insert to anon, authenticated with check (true)', t);
    execute format('create policy "publico_editar" on public.%I for update to anon, authenticated using (true) with check (true)', t);
    execute format('create policy "publico_borrar" on public.%I for delete to anon, authenticated using (true)', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- igdb_token: sin políticas públicas y sin permisos para la clave pública.
revoke all on public.igdb_token from anon, authenticated;
grant select, insert, update, delete on public.igdb_token to service_role;

-- =============================================================================
-- ALTA DE USUARIOS (ejemplo; quita los "--" y cambia los datos)
-- El hash se saca con herramientas/generar-hash.html (código en mayúsculas y sin espacios).
-- Colores de avatar del diseño: #6D28D9 #B45309 #15803D #0E7490 #BE185D #1D4ED8
-- =============================================================================
-- insert into public.usuarios (nombre, inicial, color, codigo_hash) values
--   ('Marcos', 'M', '#6D28D9', 'PEGA_AQUÍ_EL_HASH_DE_MARCOS'),
--   ('Dani',   'D', '#B45309', 'PEGA_AQUÍ_EL_HASH_DE_DANI'),
--   ('Sergio', 'S', '#15803D', 'PEGA_AQUÍ_EL_HASH_DE_SERGIO'),
--   ('Álex',   'Á', '#0E7490', 'PEGA_AQUÍ_EL_HASH_DE_ÁLEX'),
--   ('Pablo',  'P', '#BE185D', 'PEGA_AQUÍ_EL_HASH_DE_PABLO'),
--   ('Iván',   'I', '#1D4ED8', 'PEGA_AQUÍ_EL_HASH_DE_IVÁN');
