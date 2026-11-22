# Bubble Shop — Manual de uso

Landing estática (HTML5/CSS3/JS vanilla) publicada en **https://bubbleshop-ec.com**
(GitHub Pages + Cloudflare). Este documento explica cómo editar el catálogo, usar
la automatización desde Telegram y publicar cambios.

---

## 1. Estructura del repo

| Ruta | Qué es |
|---|---|
| `index.html` | Toda la landing (HTML + CSS + JS inline) |
| `assets/css/`, `assets/js/` | Estilos y scripts de las burbujas |
| `assets/js/productos-data.js` | **Generado** — el array `const productos = [...]` que carga la web |
| `data/catalogo.json` | **Fuente de verdad** — edita aquí, nunca el JS a mano |
| `data/pending.json` | Productos detectados en Telegram esperando `apply` |
| `data/scrape_state.json` | Hasta dónde leyó el canal (no editar) |
| `scripts/catalogo.py` | CLI de automatización (solo Python 3, sin dependencias) |
| `robots.txt`, `sitemap.xml`, `CNAME` | SEO/dominio de la publicación |

---

## 2. Comandos

```bash
cd ~/Desktop/Lavanderia/catalogo

python3 scripts/catalogo.py scrape     # leer el canal → pending.json
python3 scripts/catalogo.py status     # ver pendientes y catálogo actual
python3 scripts/catalogo.py apply      # integrar pendientes (interactivo)
python3 scripts/catalogo.py apply -y   # integrar sin preguntar (usa categoría sugerida)
python3 scripts/catalogo.py build      # regenerar productos-data.js desde catalogo.json
python3 scripts/catalogo.py run        # (opcional) modo bot — solo si el bot está en el chat
```

---

## 3. Flujo automático (productos nuevos del canal)

Fuente: canal público **t.me/DistribuidoraMonikVariety04** — se lee por la web
pública (`t.me/s/...`), **sin bot, sin token y sin permisos** (no es tu canal).

```bash
python3 scripts/catalogo.py scrape   # 1. trae solo los posts nuevos (~10 s)
python3 scripts/catalogo.py apply    # 2. revisas cada uno: categoría [sugerida] + ¿agregar?
# 3. abres index.html y verificas los productos
# 4. git add / commit / push  →  GitHub Pages los publica solo
```

Cómo agrupa los mensajes: el proveedor publica **varias fotos seguidas** y cierra
el producto con **la última imagen con texto** (`NOMBRE / COD / PRECIO $x.xx`).
El lector acumula fotos y cierra al llegar el texto. También entiende álbumes,
videos (usa su miniatura) y texto sin fotos.

**Estado actual (primera corrida ya hecha):** punto de partida fijado en el
post `130995`; hay **3 productos de prueba** esperando en `pending.json`
(Proyector $5.50, Condimentero $9.50, Cortina $3.25) — intégralos con `apply`.

### Configuración (`.env`, opcional, no se sube al repo)

Copia `.env.example` → `.env`:

```
TELEGRAM_CANAL=DistribuidoraMonikVariety04   # canal a leer
CATEGORIA_DEFAULT=hogar                       # solo para apply -y sin sugerencia
```

---

## 4. Editar el catálogo a mano

1. Abre **`data/catalogo.json`**
2. Añade o modifica un producto:

```json
{
  "id": 60,
  "categorias": ["hogar"],
  "nombre": "Cortina Luz de Hada",
  "emoji": "🪟",
  "precio": 3.25,
  "stock": true,
  "imagenes": ["cortina_1.jpeg", "cortina_2.jpeg"],
  "descripcion": "Texto completo del producto."
}
```

3. Regenera el JS: `python3 scripts/catalogo.py build`
4. Abre `index.html` para verlo

**Campos:** `id` único · `categorias` (una o varias de la lista inferior) ·
`precio` en USD · `imagenes` son **solo nombres** de ficheros dentro de
`assets/images/products/` (la primera es la portada; si no hay, se usa `emoji`) ·
`comentado: true` deja el producto fuera de la web sin borrarlo.

**Categorías válidas:** `hombre` · `mujer` · `ninos` · `bebes` · `mascotas` ·
`belleza` · `hogar` · `electrodomesticos` · `tecnologia` · `herramientas`

### Añadir imágenes sin Telegram

Copia el fichero a `assets/images/products/` y pon solo su nombre en `imagenes`.

---

## 5. Ver en local

Doble clic en **`index.html`** (funciona con `file://`, no hace falta servidor).
Busca productos con la lupa del catálogo.

---

## 6. Publicar

```bash
git add -A
git commit -m "Descripción del cambio"
git push origin main        # GitHub Pages redespliega en ~1-2 min
```

- **Dominio:** `bubbleshop-ec.com` (CNAME en la raíz + DNS en Cloudflare)
- **Seguridad:** Cloudflare Free (proxy, WAF, DDoS, HSTS, CSP, DNSSEC) —
  las cabeceras se configuran en el panel de Cloudflare, no en el repo
- `design-system/` y `docs/` están en `.gitignore`: **no se publican**

---

## 7. Problemas frecuentes

| Síntoma | Solución |
|---|---|
| `scrape` no encuentra mensajes | Comprueba tu conexión y que `t.me/s/DistribuidoraMonikVariety04` abre en el navegador; Telegram cambió su web → avísame |
| SSL: `CERTIFICATE_VERIFY_FAILED` | El script ya usa `certifi`/certificado del sistema automáticamente; si falla: `python3 -m pip install certifi` |
| Un producto no tiene precio | El texto del canal no traía `$`; edítalo a mano en `catalogo.json` y `build` |
| No aparece en la web tras `apply` | Mira que `categorias` tenga una clave válida de la lista de arriba |
| Imagen no carga | El nombre en `imagenes` debe coincidir exacto con el fichero en `assets/images/products/` |
| `apply` pregunta mucho | Usa `apply -y` (categoría sugerida o `CATEGORIA_DEFAULT`) |

---

## 8. Pendiente (fase 2)

Automatizar en **GitHub Actions**: cron horario que ejecute
`scrape` → `apply -y` → `build` → commit (sin tu Mac encendida).
Se prepara cuando el flujo manual esté validado.
