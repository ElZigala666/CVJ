-- =============================================================================
-- CVJ · Limpieza: columnas que ya no usa nadie
--
--  · usuarios.psn_* y usuarios.xbox_* (salvo xbox_incluir_pc, que es una
--    preferencia): eran un resumen de cuentas_plataforma; la app y las funciones
--    ya leen solo cuentas_plataforma.
--  · valoraciones.horas: las horas a mano están en horas_extra (migración 011).
--  · valoraciones.plataforma: ahora es la lista valoraciones.plataformas (016).
-- Antes de quitar nada se copia lo que alguna versión antigua de la app haya
-- podido escribir mientras tanto.
-- =============================================================================

update public.valoraciones
   set plataformas = array[plataforma]
 where plataformas is null and plataforma is not null and plataforma <> '';

alter table public.valoraciones drop column if exists horas;
alter table public.valoraciones drop column if exists plataforma;

alter table public.usuarios
  drop column if exists psn_online_id,
  drop column if exists psn_account_id,
  drop column if exists psn_sincronizado_en,
  drop column if exists psn_reconectar,
  drop column if exists xbox_xuid,
  drop column if exists xbox_gamertag,
  drop column if exists xbox_sincronizado_en,
  drop column if exists xbox_reconectar;
