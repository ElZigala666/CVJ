-- =============================================================================
-- CVJ · Propuestas de nuevos miembros: nadie invita, se propone, el grupo vota y el
-- admin decide.
--
--  · propuestas: quién propone, a quién (nombre), de qué lo conoce, por qué debería entrar
--    y en qué plataformas juega. Estado: abierta → aceptada | rechazada | aparcada (en
--    espera; se puede volver a abrir). Como mucho 2 abiertas por persona. A alguien
--    rechazado no se le puede volver a proponer hasta pasados 30 días.
--  · propuestas_votos: uno por persona y propuesta (a favor / en contra, con comentario
--    corto opcional). Públicos. Se puede cambiar o quitar mientras no esté decidida.
--  · usuarios.propuesta_id: por qué propuesta entró (de ahí, quién lo propuso).
--  · Todo se escribe desde estas funciones (la app solo lee): proponer() y votar_propuesta()
--    las llama la app; admin_propuesta() la función "admin" (aparcar, reabrir, rechazar y,
--    al crear la persona, aceptar).
-- =============================================================================

create table if not exists public.propuestas (
  id              uuid primary key default gen_random_uuid(),
  autor_id        uuid not null references public.usuarios(id) on delete cascade,
  nombre          text not null check (char_length(btrim(nombre)) between 1 and 40),
  de_que          text check (de_que is null or char_length(de_que) <= 140),
  motivo          text not null check (char_length(btrim(motivo)) between 1 and 300),
  plataformas     text[] not null default '{}',
  estado          text not null default 'abierta' check (estado in ('abierta', 'aparcada', 'aceptada', 'rechazada')),
  creado_en       timestamptz not null default now(),
  resuelta_en     timestamptz,
  resuelta_por    uuid references public.usuarios(id) on delete set null,
  motivo_rechazo  text check (motivo_rechazo is null or char_length(motivo_rechazo) <= 140),
  usuario_id      uuid references public.usuarios(id) on delete set null
);
create index if not exists propuestas_autor_idx on public.propuestas (autor_id, estado);

create table if not exists public.propuestas_votos (
  propuesta_id    uuid not null references public.propuestas(id) on delete cascade,
  usuario_id      uuid not null references public.usuarios(id) on delete cascade,
  voto            text not null check (voto in ('favor', 'contra')),
  comentario      text check (comentario is null or char_length(comentario) <= 140),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  primary key (propuesta_id, usuario_id)
);

alter table public.usuarios add column if not exists propuesta_id uuid references public.propuestas(id) on delete set null;

-- Solo lectura desde la app.
do $$
declare t text;
begin
  foreach t in array array['propuestas', 'propuestas_votos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "publico_leer" on public.%I', t);
    execute format('create policy "publico_leer" on public.%I for select to anon, authenticated using (true)', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Para comparar nombres: sin mayúsculas, tildes ni espacios de más.
create or replace function public.nombre_llano(t text)
returns text language sql immutable as $$
  select lower(translate(regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g'), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
$$;

-- -----------------------------------------------------------------------------
-- Proponer (cualquiera activo). El que propone vota a favor solo.
-- -----------------------------------------------------------------------------
create or replace function public.proponer(p_autor uuid, p_nombre text, p_de_que text, p_motivo text, p_plataformas text[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.usuarios;
  p public.propuestas;
  v_nombre text := left(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')), 40);
  v_de_que text := nullif(left(btrim(regexp_replace(coalesce(p_de_que, ''), '\s+', ' ', 'g')), 140), '');
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 300);
  v_plat text[] := coalesce((select array_agg(distinct x) from unnest(coalesce(p_plataformas, '{}')) x
                             where x in ('playstation', 'xbox', 'pc', 'switch', 'movil')), '{}');
  rechazo timestamptz;
begin
  select * into a from public.usuarios where id = p_autor;
  if a.id is null or a.activo = false then
    return jsonb_build_object('ok', false, 'codigo', 'autor', 'error', 'Desde el cementerio no se proponen fichajes.');
  end if;
  if v_nombre = '' then return jsonb_build_object('ok', false, 'codigo', 'nombre', 'error', 'Escribe a quién propones.'); end if;
  if v_motivo = '' then return jsonb_build_object('ok', false, 'codigo', 'motivo', 'error', 'Di por qué debería entrar.'); end if;
  -- Bloqueo por persona: dos propuestas a la vez no.
  perform pg_advisory_xact_lock(hashtext('proponer:' || p_autor::text));
  if (select count(*) from public.propuestas where autor_id = p_autor and estado = 'abierta') >= 2 then
    return jsonb_build_object('ok', false, 'codigo', 'limite', 'error', 'Ya tienes 2 propuestas abiertas. Espera a que se decidan.');
  end if;
  if exists (select 1 from public.propuestas where nombre_llano(nombre) = nombre_llano(v_nombre) and estado in ('abierta', 'aparcada')) then
    return jsonb_build_object('ok', false, 'codigo', 'repetida', 'error', 'Ya hay una propuesta para ' || v_nombre || '.');
  end if;
  if exists (select 1 from public.usuarios where nombre_llano(nombre) = nombre_llano(v_nombre) and activo) then
    return jsonb_build_object('ok', false, 'codigo', 'dentro', 'error', 'Ya hay alguien en el grupo que se llama así.');
  end if;
  select max(resuelta_en) into rechazo from public.propuestas
  where nombre_llano(nombre) = nombre_llano(v_nombre) and estado = 'rechazada';
  if rechazo is not null and rechazo > now() - interval '30 days' then
    return jsonb_build_object('ok', false, 'codigo', 'casting', 'error', v_nombre || ' no pasó el casting hace nada. Se podrá volver a proponer el '
      || to_char((rechazo + interval '30 days') at time zone 'Europe/Madrid', 'DD/MM') || '.', 'desde', rechazo + interval '30 days');
  end if;
  insert into public.propuestas (autor_id, nombre, de_que, motivo, plataformas)
  values (p_autor, v_nombre, v_de_que, v_motivo, v_plat) returning * into p;
  insert into public.propuestas_votos (propuesta_id, usuario_id, voto, creado_en, actualizado_en)
  values (p.id, p_autor, 'favor', p.creado_en, p.creado_en);
  return jsonb_build_object('ok', true, 'propuesta', to_jsonb(p));
end $$;
revoke all on function public.proponer(uuid, text, text, text, text[]) from public;
grant execute on function public.proponer(uuid, text, text, text, text[]) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Votar (cualquiera activo) mientras no esté decidida. p_voto null = quitar el voto.
-- -----------------------------------------------------------------------------
create or replace function public.votar_propuesta(p_usuario uuid, p_propuesta uuid, p_voto text, p_comentario text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u public.usuarios;
  p public.propuestas;
  v_com text := nullif(left(btrim(regexp_replace(coalesce(p_comentario, ''), '\s+', ' ', 'g')), 140), '');
begin
  select * into u from public.usuarios where id = p_usuario;
  if u.id is null or u.activo = false then
    return jsonb_build_object('ok', false, 'codigo', 'autor', 'error', 'Los muertos no votan. Aquí no.');
  end if;
  select * into p from public.propuestas where id = p_propuesta;
  if p.id is null then return jsonb_build_object('ok', false, 'codigo', 'parametros', 'error', 'Esa propuesta no existe.'); end if;
  if p.estado not in ('abierta', 'aparcada') then
    return jsonb_build_object('ok', false, 'codigo', 'decidida', 'error', 'Ya está decidida. Tarde.');
  end if;
  if p_voto is null then
    delete from public.propuestas_votos where propuesta_id = p.id and usuario_id = p_usuario;
  elsif p_voto in ('favor', 'contra') then
    insert into public.propuestas_votos (propuesta_id, usuario_id, voto, comentario)
    values (p.id, p_usuario, p_voto, v_com)
    on conflict (propuesta_id, usuario_id) do update set voto = excluded.voto, comentario = excluded.comentario, actualizado_en = now();
  else
    return jsonb_build_object('ok', false, 'codigo', 'parametros', 'error', 'Voto desconocido.');
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.votar_propuesta(uuid, uuid, text, text) from public;
grant execute on function public.votar_propuesta(uuid, uuid, text, text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Lo que decide el admin (lo llama la función "admin", que ya ha comprobado quién es).
--   aparcar · reabrir · rechazar (motivo opcional) · aceptar (con la persona ya creada)
-- -----------------------------------------------------------------------------
create or replace function public.admin_propuesta(p_admin uuid, p_accion text, p_propuesta uuid, p_motivo text default null, p_usuario uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p public.propuestas;
  v_motivo text := nullif(left(btrim(regexp_replace(coalesce(p_motivo, ''), '\s+', ' ', 'g')), 140), '');
begin
  select * into p from public.propuestas where id = p_propuesta for update;
  if p.id is null then return jsonb_build_object('ok', false, 'codigo', 'parametros', 'error', 'Esa propuesta no existe.'); end if;
  if p.estado not in ('abierta', 'aparcada') then
    return jsonb_build_object('ok', false, 'codigo', 'decidida', 'error', 'Esa propuesta ya está decidida.');
  end if;
  if p_accion = 'aparcar' then
    update public.propuestas set estado = 'aparcada', resuelta_en = now(), resuelta_por = p_admin where id = p.id;
  elsif p_accion = 'reabrir' then
    update public.propuestas set estado = 'abierta', resuelta_en = null, resuelta_por = null where id = p.id;
  elsif p_accion = 'rechazar' then
    update public.propuestas set estado = 'rechazada', resuelta_en = now(), resuelta_por = p_admin, motivo_rechazo = v_motivo where id = p.id;
  elsif p_accion = 'aceptar' then
    if p_usuario is null or not exists (select 1 from public.usuarios where id = p_usuario) then
      return jsonb_build_object('ok', false, 'codigo', 'parametros', 'error', 'Falta la persona creada.');
    end if;
    update public.propuestas set estado = 'aceptada', resuelta_en = now(), resuelta_por = p_admin, usuario_id = p_usuario where id = p.id;
    update public.usuarios set propuesta_id = p.id where id = p_usuario;
  else
    return jsonb_build_object('ok', false, 'codigo', 'parametros', 'error', 'Acción desconocida.');
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_propuesta(uuid, text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_propuesta(uuid, text, uuid, text, uuid) to service_role;

-- huellas(): con propuestas y votos.
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
    'juegos', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5((to_jsonb(t) - 'resumen' - 'ttb_en' - 'arte_en' - 'artes' - 'artes_en')::text) h from juegos t) x),
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
    'comentarios', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from comentarios t) x),
    'insignias', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from insignias t) x),
    'insignias_grupo', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from insignias_grupo t) x),
    'vidas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from vidas t) x),
    'reanimaciones', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from reanimaciones t) x),
    'velas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from velas t) x),
    'propuestas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from propuestas t) x),
    'propuestas_votos', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from propuestas_votos t) x)
  );
$$;
revoke all on function public.huellas() from public;
grant execute on function public.huellas() to anon, authenticated, service_role;
