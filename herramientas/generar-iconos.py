"""Genera los iconos PNG de la app a partir del logo hexagonal (el mismo de js/icons.js).

Uso:  python herramientas/generar-iconos.py
Crea img/icon-192.png, img/icon-512.png, img/icon-maskable-512.png y img/apple-touch-icon.png.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ACENTO = (0x6D, 0x28, 0xD9, 255)
BLANCO = (255, 255, 255, 255)
TRANSPARENTE = (0, 0, 0, 0)

# Logo en su viewBox de 24×24: hexágono M12 1.8 21 7v10l-9 5.2L3 17V7z y chevron M8 13.5l4-4 4 4
HEXAGONO = [(12, 1.8), (21, 7), (21, 17), (12, 22.2), (3, 17), (3, 7)]
CHEVRON = [(8, 13.5), (12, 9.5), (16, 13.5)]
GROSOR = 2.4
SUPER = 4  # sobremuestreo para que los bordes salgan suaves


def logo(lado, escala_logo, fondo, color_hex, color_chevron):
    """lado: tamaño final; escala_logo: fracción del lado que ocupa el viewBox de 24."""
    L = lado * SUPER
    img = Image.new('RGBA', (L, L), fondo)
    d = ImageDraw.Draw(img)
    u = L * escala_logo / 24  # píxeles por unidad del viewBox
    ox = oy = (L - 24 * u) / 2
    p = lambda x, y: (ox + x * u, oy + y * u)
    d.polygon([p(x, y) for x, y in HEXAGONO], fill=color_hex)
    g = GROSOR * u
    pts = [p(x, y) for x, y in CHEVRON]
    d.line(pts, fill=color_chevron, width=round(g), joint='curve')
    r = g / 2
    for x, y in (pts[0], pts[-1]):  # extremos redondeados
        d.ellipse([x - r, y - r, x + r, y + r], fill=color_chevron)
    return img.resize((lado, lado), Image.LANCZOS)


def main():
    salida = Path(__file__).resolve().parent.parent / 'img'
    salida.mkdir(exist_ok=True)
    # "any": logo morado sobre transparente, casi a todo el lado
    logo(192, 0.98, TRANSPARENTE, ACENTO, BLANCO).save(salida / 'icon-192.png', optimize=True)
    logo(512, 0.98, TRANSPARENTE, ACENTO, BLANCO).save(salida / 'icon-512.png', optimize=True)
    # "maskable": fondo morado a sangre y logo blanco dentro de la zona segura (círculo del 80 %)
    logo(512, 0.62, ACENTO, BLANCO, ACENTO).save(salida / 'icon-maskable-512.png', optimize=True)
    # iPhone: sin transparencia (iOS la pinta de negro), fondo blanco
    logo(180, 0.78, BLANCO, ACENTO, BLANCO).convert('RGB').save(salida / 'apple-touch-icon.png', optimize=True)
    print('Iconos generados en', salida)


if __name__ == '__main__':
    main()
