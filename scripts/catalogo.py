#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bubble Shop — sincronizador de catálogo desde un canal/grupo de Telegram.

Subcomandos:
  scrape   Lector del CANAL PÚBLICO vía web (t.me/s/...) — sin bot, sin token,
           sin permisos. Agrupa fotos → cierra el producto cuando llega el
           mensaje con texto (NOMBRE/COD/PRECIO) → descarga imágenes → pending.
           Primera corrida importa los últimos 10 de prueba y fija el punto de
           partida; a partir de ahí solo entra lo nuevo.
  build    data/catalogo.json  ->  assets/js/productos-data.js
  run      (opcional) igual que scrape pero con un BOT vía Bot API — solo
           posible si el bot puede añadirse al chat (no en canales ajenos).
  apply    Integra los pendientes en el catálogo (interactivo; -y = automático).
  status   Muestra los pendientes.

Configuración (archivo .env en la raíz, NO se sube al repo):
  TELEGRAM_CANAL=DistribuidoraMonikVariety04   (canal público a leer)
  TELEGRAM_BOT_TOKEN=...                       (solo para `run`, opcional)
  CATEGORIA_DEFAULT=hogar                      (solo con apply -y)

Uso típico:
  python3 scripts/catalogo.py scrape
  python3 scripts/catalogo.py status
  python3 scripts/catalogo.py apply
"""
import json
import os
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request
from html import unescape

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOGO = os.path.join(RAIZ, 'data', 'catalogo.json')
PENDIENTES = os.path.join(RAIZ, 'data', 'pending.json')
ESTADO = os.path.join(RAIZ, 'data', 'sync_state.json')
ESTADO_SCRAPE = os.path.join(RAIZ, 'data', 'scrape_state.json')
SALIDA_JS = os.path.join(RAIZ, 'assets', 'js', 'productos-data.js')
IMAGENES = os.path.join(RAIZ, 'assets', 'images', 'products')
CANAL_DEFECTO = 'DistribuidoraMonikVariety04'
UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36')

CATEGORIAS_CLAVE = {
    'hombre': ['camisa', 'camiseta', 'pantalón', 'pantalon', 'jean', 'sudadera',
               'gorra', 'boxer', 'cinturón', 'tenis hombre', 'blazer'],
    'mujer': ['pijama', 'pijamas', 'lencería', 'lenceria', 'vestido', 'falda',
              'blusa', 'bolso', 'arete', 'aretes', 'collar mujer', 'tacones', 'jumper'],
    'ninos': ['niño', 'nino', 'niña', 'nina', 'infantil', 'puzzle', 'lego',
              'patineta', 'mochila escolar', 'juguete', 'dinosaurio', 'carro de control'],
    'bebes': ['bebé', 'bebe', 'chupete', 'mamadera', 'pañal', 'panal', 'mudador',
              'onesie', 'cuna'],
    'mascotas': ['perro', 'gato', 'mascota', 'mascotas', 'comedero', 'correa',
                 'collar perro', 'juguete mascota', 'arenero'],
    'belleza': ['crema', 'sérum', 'serum', 'mascarilla', 'brocha', 'uñas', 'unas',
                'esmalte', 'labial', 'maquillaje', 'depilador', 'facial'],
    'hogar': ['plato', 'olla', 'cuchara', 'tabla de cortar', 'escurridor', 'jarra',
              'lámpara', 'lampara', 'decoración', 'decoracion', 'toalla', 'manta',
              'almohada', 'cocina', 'mesa', 'silla', 'ventilador mesa', 'cortina',
              'condimentero', 'servilletero', 'organizador', 'mantel', 'florero',
              'llavero', 'reloj de pared', 'cobija'],
    'electrodomesticos': ['licuadora', 'tostador', 'microondas', 'cafetera', 'horno',
                          'batidora', 'freidora', 'air fryer', 'olla arrocera', 'aspiradora'],
    'tecnologia': ['cable', 'usb', 'cargador', 'power bank', 'auricular', 'audífono',
                   'audifono', 'funda', 'vidrio templado', 'celular', 'laptop',
                   'audífonos', 'mouse', 'teclado', 'ssd', 'memoria', 'tarjeta sd',
                   'proyector', 'bluetooth', 'smartwatch', 'cámara', 'camara', 'led tv'],
    'herramientas': ['martillo', 'destornillador', 'taladro', 'cinta métrica',
                     'cinta metrica', 'nivel', 'herramienta', 'herramientas',
                     'llave inglesa', 'alicate', 'mueble kit'],
}

EMOJIS = {
    'camisa': '👔', 'camiseta': '👕', 'pantalón': '👖', 'pantalon': '👖', 'jean': '👖',
    'vestido': '👗', 'pijama': '🩳', 'zapato': '👟', 'tenis': '👟', 'gorra': '🧢',
    'bolso': '👜', 'arete': '✨', 'maquillaje': '💄', 'crema': '🧴', 'sérum': '💧',
    'serum': '💧', 'mascarilla': '✨', 'uñas': '💅', 'unas': '💅',
    'celular': '📱', 'cable': '🔌', 'cargador': '🔋', 'auricular': '🎧',
    'audífono': '🎧', 'audifono': '🎧', 'power bank': '🔋', 'laptop': '💻',
    'perro': '🐕', 'gato': '🐈', 'mascota': '🐾',
    'licuadora': '🍹', 'tostador': '🍞', 'microondas': '📻', 'cafetera': '☕',
    'martillo': '🔨', 'taladro': '⚙️', 'destornillador': '🪛', 'herramienta': '🧰',
    'bebé': '👶', 'bebe': '👶', 'pañal': '👼', 'panal': '👼', 'chupete': '👶',
    'lámpara': '💡', 'lampara': '💡', 'toalla': '🧼', 'juguete': '🧸',
    'proyector': '📽️', 'cortina': '🪟', 'condimentero': '🧂',
    'puzzle': '🧩', 'juego': '🎮', 'set': '📦', 'kit': '📦',
}
EMOJI_DEFECTO = '🛍️'

CATEGORIAS_VALIDAS = ['hombre', 'mujer', 'ninos', 'bebes', 'mascotas', 'belleza',
                      'hogar', 'electrodomesticos', 'tecnologia', 'herramientas']


# ---------------------------------------------------------------- utilidades

def cargar_env():
    env = {}
    ruta = os.path.join(RAIZ, '.env')
    if os.path.exists(ruta):
        for linea in io_read(ruta).splitlines():
            linea = linea.strip()
            if not linea or linea.startswith('#') or '=' not in linea:
                continue
            k, v = linea.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def io_read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def io_write(p, txt):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(txt)


def leer_json(p, defecto):
    if os.path.exists(p):
        with open(p, encoding='utf-8') as f:
            return json.load(f)
    return defecto


def guardar_json(p, valor):
    io_write(p, json.dumps(valor, ensure_ascii=False, indent=2))


# ------------------------------------------------------------ catalogo -> JS

def cmd_build(_args):
    items = leer_json(CATALOGO, [])
    lineas = [
        '// ============ DATOS DE PRODUCTOS (ARCHIVO GENERADO) ============',
        '// NO editar a mano: la fuente de verdad es data/catalogo.json.',
        '// Regenerar con:  python3 scripts/catalogo.py build',
        '// Cada producto declara sus categorías en `categorias: [...]` (puede ser más de una).',
        '// Imágenes: subir el archivo a assets/images/products/ y escribir SOLO su nombre.',
        '// (la primera es portada; si no hay imagen se muestra `emoji`).',
        'const productos = [',
    ]
    for p in items:
        comentado = p.pop('comentado', False)
        cuerpo = json.dumps(p, ensure_ascii=False, separators=(', ', ': '))
        prefijo = '            // ' if comentado else '            '
        lineas.append(prefijo + cuerpo + ',')
        if comentado:
            p['comentado'] = True
    lineas.append('];')
    lineas.append('')
    io_write(SALIDA_JS, '\n'.join(lineas))
    activos = sum(1 for p in items if not p.get('comentado'))
    print('build OK: %d productos (%d activos) -> assets/js/productos-data.js'
          % (len(items), activos))
    return 0


# ------------------------------------------------------------ parser Telegram

def parsear_producto(texto, imagenes):
    """Devuelve (nombre, precio, descripcion, categoria_sugerida) desde el texto."""
    texto = (texto or '').strip()
    precio = None
    patrones = [
        r'\$\s*(\d{1,4}(?:[.,]\d{1,2})?)',
        r'(\d{1,4}[.,]\d{1,2})\s*(?:usd|dólares?|dolares?)\b',
        r'(?:precio|valor|cuesta|c:\s*)\D{0,12}(\d{1,4}(?:[.,]\d{1,2})?)',
        r'\b(\d{1,3}[.,]\d{2})\b',
    ]
    for pat in patrones:
        m = re.search(pat, texto, re.I)
        if m:
            precio = float(m.group(1).replace(',', '.'))
            break
    # nombre: primera línea sin el precio
    primera = next((l.strip() for l in texto.splitlines() if l.strip()), '')
    nombre = primera
    for pat in patrones:
        nombre = re.sub(pat, '', nombre, flags=re.I)
    nombre = re.sub(r'\b(?:precio|valor|cuesta)\b\s*:?\s*$', '', nombre, flags=re.I)
    nombre = re.sub(r'^[\s|·\-–—:,;]+', '', nombre)
    nombre = re.sub(r'[\s|·\-–—:,]+$', '', nombre).strip()
    if not nombre:
        nombre = 'Producto nuevo'
    if len(nombre) > 64:
        nombre = nombre[:61].rstrip() + '…'
    cat = sugerir_categoria(texto + ' ' + nombre)
    return nombre, precio, texto, cat


def sugerir_categoria(texto):
    t = texto.lower()
    for cat, claves in CATEGORIAS_CLAVE.items():
        for k in claves:
            if k in t:
                return cat
    return None


def adivinar_emoji(nombre):
    n = nombre.lower()
    for k, e in EMOJIS.items():
        if k in n:
            return e
    return EMOJI_DEFECTO


# --------------------------------------------------------------- run (bot)

def api(token, metodo, **params):
    url = 'https://api.telegram.org/bot%s/%s' % (token, metodo)
    datos = urllib.parse.urlencode(params).encode()
    with urllib.request.urlopen(url, datos, timeout=60, context=_contexto_ssl()) as r:
        obj = json.loads(r.read().decode())
    if not obj.get('ok'):
        raise RuntimeError('Telegram API %s: %s' % (metodo, obj.get('description')))
    return obj['result']


def descargar_imagen(token, file_id, prefijo):
    info = api(token, 'getFile', file_id=file_id)
    path = info['result']['file_path']
    ext = os.path.splitext(path)[1] or '.jpg'
    url = 'https://api.telegram.org/file/bot%s/%s' % (token, path)
    nombre = '%s%s' % (prefijo, ext)
    destino = os.path.join(IMAGENES, nombre)
    if not os.path.exists(destino):
        os.makedirs(IMAGENES, exist_ok=True)
        with urllib.request.urlopen(url, timeout=60, context=_contexto_ssl()) as r:
            data = r.read()
        with open(destino, 'wb') as f:
            f.write(data)
        print('  imagen guardada:', nombre, '(%d KB)' % (len(data) // 1024))
    return nombre


def cmd_run(args):
    env = cargar_env()
    token = env.get('TELEGRAM_BOT_TOKEN')
    if not token:
        print('Falta TELEGRAM_BOT_TOKEN en .env (créalo desde @BotFather).')
        return 1
    solo_chat = env.get('TELEGRAM_CHAT_ID')
    estado = leer_json(ESTADO, {'last_update_id': 0, 'buffer': {}, 'descargadas': {}})
    pendientes = leer_json(PENDIENTES, [])
    una_vez = '--once' in args
    print('Escuchando el grupo… (Ctrl+C para terminar)' if not una_vez
          else 'Corriendo UNA tanda de updates…')
    vistos = set(p.get('update_id') for p in pendientes)
    try:
        while True:
            updates = api(token, 'getUpdates',
                          offset=estado['last_update_id'] + 1,
                          timeout=0 if una_vez else 30,
                          allowed_updates=json.dumps(['message']))
            for u in updates:
                estado['last_update_id'] = u['update_id']
                msg = u.get('message') or {}
                chat_id = str(msg.get('chat', {}).get('id', ''))
                if solo_chat and chat_id != solo_chat:
                    continue
                if msg.get('photo') is None and not msg.get('text'):
                    continue
                texto = msg.get('caption') or msg.get('text') or ''
                if texto.startswith('/'):
                    continue
                if not solo_chat and (chat_id.startswith('-100') or chat_id.startswith('-')):
                    chats = estado.setdefault('chats_vistos', [])
                    if chat_id not in chats:
                        chats.append(chat_id)
                        print('chat detectado: %s  (pon TELEGRAM_CHAT_ID=%s en .env para fijarlo)'
                              % (chat_id, chat_id))
                buffer = estado['buffer'].setdefault(chat_id, [])
                if msg.get('photo'):
                    foto = max(msg['photo'], key=lambda s: s.get('width', 0))
                    if texto:
                        # cierra el producto: fotos acumuladas + esta con descripción/precio
                        imagenes = buffer + [foto['file_id']]
                        estado['buffer'][chat_id] = []
                        registrar_producto(token, estado, pendientes, vistos,
                                           chat_id, msg, imagenes, texto)
                    else:
                        buffer.append(foto['file_id'])
                        print('foto acumulada (%d en cola)' % len(buffer))
                elif texto and buffer:
                    # la descripción llegó como texto aparte después de las fotos
                    imagenes = list(buffer)
                    estado['buffer'][chat_id] = []
                    registrar_producto(token, estado, pendientes, vistos,
                                       chat_id, msg, imagenes, texto)
                guardar_json(ESTADO, estado)
                guardar_json(PENDIENTES, pendientes)
            print('… al día (%d update_id, %d pendientes) %s'
                  % (estado['last_update_id'], len(pendientes),
                     time.strftime('%H:%M:%S')))
            if una_vez:
                break
    except KeyboardInterrupt:
        guardar_json(ESTADO, estado)
        guardar_json(PENDIENTES, pendientes)
        print('\nEstado guardado. Pendientes:', len(pendientes))
    return 0


def registrar_producto(token, estado, pendientes, vistos, chat_id, msg, imagenes, texto):
    uid = msg['message_id']
    if uid in vistos:
        return
    nombre, precio, desc, cat = parsear_producto(texto, imagenes)
    rutas = []
    for i, fid in enumerate(imagenes):
        if fid in estado['descargadas']:
            rutas.append(estado['descargadas'][fid])
        else:
            ruta = descargar_imagen(token, fid, 'tg_%s_%d' % (chat_id.replace('-', ''), uid)
                                    + ('' if i == 0 else '_%d' % i))
            estado['descargadas'][fid] = ruta
            rutas.append(ruta)
    item = {
        'update_id': uid,
        'chat_id': chat_id,
        'fecha': time.strftime('%Y-%m-%d %H:%M'),
        'texto': texto,
        'nombre': nombre,
        'precio': precio,
        'categorias_sugeridas': [cat] if cat else [],
        'imagenes': rutas,
    }
    pendientes.append(item)
    vistos.add(uid)
    print('PRODUCTO detectado →', nombre, '| precio:', precio,
          '| fotos:', len(rutas), '| categoría:', cat or '(sin sugerencia)')


# ------------------------------------------------------------ scrape (web pública)

def _contexto_ssl():
    """Contexto SSL portable: certifi si existe, bundle del macOS, o el default."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        pass
    for ruta in ('/etc/ssl/cert.pem', '/etc/ssl/certs/ca-certificates.crt'):
        if os.path.exists(ruta):
            try:
                return ssl.create_default_context(cafile=ruta)
            except Exception:
                pass
    return ssl.create_default_context()


def http_get(url, binario=False, timeout=30):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout, context=_contexto_ssl()) as r:
        data = r.read()
        ctype = r.headers.get('Content-Type', '')
    if binario:
        return data, ctype
    return data.decode('utf-8', 'replace')


def extraer_mensajes(pagina):
    """Devuelve lista {id, urls, texto, fecha} en orden ASCENDENTE."""
    partes = re.split(r'(?=<div class="tgme_widget_message_wrap)', pagina)
    mensajes = []
    for seg in partes[1:]:
        m_id = re.search(r'data-post="[^"]+/(\d+)"', seg)
        if not m_id:
            continue
        # fotos del mensaje (CDN de Telegram) + miniaturas de video.
        # Se limita al dominio del CDN para no coger los PNG de emojis.
        urls = re.findall(
            r"background-image:url\('(https://cdn\d*\.telesco\.pe/file/[^']+)'\)", seg)
        texto = None
        mt = re.search(r'js-message_text[^>]*>(.*?)'
                       r'<div class="tgme_widget_message_(?:reactions|footer)',
                       seg, re.S)
        if not mt:
            mt = re.search(r'js-message_text[^>]*>(.*?)</div>', seg, re.S)
        if mt:
            bruto = re.sub(r'<br\s*/?>', '\n', mt.group(1))
            bruto = re.sub(r'<[^>]+>', '', bruto)
            texto = unescape(bruto).strip()
            if not texto:
                texto = None
        mfecha = re.search(r'<time datetime="([^"]+)"', seg)
        mensajes.append({
            'id': int(m_id.group(1)),
            'urls': urls,
            'texto': texto,
            'fecha': (mfecha.group(1)[:16].replace('T', ' ') if mfecha else ''),
        })
    return mensajes


def descargar_url(url, prefijo):
    ext_map = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'}
    data, ctype = http_get(url, binario=True, timeout=60)
    ext = ext_map.get(ctype.split(';')[0].strip(), '.jpg')
    nombre = prefijo + ext
    destino = os.path.join(IMAGENES, nombre)
    if not os.path.exists(destino):
        os.makedirs(IMAGENES, exist_ok=True)
        with open(destino, 'wb') as f:
            f.write(data)
        print('  imagen guardada:', nombre, '(%d KB)' % (len(data) // 1024))
    return nombre


def procesar_mensajes(mensajes, estado, pendientes, canal):
    """Máquina: fotos → buffer; texto → cierra producto."""
    vistos = set(p.get('post_id') for p in pendientes)
    for m in mensajes:
        uid = m['id']
        if uid in vistos:
            continue
        texto = m['texto']
        buffer = estado['buffer']
        if m['urls'] and texto:
            urls = buffer + m['urls']
            estado['buffer'] = []
            registrar_desde_web(estado, pendientes, vistos, canal, uid, urls, texto, m['fecha'])
        elif m['urls']:
            buffer += m['urls']
            print('  fotos acumuladas (%d en cola, post %d)' % (len(buffer), uid))
        elif texto and buffer:
            urls = buffer
            estado['buffer'] = []
            registrar_desde_web(estado, pendientes, vistos, canal, uid, urls, texto, m['fecha'])
        elif texto:
            print('  texto sin fotos, ignorado (post %d): %s' % (uid, texto[:60].replace('\n', ' / ')))
        guardar_json(ESTADO_SCRAPE, estado)


def registrar_desde_web(estado, pendientes, vistos, canal, uid, urls, texto, fecha):
    nombre, precio, desc, cat = parsear_producto(texto, urls)
    rutas = []
    for i, u in enumerate(urls):
        if u in estado['descargadas'] and os.path.exists(
                os.path.join(IMAGENES, estado['descargadas'][u])):
            rutas.append(estado['descargadas'][u])
        else:
            ruta = descargar_url(u, 'tg_%d_%d' % (uid, i))
            estado['descargadas'][u] = ruta
            rutas.append(ruta)
    pendientes.append({
        'post_id': uid,
        'post': 'https://t.me/%s/%d' % (canal, uid),
        'fecha': fecha,
        'texto': texto,
        'nombre': nombre,
        'precio': precio,
        'categorias_sugeridas': [cat] if cat else [],
        'imagenes': rutas,
    })
    vistos.add(uid)
    print('PRODUCTO detectado →', nombre, '| precio:', precio,
          '| fotos:', len(rutas), '| categoría:', cat or '(sin sugerencia)')


def cmd_scrape(args):
    env = cargar_env()
    canal = os.environ.get('TELEGRAM_CANAL') or env.get('TELEGRAM_CANAL') or CANAL_DEFECTO
    estado = leer_json(ESTADO_SCRAPE, {'ultimo_id': 0, 'buffer': [], 'descargadas': {}})
    pendientes = leer_json(PENDIENTES, [])
    primera = estado['ultimo_id'] == 0
    # --ultimos N fuerza importación de los últimos N (por defecto N=10 en la
    # primera corrida; 0 = solo nuevos)
    n = 10
    for a in args:
        if a.startswith('--ultimos='):
            n = int(a.split('=')[1])
    if not primera:
        n = 0
    pagina = http_get('https://t.me/s/' + canal)
    mensajes = extraer_mensajes(pagina)
    if not mensajes:
        print('No se pudieron leer mensajes de t.me/s/%s' % canal)
        return 1
    print('Página leída: %d mensajes (ids %d..%d)' % (
        len(mensajes), mensajes[0]['id'], mensajes[-1]['id']))
    # página(s) anteriores si TODOS los mensajes son nuevos (puede haber >1 página)
    while mensajes[0]['id'] > estado['ultimo_id'] and estado['ultimo_id'] > 0:
        prev = re.search(r'\?before=(\d+)', pagina)
        if not prev:
            break
        pagina = http_get('https://t.me/s/%s?before=%s' % (canal, prev.group(1)))
        viejos = extraer_mensajes(pagina)
        if not viejos:
            break
        mensajes = viejos + mensajes
        print('  + página anterior: %d mensajes' % len(viejos))
    if n > 0:
        seleccion = mensajes[-n:]
    else:
        seleccion = [m for m in mensajes if m['id'] > estado['ultimo_id']]
    if not seleccion:
        print('Nada nuevo. Último post procesado: %d' % estado['ultimo_id'])
        return 0
    if primera:
        print('PRIMERA CORRIDA: se importan los últimos %d como prueba y '
              'se fija el punto de partida en %d.' % (len(seleccion), mensajes[-1]['id']))
    print('Procesando %d mensajes…' % len(seleccion))
    procesar_mensajes(seleccion, estado, pendientes, canal)
    # el punto de partida es el máximo VISTO (los de texto quedarán cerrados;
    # los de solo-foto ya están en el buffer persistido)
    if primera:
        estado['ultimo_id'] = mensajes[-1]['id']
    else:
        estado['ultimo_id'] = max(estado['ultimo_id'], mensajes[-1]['id'])
    guardar_json(ESTADO_SCRAPE, estado)
    guardar_json(PENDIENTES, pendientes)
    print('Listo. Pendientes: %d  (revisa con: python3 scripts/catalogo.py status)'
          % len(pendientes))
    return 0


# --------------------------------------------------------------- apply

def cmd_apply(args):
    auto = '-y' in args
    pendientes = leer_json(PENDIENTES, [])
    if not pendientes:
        print('No hay productos pendientes (data/pending.json).')
        return 0
    catalogo = leer_json(CATALOGO, [])
    ids = [p['id'] for p in catalogo if 'id' in p]
    siguiente = max(ids) + 1 if ids else 1
    hechos, saltados = [], []
    for i, it in enumerate(pendientes, 1):
        print('\n[%d/%d] %s' % (i, len(pendientes), it['nombre']))
        print('   precio: %s | fotos: %s | texto: %s'
              % (it['precio'], ', '.join(it['imagenes']), it['texto'][:90].replace('\n', ' / ')))
        sugerida = (it.get('categorias_sugeridas') or [None])[0]
        if auto:
            cat = sugerida or os.environ.get('CATEGORIA_DEFAULT') or 'hogar'
        else:
            if sugerida:
                cat = input('   categoría [%s]: ' % sugerida).strip() or sugerida
            else:
                print('   opciones:', ', '.join(CATEGORIAS_VALIDAS))
                cat = input('   categoría: ').strip()
            if cat == '':
                saltados.append(it); print('   → saltado'); continue
        if cat not in CATEGORIAS_VALIDAS:
            print('   categoría inválida (%s) → saltado' % cat)
            saltados.append(it); continue
        if not auto:
            resp = input('   ¿agregar? (S/n): ').strip().lower()
            if resp in ('n', 'no'):
                saltados.append(it); print('   → saltado'); continue
        nuevo = {
            'id': siguiente, 'categorias': [cat], 'nombre': it['nombre'],
            'emoji': adivinar_emoji(it['nombre']), 'precio': it['precio'] or 0,
            'stock': True,
        }
        if it['imagenes']:
            nuevo['imagenes'] = it['imagenes']
        if it['texto']:
            nuevo['descripcion'] = it['texto']
        catalogo.append(nuevo)
        siguiente += 1
        hechos.append(it)
        print('   → añadido como id %d [%s]' % (nuevo['id'], cat))
    guardar_json(CATALOGO, catalogo)
    guardar_json(PENDIENTES, saltados)
    if hechos:
        cmd_build([])
    print('\nListo: %d añadidos, %d pendientes restantes.' % (len(hechos), len(saltados)))
    return 0


def cmd_status(_args):
    pendientes = leer_json(PENDIENTES, [])
    catalogo = leer_json(CATALOGO, [])
    activos = sum(1 for p in catalogo if not p.get('comentado'))
    print('Catálogo: %d activos | Pendientes: %d' % (activos, len(pendientes)))
    for it in pendientes:
        print('  -', it['nombre'], '| $', it['precio'], '|', it['imagenes'])
        if it.get('post'):
            print('    origen:', it['post'], '|', it.get('fecha', ''))
    return 0


def main():
    args = sys.argv[1:]
    comandos = ('scrape', 'build', 'run', 'apply', 'status')
    if not args or args[0] not in comandos:
        print(__doc__)
        return 1
    cmd, resto = args[0], args[1:]
    if cmd == 'scrape':
        return cmd_scrape(resto)
    if cmd == 'build':
        return cmd_build(resto)
    if cmd == 'run':
        return cmd_run(resto)
    if cmd == 'apply':
        return cmd_apply(resto)
    return cmd_status(resto)


if __name__ == '__main__':
    sys.exit(main())
