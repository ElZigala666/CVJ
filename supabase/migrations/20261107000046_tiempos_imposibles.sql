-- =============================================================================
-- CVJ · Tiempos para terminar imposibles
--
-- IGDB tiene datos basura en algunos juegos ("Rocket League Sideswipe": 73 266 h de
-- historia) y el automático de horas estimadas los ponía tal cual: un usuario salía con
-- 84 000 h. Desde ahora la función igdb no guarda tiempos por encima de 300 h (historia),
-- 600 h (historia + extras) o 1500 h (completo), y la app tampoco los usa (ni en juegos
-- sin final). Aquí se limpian los que ya estaban y las estimaciones AUTOMÁTICAS que salían
-- de ellos (las elegidas a mano no se tocan).
-- =============================================================================

update public.juegos set ttb_historia = null where ttb_historia > 300;
update public.juegos set ttb_extras = null where ttb_extras > 600;
update public.juegos set ttb_completo = null where ttb_completo > 1500;

delete from public.horas_estimadas h
where h.auto
  and (
    (h.tipo = 'historia' and h.horas > 300)
    or (h.tipo = 'extras' and h.horas > 600)
    or (h.tipo = 'completo' and h.horas > 1500)
    or exists (select 1 from public.juegos j where j.igdb_id = h.juego_id and j.es_online)
  );
