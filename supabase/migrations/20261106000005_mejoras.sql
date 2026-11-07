-- =============================================================================
-- CVJ · Migración 005 · Ronda de mejoras
--   color dominante de las portadas, fotos de perfil, horas manuales,
--   juegos online, ocultar de la biblioteca y reintento de emparejamientos.
-- Pégala entera en Supabase → SQL Editor → New query → Run.
-- Necesita la 003 y la 004 (ya ejecutadas). Se puede ejecutar más de una vez.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- juegos
--   color_dominante: "#RRGGBB" sacado de la portada (lo calcula la app una vez).
--   es_online: juego online / sin final (null = aún sin revisar).
--   es_online_manual: lo que alguien eligió a mano en la ficha (manda sobre
--   la detección automática; null = nadie lo ha tocado).
-- -----------------------------------------------------------------------------
alter table public.juegos add column if not exists color_dominante text;
alter table public.juegos add column if not exists es_online boolean;
alter table public.juegos add column if not exists es_online_manual boolean;
alter table public.juegos drop constraint if exists juegos_color_dominante_check;
alter table public.juegos add constraint juegos_color_dominante_check
  check (color_dominante is null or color_dominante ~ '^#[0-9A-Fa-f]{6}$');

-- -----------------------------------------------------------------------------
-- usuarios.foto_url: foto de perfil (en el bucket "avatares")
-- -----------------------------------------------------------------------------
alter table public.usuarios add column if not exists foto_url text;

-- -----------------------------------------------------------------------------
-- valoraciones.horas: horas jugadas puestas a mano (mandan sobre las de PSN)
-- -----------------------------------------------------------------------------
alter table public.valoraciones add column if not exists horas numeric(7,1);
alter table public.valoraciones drop constraint if exists valoraciones_horas_check;
alter table public.valoraciones add constraint valoraciones_horas_check
  check (horas is null or (horas >= 0 and horas <= 99999));

-- -----------------------------------------------------------------------------
-- biblioteca.oculto: "Ocultar de mi biblioteca" (la sincronización lo respeta)
-- La clave pública solo puede cambiar esa columna.
-- -----------------------------------------------------------------------------
alter table public.biblioteca add column if not exists oculto boolean not null default false;
drop policy if exists "publico_ocultar" on public.biblioteca;
create policy "publico_ocultar" on public.biblioteca for update to anon, authenticated using (true) with check (true);
revoke update on public.biblioteca from anon, authenticated;
grant update (oculto) on public.biblioteca to anon, authenticated;

-- -----------------------------------------------------------------------------
-- psn_igdb.algoritmo: con qué versión del emparejamiento se intentó.
-- Los "intentados sin éxito" con la versión 1 se reintentan una vez con la 2.
-- -----------------------------------------------------------------------------
alter table public.psn_igdb add column if not exists algoritmo smallint not null default 1;

-- -----------------------------------------------------------------------------
-- Storage: bucket público "avatares" (fotos de 256 px en WebP o JPEG)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatares_leer" on storage.objects;
drop policy if exists "avatares_subir" on storage.objects;
drop policy if exists "avatares_cambiar" on storage.objects;
drop policy if exists "avatares_borrar" on storage.objects;
create policy "avatares_leer" on storage.objects for select to anon, authenticated using (bucket_id = 'avatares');
create policy "avatares_subir" on storage.objects for insert to anon, authenticated with check (bucket_id = 'avatares');
create policy "avatares_cambiar" on storage.objects for update to anon, authenticated using (bucket_id = 'avatares') with check (bucket_id = 'avatares');
create policy "avatares_borrar" on storage.objects for delete to anon, authenticated using (bucket_id = 'avatares');
