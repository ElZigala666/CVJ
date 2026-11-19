-- =============================================================================
-- CVJ · Reanimar y proponer con confirmación del interesado
--
--  · Reanimar o proponer ya no empieza nada: queda PENDIENTE hasta que el interesado acepta
--    en un enlace de un solo uso (enlaces, privada): 72 h para reanimar, 7 días para
--    propuestas. Si no responde, caduca (lo hace la tarea cvj-reanimar).
--  · Reanimaciones: pendiente → en_curso (aceptó con su código o desde su dispositivo: 12 h
--    con veto del admin, como antes) | sin_codigo (aceptó sin código: solo vuelve si el admin
--    lo aprueba) | caducada. Propuestas: esperando → abierta (ya se vota) | caducada.
--  · Antiengaño: no se acepta desde un dispositivo o IP que haya usado hace poco alguien
--    ACTIVO (accesos, privada: cada app con sesión manda latido() al abrirse; la IP se guarda
--    con hash). Tampoco desde un navegador con la sesión de alguien activo.
--  · "Reconocido": un dispositivo en el que esa persona entró con su código (accesos
--    verificado). Así, al expulsarlo, su móvil le sigue reconociendo sin código.
--  · El WhatsApp del Dictador (ajustes_privados) solo sale en las páginas de enlace.
--  · codigo_hash deja de poder leerse con la clave pública (se entra con entrar()), y
--    activo, es_admin, exorcizado y el código ya no se pueden cambiar desde fuera: si no,
--    confirmar no serviría de nada. OJO: una columna nueva en usuarios necesita su
--    "grant select (col)" (y "grant update (col)" si la app la cambia).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- usuarios: lo sensible, fuera del alcance de la clave pública
-- -----------------------------------------------------------------------------
do $$
declare leer text; editar text;
begin
  select string_agg(quote_ident(column_name), ', ') into leer from information_schema.columns
  where table_schema = 'public' and table_name = 'usuarios' and column_name <> 'codigo_hash';
  select string_agg(quote_ident(column_name), ', ') into editar from information_schema.columns
  where table_schema = 'public' and table_name = 'usuarios'
    and column_name not in ('id', 'codigo_hash', 'es_admin', 'activo', 'exorcizado', 'propuesta_id', 'creado_en');
  revoke select, insert, update, delete, truncate on public.usuarios from anon, authenticated;
  execute format('grant select (%s) on public.usuarios to anon, authenticated', leer);
  execute format('grant update (%s) on public.usuarios to anon, authenticated', editar);
  grant all on public.usuarios to service_role;
end $$;

-- Entrar con el código (su hash): lo que necesita la sesión.
create or replace function public.entrar(p_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u public.usuarios;
begin
  if coalesce(p_hash, '') !~ '^[0-9a-fA-F]{64}$' then return null; end if;
  select * into u from public.usuarios where codigo_hash = lower(p_hash);
  if u.id is null then return null; end if;
  return jsonb_build_object('id', u.id, 'nombre', u.nombre, 'inicial', u.inicial, 'color', u.color,
    'acento', u.acento, 'foto_url', u.foto_url, 'activo', u.activo);
end $$;
revoke all on function public.entrar(text) from public;
grant execute on function public.entrar(text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Tablas privadas
-- -----------------------------------------------------------------------------
create table if not exists public.ajustes_privados (
  clave           text primary key,
  valor           text,
  actualizado_en  timestamptz not null default now()
);

create table if not exists public.accesos (
  usuario_id   uuid not null references public.usuarios(id) on delete cascade,
  dispositivo  text not null check (dispositivo ~ '^[0-9A-Za-z-]{8,64}$'),
  ip           text not null,
  verificado   boolean not null default false,
  visto_en     timestamptz not null default now(),
  primary key (usuario_id, dispositivo, ip)
);
create index if not exists accesos_ip_idx on public.accesos (ip, visto_en);
create index if not exists accesos_dispositivo_idx on public.accesos (dispositivo, visto_en);

create table if not exists public.enlaces (
  token        text primary key,
  tipo         text not null check (tipo in ('reanimacion', 'propuesta')),
  objetivo_id  uuid not null,
  autor_id     uuid references public.usuarios(id) on delete cascade,
  creado_en    timestamptz not null default now(),
  caduca_en    timestamptz not null,
  usado_en     timestamptz,
  fallos       integer not null default 0
);
create unique index if not exists enlaces_objetivo_idx on public.enlaces (tipo, objetivo_id);

do $$
declare t text;
begin
  foreach t in array array['ajustes_privados', 'accesos', 'enlaces'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Estados nuevos
-- -----------------------------------------------------------------------------
alter table public.reanimaciones add column if not exists caduca_en timestamptz;
alter table public.reanimaciones add column if not exists respondida_en timestamptz;
alter table public.reanimaciones alter column termina_en drop not null;
alter table public.reanimaciones alter column estado set default 'pendiente';
alter table public.reanimaciones drop constraint if exists reanimaciones_estado_check;
alter table public.reanimaciones add constraint reanimaciones_estado_check
  check (estado in ('pendiente', 'en_curso', 'sin_codigo', 'completada', 'vetada', 'anulada', 'caducada'));
drop index if exists public.reanimaciones_una_en_curso;
create unique index if not exists reanimaciones_una_viva on public.reanimaciones (difunto_id)
  where estado in ('pendiente', 'en_curso', 'sin_codigo');

alter table public.propuestas add column if not exists caduca_en timestamptz;
alter table public.propuestas add column if not exists confirmada_en timestamptz;
alter table public.propuestas alter column estado set default 'esperando';
alter table public.propuestas drop constraint if exists propuestas_estado_check;
alter table public.propuestas add constraint propuestas_estado_check
  check (estado in ('esperando', 'abierta', 'aparcada', 'aceptada', 'rechazada', 'caducada'));

-- -----------------------------------------------------------------------------
-- IP de quien llama (con hash; en IPv6, su /64) y "¿es alguien activo?"
-- -----------------------------------------------------------------------------
create or replace function public.ip_actual()
returns text language plpgsql stable as $$
declare h jsonb; ip text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then h := null;
  end;
  ip := nullif(btrim(coalesce(h->>'cf-connecting-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1))), '');
  if ip is null then return null; end if;
  begin
    if family(ip::inet) = 6 then ip := host(network(set_masklen(ip::inet, 64))); end if;
  exception when others then null;
  end;
  return encode(sha256(convert_to('cvj:' || ip, 'UTF8')), 'hex');
end $$;

create or replace function public.por_otro(p_dispositivo text, p_sesion uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (p_sesion is not null and exists (select 1 from usuarios where id = p_sesion and activo))
    or exists (
      select 1 from accesos a join usuarios u on u.id = a.usuario_id
      where u.activo and (
        (public.ip_actual() is not null and a.ip = public.ip_actual() and a.visto_en > now() - interval '7 days')
        or (p_dispositivo is not null and a.dispositivo = p_dispositivo and a.visto_en > now() - interval '30 days')));
$$;
revoke all on function public.por_otro(text, uuid) from public, anon, authenticated;
grant execute on function public.por_otro(text, uuid) to service_role;

-- La app, al abrirse con sesión (y cada rato): este dispositivo y esta IP son de alguien.
-- Con su hash, el dispositivo queda "verificado" (le reconocerá aunque lo expulsen).
create or replace function public.latido(p_usuario uuid, p_dispositivo text, p_hash text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u public.usuarios; v_ip text := coalesce(public.ip_actual(), '-'); ok boolean;
begin
  if coalesce(p_dispositivo, '') !~ '^[0-9A-Za-z-]{8,64}$' then return jsonb_build_object('ok', false); end if;
  select * into u from public.usuarios where id = p_usuario;
  if u.id is null or not u.activo then return jsonb_build_object('ok', false); end if;
  ok := p_hash is not null and lower(p_hash) = u.codigo_hash;
  insert into public.accesos (usuario_id, dispositivo, ip, verificado) values (u.id, p_dispositivo, v_ip, ok)
  on conflict (usuario_id, dispositivo, ip) do update set visto_en = now(), verificado = accesos.verificado or excluded.verificado;
  if ok then update public.accesos set verificado = true where usuario_id = u.id and dispositivo = p_dispositivo and not verificado; end if;
  delete from public.accesos where visto_en < now() - interval '120 days';
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.latido(uuid, text, text) from public;
grant execute on function public.latido(uuid, text, text) to anon, authenticated, service_role;

-- Entrar sin código desde un dispositivo donde ya entró con él (al volver de la muerte).
create or replace function public.entrar_dispositivo(p_usuario uuid, p_dispositivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u public.usuarios;
begin
  select * into u from public.usuarios where id = p_usuario;
  if u.id is null or not u.activo then return null; end if;
  if not exists (select 1 from public.accesos where usuario_id = u.id and dispositivo = p_dispositivo and verificado) then return null; end if;
  return jsonb_build_object('id', u.id, 'nombre', u.nombre, 'inicial', u.inicial, 'color', u.color,
    'acento', u.acento, 'foto_url', u.foto_url, 'activo', u.activo);
end $$;
revoke all on function public.entrar_dispositivo(uuid, text) from public;
grant execute on function public.entrar_dispositivo(uuid, text) to anon, authenticated, service_role;

create or replace function public.reconocido(p_usuario uuid, p_dispositivo text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_dispositivo is not null and exists (select 1 from accesos where usuario_id = p_usuario and dispositivo = p_dispositivo and verificado);
$$;
revoke all on function public.reconocido(uuid, text) from public, anon, authenticated;
grant execute on function public.reconocido(uuid, text) to service_role;

create or replace function public.whatsapp_dictador()
returns text language sql stable security definer set search_path = public as $$
  select nullif(valor, '') from ajustes_privados where clave = 'whatsapp';
$$;
revoke all on function public.whatsapp_dictador() from public, anon, authenticated;
grant execute on function public.whatsapp_dictador() to service_role;

create or replace function public.nuevo_enlace(p_tipo text, p_objetivo uuid, p_autor uuid, p_caduca timestamptz)
returns text language plpgsql security definer set search_path = public as $$
declare t text := replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
begin
  delete from public.enlaces where tipo = p_tipo and objetivo_id = p_objetivo;
  insert into public.enlaces (token, tipo, objetivo_id, autor_id, caduca_en) values (t, p_tipo, p_objetivo, p_autor, p_caduca);
  return t;
end $$;
revoke all on function public.nuevo_enlace(text, uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.nuevo_enlace(text, uuid, uuid, timestamptz) to service_role;

-- El enlace otra vez (para compartirlo de nuevo): solo quien lo pidió (o el admin).
create or replace function public.enlace_de(p_tipo text, p_objetivo uuid, p_usuario uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.enlaces;
begin
  select * into e from public.enlaces where tipo = p_tipo and objetivo_id = p_objetivo;
  if e.token is null or e.usado_en is not null or e.caduca_en <= now() then return jsonb_build_object('ok', false); end if;
  if e.autor_id is distinct from p_usuario and not exists (select 1 from usuarios where id = p_usuario and es_admin and activo) then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'token', e.token, 'caduca_en', e.caduca_en);
end $$;
revoke all on function public.enlace_de(text, uuid, uuid) from public;
grant execute on function public.enlace_de(text, uuid, uuid) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Reanimar: ahora solo llama (pendiente, 72 h para responder)
-- -----------------------------------------------------------------------------
create or replace function public.pedir_reanimacion(p_autor uuid, p_difunto uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.usuarios;
  d public.usuarios;
  r public.reanimaciones;
  ultima timestamptz;
  t text;
begin
  select * into a from public.usuarios where id = p_autor;
  if a.id is null or a.activo = false then
    return jsonb_build_object('ok', false, 'codigo', 'autor', 'error', 'Los muertos no reaniman a nadie.');
  end if;
  select * into d from public.usuarios where id = p_difunto for update;
  if d.id is null then return jsonb_build_object('ok', false, 'codigo', 'parametros', 'error', 'Esa tumba está vacía.'); end if;
  if d.activo then return jsonb_build_object('ok', false, 'codigo', 'vivo', 'error', 'Ya está vivo. Déjalo respirar.'); end if;
  if d.exorcizado then return jsonb_build_object('ok', false, 'codigo', 'exorcizado', 'error', 'Está exorcizado. Ni lo intentes.'); end if;
  if exists (select 1 from public.reanimaciones where difunto_id = p_difunto and estado in ('pendiente', 'en_curso', 'sin_codigo')) then
    return jsonb_build_object('ok', false, 'codigo', 'en_curso', 'error', 'Alguien ya lo está intentando.');
  end if;
  select max(empieza_en) into ultima from public.reanimaciones where autor_id = p_autor and difunto_id = p_difunto;
  if ultima is not null and ultima > now() - interval '7 days' then
    return jsonb_build_object('ok', false, 'codigo', 'espera', 'error', 'Ya lo intentaste hace poco. Podrás volver a probar el '
      || to_char((ultima + interval '7 days') at time zone 'Europe/Madrid', 'DD/MM "a las" HH24:MI') || '.',
      'desde', ultima + interval '7 days');
  end if;
  insert into public.reanimaciones (difunto_id, autor_id, estado, caduca_en, termina_en)
  values (p_difunto, p_autor, 'pendiente', now() + interval '72 hours', null) returning * into r;
  t := public.nuevo_enlace('reanimacion', r.id, p_autor, r.caduca_en);
  insert into public.vidas (usuario_id, tipo, fecha, autor_id, reanimacion_id) values (p_difunto, 'reanimacion_pedida', r.empieza_en, p_autor, r.id);
  return jsonb_build_object('ok', true, 'reanimacion', to_jsonb(r), 'token', t);
end $$;

-- Vuelve a la vida (por la cuenta atrás o porque el admin lo permite ya / aprueba sin código).
create or replace function public.revivir(p_reanimacion uuid, p_por uuid, p_fecha timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare r public.reanimaciones;
begin
  update public.reanimaciones set estado = 'completada', resuelta_en = p_fecha, resuelta_por = p_por
  where id = p_reanimacion and estado in ('en_curso', 'sin_codigo') returning * into r;
  if r.id is null then return; end if;
  update public.usuarios set activo = true where id = r.difunto_id;
  insert into public.vidas (usuario_id, tipo, fecha, autor_id, reanimacion_id) values (r.difunto_id, 'reanimacion', p_fecha, r.autor_id, r.id);
end $$;

-- Tarea programada (cada 5 min): cuentas atrás terminadas y llamadas sin respuesta.
create or replace function public.completar_reanimaciones()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in select id, termina_en from public.reanimaciones where estado = 'en_curso' and termina_en <= now() order by termina_en loop
    perform public.revivir(r.id, null, r.termina_en);
    n := n + 1;
  end loop;
  update public.reanimaciones set estado = 'caducada', resuelta_en = caduca_en
  where estado = 'pendiente' and caduca_en <= now();
  update public.propuestas set estado = 'caducada', resuelta_en = caduca_en
  where estado = 'esperando' and caduca_en <= now();
  return n;
end $$;

-- -----------------------------------------------------------------------------
-- La página del enlace: qué es y si se puede aceptar desde aquí
-- -----------------------------------------------------------------------------
create or replace function public.ver_enlace(p_token text, p_dispositivo text default null, p_sesion uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e public.enlaces;
  r public.reanimaciones;
  p public.propuestas;
  d public.usuarios;
  a public.usuarios;
  est text;
begin
  select * into e from public.enlaces where token = p_token;
  if e.token is null then return jsonb_build_object('ok', false, 'codigo', 'no_existe', 'error', 'Este enlace no existe.'); end if;
  select * into a from public.usuarios where id = e.autor_id;
  if e.tipo = 'reanimacion' then
    select * into r from public.reanimaciones where id = e.objetivo_id;
    select * into d from public.usuarios where id = r.difunto_id;
    est := case
      when r.estado = 'pendiente' and r.caduca_en > now() then 'pendiente'
      when r.estado in ('pendiente', 'caducada') then 'caducado'
      when r.estado = 'en_curso' then 'respondido'
      else r.estado end;
    return jsonb_build_object('ok', true, 'tipo', 'reanimacion', 'estado', est,
      'persona', jsonb_build_object('id', d.id, 'nombre', d.nombre, 'inicial', d.inicial, 'color', d.color, 'foto_url', d.foto_url),
      'autor', jsonb_build_object('nombre', a.nombre, 'es_admin', coalesce(a.es_admin, false)),
      'caduca_en', r.caduca_en, 'termina_en', r.termina_en,
      'reconocido', public.reconocido(d.id, p_dispositivo),
      'bloqueado', public.por_otro(p_dispositivo, p_sesion),
      'sin_codigo_ok', e.fallos < 8,
      'whatsapp', public.whatsapp_dictador());
  end if;
  select * into p from public.propuestas where id = e.objetivo_id;
  est := case
    when p.estado = 'esperando' and p.caduca_en > now() then 'pendiente'
    when p.estado in ('esperando', 'caducada') then 'caducado'
    when p.estado in ('abierta', 'aparcada') then 'aceptado'
    when p.estado = 'aceptada' then 'dentro'
    else 'rechazado' end;
  return jsonb_build_object('ok', true, 'tipo', 'propuesta', 'estado', est,
    'persona', jsonb_build_object('nombre', p.nombre),
    'autor', jsonb_build_object('nombre', a.nombre, 'es_admin', coalesce(a.es_admin, false)),
    'caduca_en', p.caduca_en,
    'bloqueado', public.por_otro(p_dispositivo, p_sesion),
    'whatsapp', public.whatsapp_dictador());
end $$;
revoke all on function public.ver_enlace(text, text, uuid) from public;
grant execute on function public.ver_enlace(text, text, uuid) to anon, authenticated, service_role;

-- Aceptar. Reanimación: con su código (hash) o desde un dispositivo que le reconoce →
-- empieza la cuenta atrás; p_sin_codigo → espera a que el admin lo apruebe.
create or replace function public.aceptar_enlace(p_token text, p_dispositivo text default null, p_sesion uuid default null,
  p_hash text default null, p_sin_codigo boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e public.enlaces;
  r public.reanimaciones;
  p public.propuestas;
  d public.usuarios;
  ok_id boolean;
begin
  select * into e from public.enlaces where token = p_token for update;
  if e.token is null then return jsonb_build_object('ok', false, 'codigo', 'no_existe', 'error', 'Este enlace no existe.'); end if;
  if e.usado_en is not null then return jsonb_build_object('ok', false, 'codigo', 'usado', 'error', 'Este enlace ya se ha usado.'); end if;
  if e.caduca_en <= now() then return jsonb_build_object('ok', false, 'codigo', 'caducado', 'error', 'Este enlace ha caducado.'); end if;

  if e.tipo = 'reanimacion' then
    select * into r from public.reanimaciones where id = e.objetivo_id for update;
    if r.id is null or r.estado <> 'pendiente' then
      return jsonb_build_object('ok', false, 'codigo', 'resuelta', 'error', 'Esta llamada ya no está en marcha.');
    end if;
    select * into d from public.usuarios where id = r.difunto_id;
    if public.por_otro(p_dispositivo, p_sesion) then
      return jsonb_build_object('ok', false, 'codigo', 'por_otro', 'error', 'Desde aquí no puedes aceptar por otro.');
    end if;
    if coalesce(p_sin_codigo, false) then
      update public.reanimaciones set estado = 'sin_codigo', respondida_en = now() where id = r.id;
      update public.enlaces set usado_en = now() where token = e.token;
      return jsonb_build_object('ok', true, 'estado', 'sin_codigo', 'whatsapp', public.whatsapp_dictador());
    end if;
    ok_id := (p_hash is not null and lower(p_hash) = d.codigo_hash) or public.reconocido(d.id, p_dispositivo);
    if not ok_id then
      update public.enlaces set fallos = fallos + 1 where token = e.token;
      return jsonb_build_object('ok', false, 'codigo', 'codigo',
        'error', case when e.fallos + 1 >= 8 then 'Demasiados intentos. Usa «No tengo mi código».' else 'Ese no es tu código.' end);
    end if;
    if e.fallos >= 8 and not public.reconocido(d.id, p_dispositivo) then
      return jsonb_build_object('ok', false, 'codigo', 'codigo', 'error', 'Demasiados intentos. Usa «No tengo mi código».');
    end if;
    update public.reanimaciones set estado = 'en_curso', respondida_en = now(), termina_en = now() + interval '12 hours'
    where id = r.id returning * into r;
    update public.enlaces set usado_en = now() where token = e.token;
    -- Este dispositivo ya le reconoce (para entrar solo cuando vuelva).
    if p_dispositivo ~ '^[0-9A-Za-z-]{8,64}$' then
      insert into public.accesos (usuario_id, dispositivo, ip, verificado) values (d.id, p_dispositivo, coalesce(public.ip_actual(), '-'), true)
      on conflict (usuario_id, dispositivo, ip) do update set verificado = true, visto_en = now();
    end if;
    return jsonb_build_object('ok', true, 'estado', 'respondido', 'termina_en', r.termina_en);
  end if;

  select * into p from public.propuestas where id = e.objetivo_id for update;
  if p.id is null or p.estado <> 'esperando' then
    return jsonb_build_object('ok', false, 'codigo', 'resuelta', 'error', 'Esta propuesta ya no está esperando.');
  end if;
  if public.por_otro(p_dispositivo, p_sesion) then
    return jsonb_build_object('ok', false, 'codigo', 'por_otro', 'error', 'Desde aquí no puedes aceptar por otro.');
  end if;
  update public.propuestas set estado = 'abierta', confirmada_en = now() where id = p.id;
  update public.enlaces set usado_en = now() where token = e.token;
  return jsonb_build_object('ok', true, 'estado', 'aceptado', 'whatsapp', public.whatsapp_dictador());
end $$;
revoke all on function public.aceptar_enlace(text, text, uuid, text, boolean) from public;
grant execute on function public.aceptar_enlace(text, text, uuid, text, boolean) to anon, authenticated, service_role;

-- Lo mismo desde la pantalla del difunto (la app abierta en su móvil, sin el enlace).
create or replace function public.aceptar_llamada(p_usuario uuid, p_dispositivo text default null, p_sesion uuid default null,
  p_hash text default null, p_sin_codigo boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t text;
begin
  select e.token into t from public.reanimaciones r join public.enlaces e on e.tipo = 'reanimacion' and e.objetivo_id = r.id
  where r.difunto_id = p_usuario and r.estado = 'pendiente' limit 1;
  if t is null then return jsonb_build_object('ok', false, 'codigo', 'resuelta', 'error', 'Nadie te está llamando ahora mismo.'); end if;
  return public.aceptar_enlace(t, p_dispositivo, p_sesion, p_hash, p_sin_codigo);
end $$;
revoke all on function public.aceptar_llamada(uuid, text, uuid, text, boolean) from public;
grant execute on function public.aceptar_llamada(uuid, text, uuid, text, boolean) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Lo que ve el difunto: además, si le están llamando y si este dispositivo le reconoce.
-- -----------------------------------------------------------------------------
drop function if exists public.estado_difunto(text, uuid);
create or replace function public.estado_difunto(p_hash text default null, p_usuario uuid default null, p_dispositivo text default null)
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
  ll public.reanimaciones;
  la public.usuarios;
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
  if pend.id is null then
    if u.exorcizado and ultima_ap is not null and ultima_ap > now() - interval '30 days' then desde := ultima_ap + interval '30 days'; end if;
    if ult.id is not null and ult.resuelta_en > now() - interval '7 days' then desde := greatest(coalesce(desde, '-infinity'), ult.resuelta_en + interval '7 days'); end if;
  end if;
  select * into ll from public.reanimaciones where difunto_id = u.id and estado in ('pendiente', 'en_curso', 'sin_codigo') order by empieza_en desc limit 1;
  if ll.id is not null then select * into la from public.usuarios where id = ll.autor_id; end if;

  return jsonb_build_object(
    'ok', true, 'vivo', false, 'con_codigo', con_codigo,
    'usuario', jsonb_build_object('id', u.id, 'nombre', u.nombre, 'inicial', u.inicial, 'color', u.color, 'acento', u.acento, 'foto_url', u.foto_url),
    'exorcizado', u.exorcizado,
    'muerte', case when muerte.id is null then null else jsonb_build_object('fecha', muerte.fecha, 'causa', muerte.causa, 'tipo', muerte.tipo) end,
    'nacio', nacio,
    'apelaciones', (select count(*) from public.apelaciones where usuario_id = u.id),
    'pendiente', case when pend.id is null then null else pend.creado_en end,
    'rechazo', case when ult.id is null then null else jsonb_build_object('fecha', ult.resuelta_en, 'respuesta', ult_resp) end,
    'puede_desde', desde,
    'reconocido', con_codigo or public.reconocido(u.id, p_dispositivo),
    'llamada', case when ll.id is null then null else jsonb_build_object('estado', ll.estado, 'caduca_en', ll.caduca_en,
      'termina_en', ll.termina_en, 'autor', la.nombre, 'autor_admin', coalesce(la.es_admin, false)) end,
    'whatsapp', case when ll.id is null then null else public.whatsapp_dictador() end
  );
end $$;
revoke all on function public.estado_difunto(text, uuid, text) from public;
grant execute on function public.estado_difunto(text, uuid, text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Proponer: espera a que el candidato acepte (7 días)
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
  t text;
begin
  select * into a from public.usuarios where id = p_autor;
  if a.id is null or a.activo = false then
    return jsonb_build_object('ok', false, 'codigo', 'autor', 'error', 'Desde el cementerio no se proponen fichajes.');
  end if;
  if v_nombre = '' then return jsonb_build_object('ok', false, 'codigo', 'nombre', 'error', 'Escribe a quién propones.'); end if;
  if v_motivo = '' then return jsonb_build_object('ok', false, 'codigo', 'motivo', 'error', 'Di por qué debería entrar.'); end if;
  perform pg_advisory_xact_lock(hashtext('proponer:' || p_autor::text));
  if (select count(*) from public.propuestas where autor_id = p_autor and estado in ('esperando', 'abierta')) >= 2 then
    return jsonb_build_object('ok', false, 'codigo', 'limite', 'error', 'Ya tienes 2 propuestas abiertas. Espera a que se decidan.');
  end if;
  if exists (select 1 from public.propuestas where nombre_llano(nombre) = nombre_llano(v_nombre) and estado in ('esperando', 'abierta', 'aparcada')) then
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
  insert into public.propuestas (autor_id, nombre, de_que, motivo, plataformas, estado, caduca_en)
  values (p_autor, v_nombre, v_de_que, v_motivo, v_plat, 'esperando', now() + interval '7 days') returning * into p;
  insert into public.propuestas_votos (propuesta_id, usuario_id, voto, creado_en, actualizado_en)
  values (p.id, p_autor, 'favor', p.creado_en, p.creado_en);
  t := public.nuevo_enlace('propuesta', p.id, p_autor, p.caduca_en);
  return jsonb_build_object('ok', true, 'propuesta', to_jsonb(p), 'token', t);
end $$;

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
  if p.estado = 'esperando' then
    return jsonb_build_object('ok', false, 'codigo', 'esperando', 'error', 'Aún no ha aceptado. Paciencia.');
  end if;
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

-- El admin puede rechazar o aceptar (invitar) también una que aún espera; aparcar, no.
create or replace function public.admin_propuesta(p_admin uuid, p_accion text, p_propuesta uuid, p_motivo text default null, p_usuario uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p public.propuestas;
  v_motivo text := nullif(left(btrim(regexp_replace(coalesce(p_motivo, ''), '\s+', ' ', 'g')), 140), '');
begin
  select * into p from public.propuestas where id = p_propuesta for update;
  if p.id is null then return jsonb_build_object('ok', false, 'codigo', 'parametros', 'error', 'Esa propuesta no existe.'); end if;
  if p.estado not in ('esperando', 'abierta', 'aparcada') then
    return jsonb_build_object('ok', false, 'codigo', 'decidida', 'error', 'Esa propuesta ya está decidida.');
  end if;
  if p_accion = 'aparcar' then
    if p.estado = 'esperando' then return jsonb_build_object('ok', false, 'codigo', 'esperando', 'error', 'Aún no ha aceptado.'); end if;
    update public.propuestas set estado = 'aparcada', resuelta_en = now(), resuelta_por = p_admin where id = p.id;
  elsif p_accion = 'reabrir' then
    if p.estado = 'esperando' then return jsonb_build_object('ok', false, 'codigo', 'esperando', 'error', 'Aún no ha aceptado.'); end if;
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

-- Admin: vetar vale también para una llamada pendiente o sin código; permitir, para en
-- curso y sin código (aprobar al que no tiene código: la app le genera uno nuevo).
create or replace function public.admin_vida(p_admin uuid, p_accion text, p_usuario uuid, p_causa text default null, p_reanimacion uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u public.usuarios;
  r public.reanimaciones;
  v_causa text := nullif(left(btrim(regexp_replace(coalesce(p_causa, ''), '\s+', ' ', 'g')), 140), '');
begin
  if p_accion in ('vetar', 'permitir') then
    select * into r from public.reanimaciones where id = p_reanimacion for update;
    if r.id is null or r.estado not in ('pendiente', 'en_curso', 'sin_codigo') or (p_accion = 'permitir' and r.estado = 'pendiente') then
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
    update public.reanimaciones set estado = 'anulada', resuelta_en = now(), resuelta_por = p_admin
    where difunto_id = u.id and estado in ('pendiente', 'en_curso', 'sin_codigo');
    insert into public.vidas (usuario_id, tipo, autor_id, causa) values (u.id, 'exorcismo', p_admin, v_causa);
  elsif p_accion = 'levantar' then
    if not u.exorcizado then return jsonb_build_object('ok', false, 'codigo', 'parametros', 'error', 'No está exorcizado.'); end if;
    update public.usuarios set exorcizado = false where id = u.id;
    insert into public.vidas (usuario_id, tipo, autor_id) values (u.id, 'exorcismo_levantado', p_admin);
  elsif p_accion = 'readmitir' then
    if u.activo then return jsonb_build_object('ok', true); end if;
    if u.exorcizado then return jsonb_build_object('ok', false, 'codigo', 'exorcizado', 'error', 'Primero hay que levantar el exorcismo.'); end if;
    select * into r from public.reanimaciones where difunto_id = u.id and estado in ('en_curso', 'sin_codigo') for update;
    if r.id is not null then
      perform public.revivir(r.id, p_admin, now());
    else
      update public.reanimaciones set estado = 'anulada', resuelta_en = now(), resuelta_por = p_admin where difunto_id = u.id and estado = 'pendiente';
      update public.usuarios set activo = true where id = u.id;
      insert into public.vidas (usuario_id, tipo, autor_id) values (u.id, 'reanimacion', p_admin);
    end if;
  else
    return jsonb_build_object('ok', false, 'codigo', 'parametros', 'error', 'Acción desconocida.');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Al aceptar una apelación: también se anula una llamada pendiente o sin código.
create or replace function public.anular_llamadas_al_volver()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.activo and not old.activo then
    update public.reanimaciones set estado = 'anulada', resuelta_en = now()
    where difunto_id = new.id and estado in ('pendiente', 'sin_codigo');
  end if;
  return new;
end $$;
drop trigger if exists usuarios_anular_llamadas on public.usuarios;
create trigger usuarios_anular_llamadas after update of activo on public.usuarios
  for each row execute function public.anular_llamadas_al_volver();

-- -----------------------------------------------------------------------------
-- Avisos
-- -----------------------------------------------------------------------------
-- La propuesta llega a todos cuando el candidato acepta (no al crearla).
create or replace function public.aviso_propuesta() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'abierta' and (tg_op = 'INSERT' or old.estado = 'esperando') then
    perform notificar_todos('propuesta', 'propuesta:' || new.id, new.autor_id,
      jsonb_build_object('propuesta_id', new.id, 'nombre', new.nombre), '#propuestas/' || new.id, 80, true);
    if tg_op = 'UPDATE' then
      perform notificar(new.autor_id, 'propuesta_lista', 'mi', 'propuesta_lista:' || new.id, null,
        jsonb_build_object('propuesta_id', new.id, 'nombre', new.nombre), '#propuestas/' || new.id, 78, true);
    end if;
  elsif tg_op = 'UPDATE' and new.estado = 'caducada' and old.estado = 'esperando' then
    perform notificar(new.autor_id, 'propuesta_caducada', 'mi', 'propuesta_caducada:' || new.id, null,
      jsonb_build_object('propuesta_id', new.id, 'nombre', new.nombre), '#propuestas/' || new.id, 60, true);
  end if;
  return new;
end $$;
drop trigger if exists avisos_propuestas on public.propuestas;
create trigger avisos_propuestas after insert or update of estado on public.propuestas for each row execute function public.aviso_propuesta();

-- Reanimaciones: ha respondido (a todos), quiere volver sin código (admin), no respondió (autor).
create or replace function public.aviso_reanimacion() returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb := jsonb_build_object('sujeto', new.difunto_id, 'reanimacion_id', new.id, 'destacar', '#lapida-' || new.difunto_id);
begin
  if new.estado = old.estado then return new; end if;
  if new.estado = 'en_curso' and old.estado = 'pendiente' then
    perform notificar_todos('reanimacion_respondida', 'reanimacion_respondida:' || new.id, null,
      d || jsonb_build_object('termina_en', new.termina_en, 'autor', new.autor_id), '#cementerio', 64, true);
  elsif new.estado = 'sin_codigo' then
    perform notificar_todos('reanimacion_sin_codigo', 'reanimacion_sin_codigo:' || new.id, null, d, '#cementerio', 90, true, true);
  elsif new.estado = 'caducada' then
    perform notificar(new.autor_id, 'reanimacion_caducada', 'mi', 'reanimacion_caducada:' || new.id, null, d, '#cementerio', 55, true);
  end if;
  return new;
end $$;
drop trigger if exists avisos_reanimaciones on public.reanimaciones;
create trigger avisos_reanimaciones after update of estado on public.reanimaciones for each row execute function public.aviso_reanimacion();

-- huellas(): las tablas nuevas son privadas (no van).
