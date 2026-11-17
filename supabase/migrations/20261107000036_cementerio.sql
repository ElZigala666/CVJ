-- =============================================================================
-- CVJ · El cementerio: vidas, muertes y reanimaciones
--
--  · vidas: el historial de cada persona, un evento por fila: alta, expulsion,
--    reanimacion_pedida, reanimacion (ha vuelto), veto, exorcismo (expulsión permanente)
--    y exorcismo_levantado. Con fecha, quién lo hizo (autor_id; null = el sistema) y, en
--    expulsiones y exorcismos, la "causa de la muerte" (texto corto del admin). Se puede
--    morir y volver varias veces: todas las vidas quedan aquí. Solo se escribe desde estas
--    funciones (la app solo lee).
--  · reanimaciones: los intentos. Cualquiera activo puede pedir reanimar a un expulsado
--    (no exorcizado): 12 horas de cuenta atrás. Uno en curso por difunto; la misma persona
--    no repite con el mismo difunto hasta pasados 7 días. Si el admin no veta, vuelve solo
--    (tarea cvj-reanimar cada 5 minutos, sin depender de que alguien abra la app) con su
--    mismo código.
--  · velas: una por persona y lápida; se puede apagar.
--  · usuarios.exorcizado: nadie puede reanimarlo hasta que el admin lo levante.
--  · Las acciones del admin (expulsar, exorcizar, levantar, readmitir, vetar, permitir ya)
--    van por la función "admin" → admin_vida() con el rol de servicio.
--  · Las altas nuevas apuntan su evento solas (trigger). Lo de antes: un alta por persona
--    con su fecha de creación y, si ya estaba fuera, una expulsión (fechas a mano luego).
-- =============================================================================

alter table public.usuarios add column if not exists exorcizado boolean not null default false;

create table if not exists public.reanimaciones (
  id            uuid primary key default gen_random_uuid(),
  difunto_id    uuid not null references public.usuarios(id) on delete cascade,
  autor_id      uuid not null references public.usuarios(id) on delete cascade,
  empieza_en    timestamptz not null default now(),
  termina_en    timestamptz not null,
  estado        text not null default 'en_curso' check (estado in ('en_curso', 'completada', 'vetada', 'anulada')),
  resuelta_en   timestamptz,
  resuelta_por  uuid references public.usuarios(id) on delete set null
);
create unique index if not exists reanimaciones_una_en_curso on public.reanimaciones (difunto_id) where estado = 'en_curso';
create index if not exists reanimaciones_autor_idx on public.reanimaciones (autor_id, difunto_id, empieza_en desc);

create table if not exists public.vidas (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references public.usuarios(id) on delete cascade,
  tipo            text not null check (tipo in ('alta', 'expulsion', 'reanimacion_pedida', 'reanimacion', 'veto', 'exorcismo', 'exorcismo_levantado')),
  fecha           timestamptz not null default now(),
  autor_id        uuid references public.usuarios(id) on delete set null,
  causa           text check (causa is null or char_length(causa) <= 140),
  reanimacion_id  uuid references public.reanimaciones(id) on delete set null
);
create index if not exists vidas_usuario_idx on public.vidas (usuario_id, fecha);

create table if not exists public.velas (
  difunto_id    uuid not null references public.usuarios(id) on delete cascade,
  usuario_id    uuid not null references public.usuarios(id) on delete cascade,
  encendida_en  timestamptz not null default now(),
  primary key (difunto_id, usuario_id)
);

-- Lectura para todos; vidas y reanimaciones solo se escriben desde las funciones.
do $$
declare t text;
begin
  foreach t in array array['vidas', 'reanimaciones', 'velas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "publico_leer" on public.%I', t);
    execute format('drop policy if exists "publico_crear" on public.%I', t);
    execute format('drop policy if exists "publico_borrar" on public.%I', t);
    execute format('create policy "publico_leer" on public.%I for select to anon, authenticated using (true)', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  create policy "publico_crear" on public.velas for insert to anon, authenticated with check (true);
  create policy "publico_borrar" on public.velas for delete to anon, authenticated using (true);
  grant insert, delete on public.velas to anon, authenticated;
end $$;

-- Lo de antes: un alta por persona y, si ya estaba fuera, su expulsión.
insert into public.vidas (usuario_id, tipo, fecha)
select u.id, 'alta', u.creado_en from public.usuarios u
where not exists (select 1 from public.vidas v where v.usuario_id = u.id and v.tipo = 'alta');
insert into public.vidas (usuario_id, tipo, fecha, autor_id)
select u.id, 'expulsion', now(), (select a.id from public.usuarios a where a.es_admin order by a.creado_en limit 1)
from public.usuarios u
where u.activo = false and not exists (select 1 from public.vidas v where v.usuario_id = u.id and v.tipo in ('expulsion', 'exorcismo'));

-- Altas nuevas: su evento, solo.
create or replace function public.vidas_alta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.vidas (usuario_id, tipo, fecha) values (new.id, 'alta', coalesce(new.creado_en, now()));
  return new;
end $$;
drop trigger if exists usuarios_vidas_alta on public.usuarios;
create trigger usuarios_vidas_alta after insert on public.usuarios for each row execute function public.vidas_alta();

-- -----------------------------------------------------------------------------
-- Reanimar: lo pide cualquiera activo (desde la app).
-- -----------------------------------------------------------------------------
create or replace function public.pedir_reanimacion(p_autor uuid, p_difunto uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.usuarios;
  d public.usuarios;
  r public.reanimaciones;
  ultima timestamptz;
begin
  select * into a from public.usuarios where id = p_autor;
  if a.id is null or a.activo = false then
    return jsonb_build_object('ok', false, 'codigo', 'autor', 'error', 'Los muertos no reaniman a nadie.');
  end if;
  select * into d from public.usuarios where id = p_difunto for update;
  if d.id is null then return jsonb_build_object('ok', false, 'codigo', 'parametros', 'error', 'Esa tumba está vacía.'); end if;
  if d.activo then return jsonb_build_object('ok', false, 'codigo', 'vivo', 'error', 'Ya está vivo. Déjalo respirar.'); end if;
  if d.exorcizado then return jsonb_build_object('ok', false, 'codigo', 'exorcizado', 'error', 'Está exorcizado. Ni lo intentes.'); end if;
  if exists (select 1 from public.reanimaciones where difunto_id = p_difunto and estado = 'en_curso') then
    return jsonb_build_object('ok', false, 'codigo', 'en_curso', 'error', 'Alguien ya lo está intentando.');
  end if;
  select max(empieza_en) into ultima from public.reanimaciones where autor_id = p_autor and difunto_id = p_difunto;
  if ultima is not null and ultima > now() - interval '7 days' then
    return jsonb_build_object('ok', false, 'codigo', 'espera', 'error', 'Ya lo intentaste hace poco. Podrás volver a probar el '
      || to_char((ultima + interval '7 days') at time zone 'Europe/Madrid', 'DD/MM "a las" HH24:MI') || '.',
      'desde', ultima + interval '7 days');
  end if;
  insert into public.reanimaciones (difunto_id, autor_id, termina_en)
  values (p_difunto, p_autor, now() + interval '12 hours') returning * into r;
  insert into public.vidas (usuario_id, tipo, fecha, autor_id, reanimacion_id) values (p_difunto, 'reanimacion_pedida', r.empieza_en, p_autor, r.id);
  return jsonb_build_object('ok', true, 'reanimacion', to_jsonb(r));
end $$;
revoke all on function public.pedir_reanimacion(uuid, uuid) from public;
grant execute on function public.pedir_reanimacion(uuid, uuid) to anon, authenticated, service_role;

-- Vuelve a la vida (por la cuenta atrás o porque el admin lo permite ya).
create or replace function public.revivir(p_reanimacion uuid, p_por uuid, p_fecha timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare r public.reanimaciones;
begin
  update public.reanimaciones set estado = 'completada', resuelta_en = p_fecha, resuelta_por = p_por
  where id = p_reanimacion and estado = 'en_curso' returning * into r;
  if r.id is null then return; end if;
  update public.usuarios set activo = true where id = r.difunto_id;
  insert into public.vidas (usuario_id, tipo, fecha, autor_id, reanimacion_id) values (r.difunto_id, 'reanimacion', p_fecha, r.autor_id, r.id);
end $$;
revoke all on function public.revivir(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.revivir(uuid, uuid, timestamptz) to service_role;

-- Tarea programada: las cuentas atrás terminadas sin veto.
create or replace function public.completar_reanimaciones()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in select id, termina_en from public.reanimaciones where estado = 'en_curso' and termina_en <= now() order by termina_en loop
    perform public.revivir(r.id, null, r.termina_en);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.completar_reanimaciones() from public, anon, authenticated;
grant execute on function public.completar_reanimaciones() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cvj-reanimar') then
    perform cron.unschedule('cvj-reanimar');
  end if;
end $$;
select cron.schedule('cvj-reanimar', '*/5 * * * *', 'select public.completar_reanimaciones()');

-- -----------------------------------------------------------------------------
-- Lo que hace el admin (lo llama la función "admin", que ya ha comprobado quién es).
--   expulsar · exorcizar · levantar · readmitir · vetar · permitir
-- -----------------------------------------------------------------------------
create or replace function public.admin_vida(p_admin uuid, p_accion text, p_usuario uuid, p_causa text default null, p_reanimacion uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u public.usuarios;
  r public.reanimaciones;
  v_causa text := nullif(left(btrim(regexp_replace(coalesce(p_causa, ''), '\s+', ' ', 'g')), 140), '');
begin
  if p_accion in ('vetar', 'permitir') then
    select * into r from public.reanimaciones where id = p_reanimacion for update;
    if r.id is null or r.estado <> 'en_curso' then
      return jsonb_build_object('ok', false, 'codigo', 'resuelta', 'error', 'Ese intento ya no está en marcha.');
    end if;
    if p_accion = 'permitir' then
      perform public.revivir(r.id, p_admin, now());
    else
      update public.reanimaciones set estado = 'vetada', resuelta_en = now(), resuelta_por = p_admin where id = r.id;
      insert into public.vidas (usuario_id, tipo, autor_id, reanimacion_id) values (r.difunto_id, 'veto', p_admin, r.id);
    end if;
    return jsonb_build_object('ok', true);
  end if;

  select * into u from public.usuarios where id = p_usuario for update;
  if u.id is null then return jsonb_build_object('ok', false, 'codigo', 'parametros', 'error', 'Ese usuario no existe.'); end if;
  if u.id = p_admin and p_accion in ('expulsar', 'exorcizar') then
    return jsonb_build_object('ok', false, 'codigo', 'parametros', 'error', 'No puedes expulsarte a ti mismo.');
  end if;

  if p_accion = 'expulsar' then
    if not u.activo then return jsonb_build_object('ok', false, 'codigo', 'muerto', 'error', 'Ya está muerto.'); end if;
    update public.usuarios set activo = false where id = u.id;
    insert into public.vidas (usuario_id, tipo, autor_id, causa) values (u.id, 'expulsion', p_admin, v_causa);
  elsif p_accion = 'exorcizar' then
    if u.exorcizado then return jsonb_build_object('ok', false, 'codigo', 'exorcizado', 'error', 'Ya está exorcizado.'); end if;
    update public.usuarios set activo = false, exorcizado = true where id = u.id;
    update public.reanimaciones set estado = 'anulada', resuelta_en = now(), resuelta_por = p_admin where difunto_id = u.id and estado = 'en_curso';
    insert into public.vidas (usuario_id, tipo, autor_id, causa) values (u.id, 'exorcismo', p_admin, v_causa);
  elsif p_accion = 'levantar' then
    if not u.exorcizado then return jsonb_build_object('ok', false, 'codigo', 'parametros', 'error', 'No está exorcizado.'); end if;
    update public.usuarios set exorcizado = false where id = u.id;
    insert into public.vidas (usuario_id, tipo, autor_id) values (u.id, 'exorcismo_levantado', p_admin);
  elsif p_accion = 'readmitir' then
    if u.activo then return jsonb_build_object('ok', true); end if;
    if u.exorcizado then return jsonb_build_object('ok', false, 'codigo', 'exorcizado', 'error', 'Primero hay que levantar el exorcismo.'); end if;
    select * into r from public.reanimaciones where difunto_id = u.id and estado = 'en_curso' for update;
    if r.id is not null then
      perform public.revivir(r.id, p_admin, now());
    else
      update public.usuarios set activo = true where id = u.id;
      insert into public.vidas (usuario_id, tipo, autor_id) values (u.id, 'reanimacion', p_admin);
    end if;
  else
    return jsonb_build_object('ok', false, 'codigo', 'parametros', 'error', 'Acción desconocida.');
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_vida(uuid, text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_vida(uuid, text, uuid, text, uuid) to service_role;

-- huellas(): con vidas, reanimaciones y velas.
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
    'velas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from velas t) x)
  );
$$;
revoke all on function public.huellas() from public;
grant execute on function public.huellas() to anon, authenticated, service_role;
