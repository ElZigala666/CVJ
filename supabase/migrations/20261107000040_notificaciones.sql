-- =============================================================================
-- CVJ · Notificaciones: un solo sistema para todos los avisos, generados en el servidor
-- cuando ocurre cada cosa (no calculados en cada móvil), con el leído guardado en la cuenta.
--
--  · notificaciones: una fila por persona y aviso. tipo, categoria (mi = sobre mí, grupo),
--    clave (para agrupar: mientras no se lea, lo repetido se suma a la misma fila con sus
--    actores y n), datos (ids para pintarlo en la app), destino (el hash al que lleva),
--    prioridad (orden del resumen al entrar), leida, en_resumen (ya salió en "Mientras no
--    estabas").
--  · usuarios.avisos_resumen: {tipo: false} = ese tipo no sale en el resumen al entrar
--    (en el centro de avisos sale siempre todo).
--  · Se generan con notificar() / notificar_todos() desde disparadores en reacciones,
--    comentarios, lecturas, entradas, insignias, insignias_grupo, vidas, propuestas,
--    propuestas_votos, apelaciones, actividad y eventos; lo que depende del reloj (votación
--    que cierra, reanimación a punto de acabar), con la tarea cvj-avisos cada 15 minutos.
-- =============================================================================

create table if not exists public.notificaciones (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references public.usuarios(id) on delete cascade,
  tipo            text not null,
  categoria       text not null default 'grupo' check (categoria in ('mi', 'grupo')),
  clave           text not null,
  actores         uuid[] not null default '{}',
  n               integer not null default 1,
  datos           jsonb not null default '{}',
  destino         text,
  prioridad       smallint not null default 50,
  leida           boolean not null default false,
  en_resumen      boolean not null default false,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists notificaciones_usuario_idx on public.notificaciones (usuario_id, actualizado_en desc);
create index if not exists notificaciones_clave_idx on public.notificaciones (usuario_id, clave);

alter table public.usuarios add column if not exists avisos_resumen jsonb not null default '{}';

do $$
begin
  alter table public.notificaciones enable row level security;
  drop policy if exists "publico_leer" on public.notificaciones;
  drop policy if exists "publico_editar" on public.notificaciones;
  create policy "publico_leer" on public.notificaciones for select to anon, authenticated using (true);
  -- Desde la app solo se marca leída / vista en el resumen (se crean en el servidor).
  create policy "publico_editar" on public.notificaciones for update to anon, authenticated using (true) with check (true);
  grant select, update on public.notificaciones to anon, authenticated;
  grant all on public.notificaciones to service_role;
end $$;

-- -----------------------------------------------------------------------------
-- Crear (o sumar a la que ya hay sin leer con la misma clave).
-- -----------------------------------------------------------------------------
create or replace function public.notificar(
  p_usuario uuid, p_tipo text, p_categoria text, p_clave text, p_actor uuid,
  p_datos jsonb, p_destino text, p_prioridad integer, p_una_vez boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_usuario is null or p_usuario = p_actor then return; end if;
  if not exists (select 1 from usuarios where id = p_usuario and activo) then return; end if;
  if p_una_vez and exists (select 1 from notificaciones where usuario_id = p_usuario and clave = p_clave) then return; end if;
  update notificaciones set
    actores = case when p_actor is null or p_actor = any(actores) then actores else array_append(actores, p_actor) end,
    n = n + 1,
    datos = datos || coalesce(p_datos, '{}'),
    actualizado_en = now(),
    en_resumen = false
  where usuario_id = p_usuario and clave = p_clave and not leida;
  if found then return; end if;
  insert into notificaciones (usuario_id, tipo, categoria, clave, actores, datos, destino, prioridad)
  values (p_usuario, p_tipo, p_categoria, p_clave, case when p_actor is null then '{}' else array[p_actor] end,
          coalesce(p_datos, '{}'), p_destino, p_prioridad);
end $$;
revoke all on function public.notificar(uuid, text, text, text, uuid, jsonb, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.notificar(uuid, text, text, text, uuid, jsonb, text, integer, boolean) to service_role;

create or replace function public.notificar_todos(
  p_tipo text, p_clave text, p_actor uuid, p_datos jsonb, p_destino text, p_prioridad integer,
  p_una_vez boolean default false, p_solo_admin boolean default false, p_menos uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare u record;
begin
  for u in select id from usuarios where activo and (not p_solo_admin or es_admin) and id is distinct from p_menos loop
    perform notificar(u.id, p_tipo, 'grupo', p_clave, p_actor, p_datos, p_destino, p_prioridad, p_una_vez);
  end loop;
end $$;
revoke all on function public.notificar_todos(text, text, uuid, jsonb, text, integer, boolean, boolean, uuid) from public, anon, authenticated;
grant execute on function public.notificar_todos(text, text, uuid, jsonb, text, integer, boolean, boolean, uuid) to service_role;

-- Dueño y destino de una reseña o entrada (para reacciones y respuestas).
create or replace function public.objetivo_social(p_objetivo text, p_id uuid, out dueno uuid, out destino text, out datos jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_objetivo = 'valoracion' then
    select v.usuario_id, '#juego/' || v.juego_id, jsonb_build_object('juego_id', v.juego_id)
      into dueno, destino, datos from valoraciones v where v.id = p_id;
  elsif p_objetivo = 'valoracion_coleccion' then
    select v.usuario_id, '#coleccion/' || v.coleccion_id, jsonb_build_object('coleccion_id', v.coleccion_id)
      into dueno, destino, datos from valoraciones_coleccion v where v.id = p_id;
  elsif p_objetivo = 'entrada' then
    select e.usuario_id, '#entrada/' || e.id, jsonb_build_object('entrada_id', e.id)
      into dueno, destino, datos from entradas e where e.id = p_id;
  end if;
  datos := coalesce(datos, '{}') || jsonb_build_object('objetivo', p_objetivo, 'objetivo_id', p_id,
    'destacar', format('[data-social="%s:%s"]', p_objetivo, p_id));
end $$;

-- -----------------------------------------------------------------------------
-- Sobre mí: reacciones, respuestas, lecturas e insignias
-- -----------------------------------------------------------------------------
create or replace function public.aviso_reaccion() returns trigger language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select * into o from objetivo_social(new.objetivo, new.objetivo_id);
  perform notificar(o.dueno, 'reaccion', 'mi', 'reaccion:' || new.objetivo || ':' || new.objetivo_id, new.usuario_id,
    o.datos || jsonb_build_object('ultima', new.tipo), o.destino, 60);
  return new;
end $$;
drop trigger if exists avisos_reacciones on public.reacciones;
create trigger avisos_reacciones after insert on public.reacciones for each row execute function public.aviso_reaccion();

create or replace function public.aviso_comentario() returns trigger language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select * into o from objetivo_social(new.objetivo, new.objetivo_id);
  perform notificar(o.dueno, 'respuesta', 'mi', 'respuesta:' || new.objetivo || ':' || new.objetivo_id, new.usuario_id,
    o.datos || jsonb_build_object('comentario_id', new.id, 'texto', left(new.texto, 140)), o.destino, 70);
  return new;
end $$;
drop trigger if exists avisos_comentarios on public.comentarios;
create trigger avisos_comentarios after insert on public.comentarios for each row execute function public.aviso_comentario();

create or replace function public.aviso_lectura() returns trigger language plpgsql security definer set search_path = public as $$
declare e record;
begin
  select id, usuario_id, titulo into e from entradas where id = new.entrada_id;
  perform notificar(e.usuario_id, 'lectura', 'mi', 'lectura:' || e.id, new.usuario_id,
    jsonb_build_object('entrada_id', e.id), '#entrada/' || e.id, 30);
  return new;
end $$;
drop trigger if exists avisos_lecturas on public.lecturas;
create trigger avisos_lecturas after insert on public.lecturas for each row execute function public.aviso_lectura();

create or replace function public.aviso_insignia() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.inicial then return new; end if;
  if tg_op = 'INSERT' or new.nivel > old.nivel then
    perform notificar(new.usuario_id, 'insignia', 'mi', 'insignia:' || new.insignia || ':' || new.nivel, null,
      jsonb_build_object('insignia', new.insignia, 'nivel', new.nivel, 'sube', tg_op = 'UPDATE'), '#perfil', 75, true);
  end if;
  return new;
end $$;
drop trigger if exists avisos_insignias on public.insignias;
create trigger avisos_insignias after insert or update of nivel on public.insignias for each row execute function public.aviso_insignia();

create or replace function public.aviso_insignia_grupo() returns trigger language plpgsql security definer set search_path = public as $$
declare
  k text := 'insignia:' || new.insignia || ':' || extract(epoch from new.desde)::bigint;
  nuevos uuid[] := array_remove(array[new.usuario_id, new.otro_id], null);
  viejos uuid[] := case when tg_op = 'UPDATE' then array_remove(array[old.usuario_id, old.otro_id], null) else '{}' end;
  x uuid;
begin
  if new.inicial then return new; end if;
  if tg_op = 'UPDATE' and new.usuario_id is not distinct from old.usuario_id and new.otro_id is not distinct from old.otro_id then return new; end if;
  foreach x in array nuevos loop
    if not x = any(viejos) then
      perform notificar(x, 'insignia', 'mi', k, null, jsonb_build_object('insignia', new.insignia, 'nivel', 1, 'grupo', true,
        'quitada', case when tg_op = 'UPDATE' then old.usuario_id end,
        'pareja', case when new.usuario_id = x then new.otro_id else new.usuario_id end), '#perfil', 75, true);
    end if;
  end loop;
  foreach x in array viejos loop
    if not x = any(nuevos) then
      perform notificar(x, 'insignia_perdida', 'mi', k || ':pierde', new.usuario_id,
        jsonb_build_object('insignia', new.insignia, 'quien', new.usuario_id, 'quien2', new.otro_id), '#perfil', 72, true);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists avisos_insignias_grupo on public.insignias_grupo;
create trigger avisos_insignias_grupo after insert or update on public.insignias_grupo for each row execute function public.aviso_insignia_grupo();

-- -----------------------------------------------------------------------------
-- Del grupo
-- -----------------------------------------------------------------------------
create or replace function public.aviso_entrada() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'publicada' and (tg_op = 'INSERT' or old.estado is distinct from 'publicada') then
    perform notificar_todos('entrada', 'entrada:' || new.id, new.usuario_id, jsonb_build_object('entrada_id', new.id),
      '#entrada/' || new.id, 50, true);
  end if;
  return new;
end $$;
drop trigger if exists avisos_entradas on public.entradas;
create trigger avisos_entradas after insert or update of estado on public.entradas for each row execute function public.aviso_entrada();

create or replace function public.aviso_vida() returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb := jsonb_build_object('sujeto', new.usuario_id, 'causa', new.causa, 'vida_id', new.id, 'destacar', '#lapida-' || new.usuario_id);
begin
  if new.tipo in ('expulsion', 'exorcismo') then
    perform notificar_todos('muerte', 'muerte:' || new.id, new.autor_id, d || jsonb_build_object('exorcismo', new.tipo = 'exorcismo'), '#cementerio', 65, true, false, new.usuario_id);
  elsif new.tipo = 'reanimacion_pedida' then
    perform notificar_todos('reanimacion', 'reanimacion:' || coalesce(new.reanimacion_id::text, new.id::text), new.autor_id,
      d || jsonb_build_object('reanimacion_id', new.reanimacion_id), '#cementerio', 62, true, false, new.usuario_id);
  elsif new.tipo = 'reanimacion' then
    perform notificar_todos('vuelta', 'vuelta:' || new.id, new.autor_id,
      jsonb_build_object('sujeto', new.usuario_id, 'apelacion', new.apelacion_id is not null), '#perfil/' || new.usuario_id, 62, true, false, new.usuario_id);
  end if;
  return new;
end $$;
drop trigger if exists avisos_vidas on public.vidas;
create trigger avisos_vidas after insert on public.vidas for each row execute function public.aviso_vida();

create or replace function public.aviso_propuesta() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notificar_todos('propuesta', 'propuesta:' || new.id, new.autor_id,
    jsonb_build_object('propuesta_id', new.id, 'nombre', new.nombre), '#propuestas/' || new.id, 80, true);
  return new;
end $$;
drop trigger if exists avisos_propuestas on public.propuestas;
create trigger avisos_propuestas after insert on public.propuestas for each row execute function public.aviso_propuesta();

-- Al votar: la mía ya no está pendiente (se da por leída). Admin: si tiene mucho apoyo.
create or replace function public.aviso_voto_propuesta() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; favor int; contra int; activos int;
begin
  update notificaciones set leida = true where usuario_id = new.usuario_id and clave = 'propuesta:' || new.propuesta_id;
  select * into p from propuestas where id = new.propuesta_id;
  if p.estado <> 'abierta' then return new; end if;
  select count(*) filter (where voto = 'favor'), count(*) filter (where voto = 'contra') into favor, contra from propuestas_votos where propuesta_id = p.id;
  select count(*) into activos from usuarios where activo;
  if favor - contra >= greatest(3, ceil(activos / 2.0)::int) then
    perform notificar_todos('propuesta_apoyo', 'propuesta_apoyo:' || p.id, null,
      jsonb_build_object('propuesta_id', p.id, 'nombre', p.nombre, 'favor', favor, 'contra', contra), '#propuestas/' || p.id, 85, true, true);
  end if;
  return new;
end $$;
drop trigger if exists avisos_propuestas_votos on public.propuestas_votos;
create trigger avisos_propuestas_votos after insert or update on public.propuestas_votos for each row execute function public.aviso_voto_propuesta();

create or replace function public.aviso_apelacion() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notificar_todos('apelacion', 'apelacion:' || new.id, new.usuario_id,
    jsonb_build_object('sujeto', new.usuario_id, 'apelacion_id', new.id, 'exorcizado', new.exorcizado, 'destacar', '#lapida-' || new.usuario_id),
    '#cementerio', 90, true, true);
  return new;
end $$;
drop trigger if exists avisos_apelaciones on public.apelaciones;
create trigger avisos_apelaciones after insert on public.apelaciones for each row execute function public.aviso_apelacion();

-- Alguien completa un juego: a todos si se celebra; si no, a quien también lo ha jugado.
create or replace function public.aviso_completo() returns trigger language plpgsql security definer set search_path = public as $$
declare
  canon bigint := coalesce((select principal_id from juegos_alias where alias_id = new.juego_id), new.juego_id);
  u record;
  jugado boolean;
  vid uuid;
begin
  if new.tipo <> 'completo' then return new; end if;
  select id into vid from valoraciones where usuario_id = new.usuario_id and juego_id = new.juego_id limit 1;
  for u in select id from usuarios where activo and id <> new.usuario_id loop
    jugado := exists (select 1 from valoraciones v where v.usuario_id = u.id and v.estado <> 'pendiente'
      and coalesce((select principal_id from juegos_alias where alias_id = v.juego_id), v.juego_id) = canon);
    if new.celebrar or jugado then
      perform notificar(u.id, 'completo', 'grupo', 'completo:' || new.usuario_id || ':' || canon, new.usuario_id,
        jsonb_build_object('juego_id', new.juego_id, 'coleccion_id', new.coleccion_id, 'tambien', jugado, 'vuelta', new.vuelta,
          'destacar', case when vid is null then null else format('[data-social="valoracion:%s"]', vid) end),
        case when new.coleccion_id is not null then '#coleccion/' || new.coleccion_id else '#juego/' || new.juego_id end,
        case when jugado then 55 else 45 end, true);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists avisos_actividad on public.actividad;
create trigger avisos_actividad after insert on public.actividad for each row execute function public.aviso_completo();

create or replace function public.aviso_evento() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.resultados_en is not null and old.resultados_en is null then
    perform notificar_todos('evento_resultados', 'evento_resultados:' || new.id, null,
      jsonb_build_object('evento_id', new.id), '#evento/' || new.id, 70, true);
  end if;
  return new;
end $$;
drop trigger if exists avisos_eventos on public.eventos;
create trigger avisos_eventos after update of resultados_en on public.eventos for each row execute function public.aviso_evento();

-- -----------------------------------------------------------------------------
-- Lo que depende del reloj (cada 15 minutos) y limpieza de lo leído antiguo.
-- -----------------------------------------------------------------------------
create or replace function public.avisos_programados()
returns integer language plpgsql security definer set search_path = public as $$
declare x record; n integer := 0;
begin
  -- La votación oficial de un evento cierra en menos de 24 h.
  for x in select id from eventos where votacion_fin > now() and votacion_fin <= now() + interval '24 hours' and resultados_en is null loop
    perform notificar_todos('evento_cierra', 'evento_cierra:' || x.id, null, jsonb_build_object('evento_id', x.id), '#evento/' || x.id, 72, true);
    n := n + 1;
  end loop;
  -- Admin: reanimaciones a punto de completarse (menos de 2 h).
  for x in select r.id, r.difunto_id, r.autor_id, r.termina_en from reanimaciones r where r.estado = 'en_curso' and r.termina_en <= now() + interval '2 hours' loop
    perform notificar_todos('reanimacion_pronto', 'reanimacion_pronto:' || x.id, x.autor_id,
      jsonb_build_object('sujeto', x.difunto_id, 'reanimacion_id', x.id, 'termina_en', x.termina_en, 'destacar', '#lapida-' || x.difunto_id),
      '#cementerio', 88, true, true);
    n := n + 1;
  end loop;
  delete from notificaciones where leida and actualizado_en < now() - interval '90 days';
  return n;
end $$;
revoke all on function public.avisos_programados() from public, anon, authenticated;
grant execute on function public.avisos_programados() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cvj-avisos') then perform cron.unschedule('cvj-avisos'); end if;
end $$;
select cron.schedule('cvj-avisos', '*/15 * * * *', 'select public.avisos_programados()');

-- Marcar leídas (todas o unas) y vistas en el resumen, de una vez.
create or replace function public.marcar_avisos(p_usuario uuid, p_ids uuid[] default null, p_resumen boolean default false)
returns void language sql security definer set search_path = public as $$
  update notificaciones set
    leida = case when p_resumen then leida else true end,
    en_resumen = true
  where usuario_id = p_usuario and (p_ids is null or id = any(p_ids));
$$;
revoke all on function public.marcar_avisos(uuid, uuid[], boolean) from public;
grant execute on function public.marcar_avisos(uuid, uuid[], boolean) to anon, authenticated, service_role;

-- huellas(): con las notificaciones.
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
    'apelaciones', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from apelaciones t) x),
    'eventos', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from eventos t) x),
    'eventos_categorias', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from eventos_categorias t) x),
    'eventos_nominados', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from eventos_nominados t) x),
    'eventos_elecciones', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from eventos_elecciones t) x),
    'eventos_votado', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from eventos_votado t) x),
    'notificaciones', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from notificaciones t) x)
  );
$$;
revoke all on function public.huellas() from public;
grant execute on function public.huellas() to anon, authenticated, service_role;
