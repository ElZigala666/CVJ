-- =============================================================================
-- CVJ · "Sin final" y "Contar en mi tier list y rankings", separados
--
--  · juegos.es_online / sagas.es_online ("Sin final: online, competitivo...") ya
--    solo decide: fuera de "Jugando ahora", los 3 estados al valorar y la sección
--    "Juegos sin final" del perfil.
--  · cuenta_ranking (por valoración): si esa nota cuenta en la tier list, las
--    estadísticas de notas y los rankings de nota del grupo. Por defecto, sí; en un
--    juego sin final, no (cada uno lo cambia al valorar).
--  · Lo que ya había: las valoraciones de juegos sin final quedan sin contar (como
--    se comportaban hasta ahora) y el resto, contando.
-- =============================================================================

alter table public.valoraciones add column if not exists cuenta_ranking boolean not null default true;
alter table public.valoraciones_saga add column if not exists cuenta_ranking boolean not null default true;

-- Valoraciones de juegos sin final (también si están en una versión fusionada del juego).
update public.valoraciones v
   set cuenta_ranking = false
  from public.juegos j
 where j.igdb_id = coalesce((select a.principal_id from public.juegos_alias a where a.alias_id = v.juego_id), v.juego_id)
   and j.es_online is true;

update public.valoraciones_saga v
   set cuenta_ranking = false
  from public.sagas s
 where s.id = v.saga_id and s.es_online;
