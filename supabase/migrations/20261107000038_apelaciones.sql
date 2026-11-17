-- =============================================================================
-- CVJ · Apelaciones: un expulsado pide volver y decide el admin ("El Dictador").
--
--  · apelaciones: lo público (quién, cuándo, en qué quedó y si estaba exorcizado). De aquí
--    salen "Ha apelado N veces" en la lápida y las filas de la actividad.
--  · apelaciones_textos: lo privado (el texto de la apelación y la respuesta del rechazo).
--    Sin acceso para anon: lo lee el admin por la función "admin" y el propio difunto, con su
--    código, por estado_difunto().
--  · Se apela solo con el código válido (su hash), comprobado aquí: nadie apela por otro.
--    Una pendiente a la vez; tras un rechazo, 7 días de espera. Exorcizados: también pueden,
--    pero una cada 30 días.
--  · Aceptar: vuelve con su mismo código (vidas: "reanimacion" con apelacion_id; si estaba
--    exorcizado, antes "exorcismo_levantado", también con apelacion_id) y se anula cualquier
--    reanimación en curso.
-- =============================================================================

create table if not exists public.apelaciones (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.usuarios(id) on delete cascade,
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada')),
  exorcizado    boolean not null default false,
  creado_en     timestamptz not null default now(),
  resuelta_en   timestamptz,
  resuelta_por  uuid references public.usuarios(id) on delete set null
);
create unique index if not exists apelaciones_una_pendiente on public.apelaciones (usuario_id) where estado = 'pendiente';
create index if not exists apelaciones_usuario_idx on public.apelaciones (usuario_id, creado_en desc);

create table if not exists public.apelaciones_textos (
  apelacion_id  uuid primary key references public.apelaciones(id) on delete cascade,
  texto         text not null check (char_length(btrim(texto)) between 1 and 500),
  respuesta     text check (respuesta is null or char_length(respuesta) <= 300)
);

alter table public.vidas add column if not exists apelacion_id uuid references public.apelaciones(id) on delete set null;

do $$
begin
  alter table public.apelaciones enable row level security;
  drop policy if exists "publico_leer" on public.apelaciones;
  create policy "publico_leer" on public.apelaciones for select to anon, authenticated using (true);
  grant select on public.apelaciones to anon, authenticated;
  grant all on public.apelaciones to service_role;
  -- Lo privado: sin políticas ni permisos para anon (solo el rol de servicio y las funciones).
  alter table public.apelaciones_textos enable row level security;
  revoke all on public.apelaciones_textos from anon, authenticated;
  grant all on public.apelaciones_textos to service_role;
end $$;

-- -----------------------------------------------------------------------------
-- Lo que ve el difunto en su pantalla. Con su hash: todo (incluida la respuesta del último
-- rechazo); solo con su id (sesión de un móvil sin código): lo público de su lápida.
-- -----------------------------------------------------------------------------
create or replace function public.estado_difunto(p_hash text default null, p_usuario uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u public.usuarios;
  muerte public.vidas;
  nacio timestamptz;
  pend public.apelaciones;
  ult public.apelaciones;
  ult_resp text;
  ultima_ap timestamptz;
  desde timestamptz;
  con_codigo boolean := p_hash is not null;
begin
  if con_codigo then
    select * into u from public.usuarios where codigo_hash = lower(p_hash);
  else
    select * into u from public.usuarios where id = p_usuario;
  end if;
  if u.id is null then return jsonb_build_object('ok', false, 'codigo', 'codigo', 'error', 'Ese código no existe.'); end if;
  if u.activo then return jsonb_build_object('ok', true, 'vivo', true, 'usuario_id', u.id); end if;

  select * into muerte from public.vidas where usuario_id = u.id and tipo in ('expulsion', 'exorcismo') order by fecha desc, (tipo = 'exorcismo') desc limit 1;
  select max(fecha) into nacio from public.vidas where usuario_id = u.id and tipo in ('alta', 'reanimacion') and fecha <= coalesce(muerte.fecha, now());
  select * into pend from public.apelaciones where usuario_id = u.id and estado = 'pendiente';
  select * into ult from public.apelaciones where usuario_id = u.id and estado = 'rechazada' order by resuelta_en desc limit 1;
  if con_codigo and ult.id is not null then select respuesta into ult_resp from public.apelaciones_textos where apelacion_id = ult.id; end if;
  select max(creado_en) into ultima_ap from public.apelaciones where usuario_id = u.id and exorcizado;
  -- Hasta cuándo espera: 7 días tras un rechazo; exorcizado, 30 desde la última apelación hecha exorcizado.
  if pend.id is null then
    if u.exorcizado and ultima_ap is not null and ultima_ap > now() - interval '30 days' then desde := ultima_ap + interval '30 days'; end if;
    if ult.id is not null and ult.resuelta_en > now() - interval '7 days' then desde := greatest(coalesce(desde, '-infinity'), ult.resuelta_en + interval '7 days'); end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'vivo', false, 'con_codigo', con_codigo,
    'usuario', jsonb_build_object('id', u.id, 'nombre', u.nombre, 'inicial', u.inicial, 'color', u.color, 'acento', u.acento, 'foto_url', u.foto_url),
    'exorcizado', u.exorcizado,
    'muerte', case when muerte.id is null then null else jsonb_build_object('fecha', muerte.fecha, 'causa', muerte.causa, 'tipo', muerte.tipo) end,
    'nacio', nacio,
    'apelaciones', (select count(*) from public.apelaciones where usuario_id = u.id),
    'pendiente', case when pend.id is null then null else pend.creado_en end,
    'rechazo', case when ult.id is null then null else jsonb_build_object('fecha', ult.resuelta_en, 'respuesta', ult_resp) end,
    'puede_desde', desde
  );
end $$;
revoke all on function public.estado_difunto(text, uuid) from public;
grant execute on function public.estado_difunto(text, uuid) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Apelar (el difunto, con su código).
-- -----------------------------------------------------------------------------
create or replace function public.apelar(p_hash text, p_texto text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u public.usuarios;
  a public.apelaciones;
  v_texto text := left(btrim(coalesce(p_texto, '')), 500);
  ultima_ap timestamptz;
  rechazo timestamptz;
begin
  if coalesce(p_hash, '') !~ '^[0-9a-fA-F]{64}$' then
    return jsonb_build_object('ok', false, 'codigo', 'codigo', 'error', 'Ese código no existe.');
  end if;
  select * into u from public.usuarios where codigo_hash = lower(p_hash) for update;
  if u.id is null then return jsonb_build_object('ok', false, 'codigo', 'codigo', 'error', 'Ese código no existe.'); end if;
  if u.activo then return jsonb_build_object('ok', false, 'codigo', 'vivo', 'error', 'Estás vivo. No tientes a la suerte.'); end if;
  if v_texto = '' then return jsonb_build_object('ok', false, 'codigo', 'texto', 'error', 'Explica por qué quieres volver.'); end if;
  if exists (select 1 from public.apelaciones where usuario_id = u.id and estado = 'pendiente') then
    return jsonb_build_object('ok', false, 'codigo', 'pendiente', 'error', 'Ya tienes una apelación esperando. El Dictador no tiene prisa.');
  end if;
  select max(creado_en) into ultima_ap from public.apelaciones where usuario_id = u.id and exorcizado;
  if u.exorcizado and ultima_ap is not null and ultima_ap > now() - interval '30 days' then
    return jsonb_build_object('ok', false, 'codigo', 'espera', 'error', 'Exorcizado: solo una apelación cada 30 días. La próxima, el '
      || to_char((ultima_ap + interval '30 days') at time zone 'Europe/Madrid', 'DD/MM') || '.', 'desde', ultima_ap + interval '30 days');
  end if;
  select max(resuelta_en) into rechazo from public.apelaciones where usuario_id = u.id and estado = 'rechazada';
  if rechazo is not null and rechazo > now() - interval '7 days' then
    return jsonb_build_object('ok', false, 'codigo', 'espera', 'error', 'Te rechazaron hace nada. Podrás volver a apelar el '
      || to_char((rechazo + interval '7 days') at time zone 'Europe/Madrid', 'DD/MM "a las" HH24:MI') || '.', 'desde', rechazo + interval '7 days');
  end if;
  insert into public.apelaciones (usuario_id, exorcizado) values (u.id, u.exorcizado) returning * into a;
  insert into public.apelaciones_textos (apelacion_id, texto) values (a.id, v_texto);
  return jsonb_build_object('ok', true, 'apelacion', to_jsonb(a));
end $$;
revoke all on function public.apelar(text, text) from public;
grant execute on function public.apelar(text, text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Lo que decide el admin (lo llama la función "admin", que ya ha comprobado quién es).
--   aceptar · rechazar (respuesta opcional, la verá él al intentar entrar)
-- -----------------------------------------------------------------------------
create or replace function public.admin_apelacion(p_admin uuid, p_accion text, p_apelacion uuid, p_respuesta text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.apelaciones;
  u public.usuarios;
  v_resp text := nullif(left(btrim(coalesce(p_respuesta, '')), 300), '');
begin
  select * into a from public.apelaciones where id = p_apelacion for update;
  if a.id is null then return jsonb_build_object('ok', false, 'codigo', 'parametros', 'error', 'Esa apelación no existe.'); end if;
  if a.estado <> 'pendiente' then return jsonb_build_object('ok', false, 'codigo', 'decidida', 'error', 'Esa apelación ya está decidida.'); end if;
  select * into u from public.usuarios where id = a.usuario_id for update;

  if p_accion = 'rechazar' then
    update public.apelaciones set estado = 'rechazada', resuelta_en = now(), resuelta_por = p_admin where id = a.id;
    update public.apelaciones_textos set respuesta = v_resp where apelacion_id = a.id;
  elsif p_accion = 'aceptar' then
    update public.apelaciones set estado = 'aceptada', resuelta_en = now(), resuelta_por = p_admin where id = a.id;
    if not u.activo then
      if u.exorcizado then
        insert into public.vidas (usuario_id, tipo, autor_id, apelacion_id) values (u.id, 'exorcismo_levantado', p_admin, a.id);
      end if;
      update public.reanimaciones set estado = 'anulada', resuelta_en = now(), resuelta_por = p_admin where difunto_id = u.id and estado = 'en_curso';
      update public.usuarios set activo = true, exorcizado = false where id = u.id;
      insert into public.vidas (usuario_id, tipo, autor_id, apelacion_id) values (u.id, 'reanimacion', p_admin, a.id);
    end if;
  else
    return jsonb_build_object('ok', false, 'codigo', 'parametros', 'error', 'Acción desconocida.');
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_apelacion(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_apelacion(uuid, text, uuid, text) to service_role;

-- Si vuelve por otro camino (reanimación o readmitir), su apelación pendiente se cierra sola.
create or replace function public.apelaciones_al_volver()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.activo and not old.activo then
    update public.apelaciones set estado = 'aceptada', resuelta_en = now()
    where usuario_id = new.id and estado = 'pendiente';
  end if;
  return new;
end $$;
drop trigger if exists usuarios_apelaciones_al_volver on public.usuarios;
create trigger usuarios_apelaciones_al_volver after update of activo on public.usuarios
  for each row execute function public.apelaciones_al_volver();

-- huellas(): con apelaciones (lo público).
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
    'propuestas_votos', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from propuestas_votos t) x),
    'apelaciones', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from apelaciones t) x)
  );
$$;
revoke all on function public.huellas() from public;
grant execute on function public.huellas() to anon, authenticated, service_role;
