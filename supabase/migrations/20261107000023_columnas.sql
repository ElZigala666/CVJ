-- =============================================================================
-- CVJ · Columnas de opinión ("El Diario de Mateo")
--
--  · columnas: una por columnista (lo decide el admin en Gestionar grupo), con
--    nombre, logo (Storage, cuadrado) y color propio opcionales.
--  · entradas: textos largos (hasta 100.000 caracteres, Markdown ligero) sobre un
--    juego, una colección, una saga o sin tema. Borrador o publicada; se pueden
--    editar y despublicar. "palabras" se guarda al escribir para calcular el tiempo
--    de lectura sin descargar el texto entero.
--  · lecturas: quién ha leído qué (para quitar el aviso "Nuevo en …" de Inicio).
--  · Bucket "columnas" (público): logos e imágenes de las entradas.
-- =============================================================================

create table if not exists public.columnas (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null unique references public.usuarios(id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) between 1 and 60),
  logo_url    text,
  color       text check (color is null or color ~* '^#[0-9a-f]{6}$'),
  activa      boolean not null default true,
  creado_en   timestamptz not null default now()
);

create table if not exists public.entradas (
  id              uuid primary key default gen_random_uuid(),
  columna_id      uuid not null references public.columnas(id) on delete cascade,
  usuario_id      uuid not null references public.usuarios(id) on delete cascade,
  juego_id        bigint references public.juegos(igdb_id) on delete set null,
  coleccion_id    uuid references public.colecciones(id) on delete set null,
  saga_id         uuid references public.sagas(id) on delete set null,
  titulo          text not null default '' check (length(titulo) <= 200),
  subtitulo       text check (subtitulo is null or length(subtitulo) <= 300),
  cuerpo          text not null default '' check (length(cuerpo) <= 100000),
  palabras        int not null default 0,
  estado          text not null default 'borrador' check (estado in ('borrador', 'publicada')),
  publicada_en    timestamptz,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists entradas_columna_idx on public.entradas (columna_id, publicada_en desc);
create index if not exists entradas_juego_idx on public.entradas (juego_id);

create table if not exists public.lecturas (
  usuario_id  uuid not null references public.usuarios(id) on delete cascade,
  entrada_id  uuid not null references public.entradas(id) on delete cascade,
  leida_en    timestamptz not null default now(),
  primary key (usuario_id, entrada_id)
);

do $$
declare t text;
begin
  foreach t in array array['columnas', 'entradas', 'lecturas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "publico_leer" on public.%I', t);
    execute format('drop policy if exists "publico_crear" on public.%I', t);
    execute format('drop policy if exists "publico_editar" on public.%I', t);
    execute format('drop policy if exists "publico_borrar" on public.%I', t);
    execute format('create policy "publico_leer" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "publico_crear" on public.%I for insert to anon, authenticated with check (true)', t);
    execute format('create policy "publico_editar" on public.%I for update to anon, authenticated using (true) with check (true)', t);
    execute format('create policy "publico_borrar" on public.%I for delete to anon, authenticated using (true)', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated, service_role', t);
  end loop;
end $$;

-- Storage: logos e imágenes de las columnas (como el de las fotos de perfil).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('columnas', 'columnas', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

drop policy if exists "columnas_leer" on storage.objects;
drop policy if exists "columnas_subir" on storage.objects;
drop policy if exists "columnas_cambiar" on storage.objects;
drop policy if exists "columnas_borrar" on storage.objects;
create policy "columnas_leer" on storage.objects for select to anon, authenticated using (bucket_id = 'columnas');
create policy "columnas_subir" on storage.objects for insert to anon, authenticated with check (bucket_id = 'columnas');
create policy "columnas_cambiar" on storage.objects for update to anon, authenticated using (bucket_id = 'columnas') with check (bucket_id = 'columnas');
create policy "columnas_borrar" on storage.objects for delete to anon, authenticated using (bucket_id = 'columnas');
