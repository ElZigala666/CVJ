# Servidor local para probar la app (prueba-local.html) sin cachés del navegador:
# cada archivo se pide siempre de nuevo, así que lo que se edita se ve al recargar.
# Uso: python herramientas/servidor-local.py [puerto]   (por defecto 8765, desde la raíz)
import http.server
import sys


class SinCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
http.server.ThreadingHTTPServer(('127.0.0.1', puerto), SinCache).serve_forever()
