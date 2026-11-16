-- =============================================================================
-- CVJ · Reacciones y respuestas a reseñas y a entradas de las columnas
--
--  · reacciones: una por persona y cosa (se puede cambiar o quitar). "objetivo" dice
--    a qué va: una reseña de juego (valoraciones), de colección (valoraciones_coleccion)
--    o una entrada de columna (entradas). Tipos: buena, mala, acuerdo, discrepo y "wtf"
--    ("¿Qué cojones me estás contando?").
--  · comentarios: respuestas cortas (hasta 500 caracteres), en hilo debajo de lo mismo.
--  · Si se borra la reseña o la entrada, se van sus reacciones y respuestas.
--  · usuarios.social_visto_en: hasta cuándo ha visto cada uno lo nuevo (reacciones,
--    respuestas y lecturas de lo suyo), en todos sus dispositivos.
--  · lecturas: ahora las lee todo el grupo ("Leído por"); la app solo apunta una
--    lectura cuando se ha leído de verdad (casi hasta el final o un rato).
--  · huellas(): también de estas tablas y de celebraciones_vistas.
-- =============================================================================

create table if not exists public.reacciones (
  usuario_id     uuid not null references public.usuarios(id) on delete cascade,
  objetivo       text not null check (objetivo in ('valoracion', 'valoracion_coleccion', 'entrada')),
  objetivo_id    uuid not null,
  tipo           text not null check (tipo in ('buena', 'mala', 'acuerdo', 'discrepo', 'wtf')),
  creado_en      timestamptz not null default now(),
  primary key (usuario_id, objetivo, objetivo_id)
);
create index if not exists reacciones_objetivo on public.reacciones (objetivo, objetivo_id);

create table if not exists public.comentarios (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references public.usuarios(id) on delete cascade,
  objetivo       text not null check (objetivo in ('valoracion', 'valoracion_coleccion', 'entrada')),
  objetivo_id    uuid not null,
  texto          text not null check (length(trim(texto)) between 1 and 500),
  creado_en      timestamptz not null default now()
);
create index if not exists comentarios_objetivo on public.comentarios (objetivo, objetivo_id, creado_en);

do $$
declare t text;
begin
  foreach t in array array['reacciones', 'comentarios'] loop
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

-- Al borrar una reseña o una entrada, sus reacciones y respuestas.
create or replace function public.borrar_social()
returns trigger language plpgsql security definer set search_path = public as $bs$
begin
  delete from reacciones where objetivo = tg_argv[0] and objetivo_id = old.id;
  delete from comentarios where objetivo = tg_argv[0] and objetivo_id = old.id;
  return old;
end
$bs$;
drop trigger if exists borrar_social on public.valoraciones;
create trigger borrar_social after delete on public.valoraciones for each row execute function public.borrar_social('valoracion');
drop trigger if exists borrar_social on public.valoraciones_coleccion;
create trigger borrar_social after delete on public.valoraciones_coleccion for each row execute function public.borrar_social('valoracion_coleccion');
drop trigger if exists borrar_social on public.entradas;
create trigger borrar_social after delete on public.entradas for each row execute function public.borrar_social('entrada');

alter table public.usuarios add column if not exists social_visto_en timestamptz;

create or replace function public.huellas()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'usuarios', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from usuarios t) x),
    'valoraciones', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from valoraciones t) x),
    'juegos', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5((to_jsonb(t) - 'resumen' - 'ttb_en')::text) h from juegos t) x),
    'actividad', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from actividad t) x),
    'biblioteca', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5((to_jsonb(t) - 'actualizado_en')::text) h from biblioteca t) x),
    'psn_igdb', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from psn_igdb t) x),
    'juegos_alias', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from juegos_alias t) x),
    'fusiones_rechazadas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from fusiones_rechazadas t) x),
    'sagas_usuario', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from sagas_usuario t) x),
    'estado_servicios', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5((to_jsonb(t) - 'actualizado_en')::text) h from estado_servicios t) x),
    'cuentas_plataforma', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from cuentas_plataforma t) x),
    'horas_extra', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from horas_extra t) x),
    'avisos', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from avisos t) x),
    'colecciones', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from colecciones t) x),
    'colecciones_juegos', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from colecciones_juegos t) x),
    'valoraciones_coleccion', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from valoraciones_coleccion t) x),
    'sagas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from sagas t) x),
    'sagas_juegos', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from sagas_juegos t) x),
    'columnas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from columnas t) x),
    -- Entradas: sin el texto (no se descarga con la lista y puede ser muy largo).
    'entradas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5((to_jsonb(t) - 'cuerpo')::text) h from entradas t) x),
    'lecturas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from lecturas t) x),
    'horas_ajustes', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from horas_ajustes t) x),
    'horas_estimadas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from horas_estimadas t) x),
    'celebraciones_vistas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from celebraciones_vistas t) x),
    'reacciones', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from reacciones t) x),
    'comentarios', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from comentarios t) x)
  );
$$;
revoke all on function public.huellas() from public;
grant execute on function public.huellas() to anon, authenticated, service_role;
