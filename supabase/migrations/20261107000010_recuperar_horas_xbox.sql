-- =============================================================================
-- CVJ · Recuperar las horas de Xbox borradas por una sincronización
-- La función xbox mandaba "horas: null" en cada sincronización y pisaba las horas
-- ya guardadas; como horas_en seguía puesto, no se volvían a pedir. Se borra
-- horas_en de los juegos de Xbox sin horas para que se pidan otra vez (poco a poco,
-- dentro del límite de OpenXBL). No toca ninguna hora que exista.
-- =============================================================================
update public.biblioteca
   set horas_en = null
 where fuente = 'xbox'
   and horas is null
   and horas_en is not null;
