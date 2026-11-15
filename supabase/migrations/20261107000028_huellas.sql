-- =============================================================================
-- CVJ · Huellas de las tablas (para no descargarlo todo cada vez)
--
-- La app refresca los datos al abrirse y cada minuto. Antes pedía TODAS las tablas
-- enteras (más de 400 KB cada vez). Ahora pide primero esta función: una huella (md5)
-- por tabla. Solo vuelve a pedir las tablas cuya huella ha cambiado.
--
-- Solo devuelve huellas, nunca datos. Va con los permisos del dueño para poder leer
-- todas las columnas, y solo de las tablas que la app ya puede leer.
-- Quedan fuera de la huella las columnas que cambian sin que cambie lo que se ve
-- (la fecha de la última sincronización de cada fila) y las que la app no pide.
-- =============================================================================
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
    'horas_estimadas', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(t::text) h from horas_estimadas t) x)
  );
$$;
revoke all on function public.huellas() from public;
grant execute on function public.huellas() to anon, authenticated, service_role;
