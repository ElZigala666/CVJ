-- =============================================================================
-- CVJ · Avisos de lo que ya estaba abierto al estrenar las notificaciones (migración 040).
-- Lo que antes salía suelto en Inicio y ahora va en Avisos, para no perder ninguno:
--  · propuestas abiertas que cada uno aún no ha votado;
--  · apelaciones pendientes (al admin);
--  · reanimaciones en curso (a todos menos al difunto y a quien lo intenta).
-- Idempotente: notificar(..., una_vez) no repite claves.
-- =============================================================================
do $$
declare p record; u record; a record; r record;
begin
  for p in select * from propuestas where estado = 'abierta' loop
    for u in select id from usuarios where activo and id <> p.autor_id
      and not exists (select 1 from propuestas_votos v where v.propuesta_id = p.id and v.usuario_id = usuarios.id) loop
      perform notificar(u.id, 'propuesta', 'grupo', 'propuesta:' || p.id, p.autor_id,
        jsonb_build_object('propuesta_id', p.id, 'nombre', p.nombre), '#propuestas/' || p.id, 80, true);
    end loop;
  end loop;
  for a in select * from apelaciones where estado = 'pendiente' loop
    perform notificar_todos('apelacion', 'apelacion:' || a.id, a.usuario_id,
      jsonb_build_object('sujeto', a.usuario_id, 'apelacion_id', a.id, 'exorcizado', a.exorcizado, 'destacar', '#lapida-' || a.usuario_id),
      '#cementerio', 90, true, true);
  end loop;
  for r in select * from reanimaciones where estado = 'en_curso' loop
    perform notificar_todos('reanimacion', 'reanimacion:' || r.id, r.autor_id,
      jsonb_build_object('sujeto', r.difunto_id, 'reanimacion_id', r.id, 'destacar', '#lapida-' || r.difunto_id),
      '#cementerio', 62, true, false, r.difunto_id);
  end loop;
end $$;
