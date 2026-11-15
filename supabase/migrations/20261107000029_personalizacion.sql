-- =============================================================================
-- CVJ · Personalización (por usuario, guardada en su cuenta)
--
--  · usuarios.apariencia: el fondo de la app que ha elegido.
--      { "fondo": "medianoche" }                         uno de la galería (js/apariencia.js)
--      { "fondo": "propia", "imagen": "https://…", "modo": "oscuro"|"claro",
--        "intensidad": 0-100, "base": "#101320" }        una imagen suya (en el bucket avatares)
--    null = sin fondo (el tema claro u oscuro de siempre).
--  · usuarios.perfil_datos: lo que cada uno pone en su perfil. Todo opcional.
--      { "bio": "…", "estado": "…", "plataforma": "PS5", "favorito": 1234,
--        "vitrina": [1, 2, 3], "banner": { "tipo": "color"|"juego"|"imagen", "valor": … } }
-- =============================================================================
alter table public.usuarios add column if not exists apariencia jsonb;
alter table public.usuarios add column if not exists perfil_datos jsonb;

-- Las imágenes de fondo y de cabecera van al bucket de las fotos de perfil, que admitía
-- 1 MB por archivo: un fondo a pantalla completa necesita algo más.
update storage.buckets set file_size_limit = 3145728 where id = 'avatares';
