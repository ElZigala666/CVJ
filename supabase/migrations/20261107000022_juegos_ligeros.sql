-- =============================================================================
-- CVJ · Juegos que solo están por las sagas, en versión ligera
--
-- Al generar las sagas se guardaron ~900 fichas completas de juegos que nadie del
-- grupo tiene, y la app las descarga en cada refresco (~1 MB). Esos juegos se
-- quedan sin resumen ni relaciones (su ficha completa se pide al abrirlos), como
-- los guarda ya la función igdb.
-- =============================================================================
update public.juegos j
   set resumen = null, relaciones = '{}'::jsonb
 where (j.resumen is not null or j.relaciones <> '{}'::jsonb)
   and not exists (select 1 from public.valoraciones v where v.juego_id = j.igdb_id)
   and not exists (select 1 from public.biblioteca b where b.juego_id = j.igdb_id)
   and not exists (select 1 from public.psn_igdb e where e.igdb_id = j.igdb_id)
   and not exists (select 1 from public.juegos_alias a where a.alias_id = j.igdb_id or a.principal_id = j.igdb_id)
   and not exists (select 1 from public.colecciones_juegos c where c.juego_id = j.igdb_id)
   and not exists (select 1 from public.horas_extra h where h.juego_id = j.igdb_id)
   and not exists (select 1 from public.actividad x where x.juego_id = j.igdb_id);
