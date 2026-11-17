-- =============================================================================
-- CVJ · Insignias: ajustes
--
--  · Fuera "Llanero solitario" y "La apisonadora" (se conseguían farmeando): se borran
--    sin avisos ni rastro en la actividad.
--  · Insignias de grupo de dos ("Almas gemelas", "Némesis"): la pareja va en usuario_id
--    y otro_id; la de antes, en anterior_id y otro_anterior_id.
--  · Cazatrofeos y Multiplataforma cambian de regla: la app las recalcula y, si alguien
--    baja o la pierde, lo cambia sin avisar.
-- =============================================================================

alter table public.insignias_grupo add column if not exists otro_id uuid references public.usuarios(id) on delete set null;
alter table public.insignias_grupo add column if not exists otro_anterior_id uuid references public.usuarios(id) on delete set null;

delete from public.insignias_grupo where insignia in ('llanero-solitario', 'la-apisonadora');
delete from public.insignias where insignia in ('llanero-solitario', 'la-apisonadora');

-- "Crítico implacable" y "Ojos de cordero" pasan a contar solo los juegos que también ha
-- puntuado alguien más: se reparten de nuevo, sin avisos de "te la han quitado".
delete from public.insignias_grupo where insignia in ('critico-implacable', 'ojos-de-cordero');
