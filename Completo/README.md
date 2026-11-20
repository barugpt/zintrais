# SINTRA IS

Panel local para explorar productos, estimar precios y preparar contenido comercial. El ranking incluido usa reglas heurísticas; no es un modelo de machine learning ni una garantía de rentabilidad.

## Requisitos

- Node.js 22 o superior
- npm
- Una clave de Groq para habilitar las funciones de IA (opcional)
- Credenciales de Google Cloud Text-to-Speech para generar audios (opcional)

## Puesta en marcha

En una terminal, dentro de la carpeta `SINTRA-IS`:

```powershell
npm install
Copy-Item .env.example .env
```

Edita `.env` y añade tu clave de Groq en `GROQ_API_KEY`. No compartas ni subas ese archivo. Sin clave, el servidor y las herramientas de cálculo funcionan, pero el chat y la redacción con IA informan que no están configurados.
Puedes añadir `MI_ALIAS_MP` para mostrar el alias de cobro configurado en el panel. No se inventa un alias si está vacío. El panel lo muestra como dato informativo; verifica siempre el titular y el importe antes de transferir.

```powershell
npm start
```

Abre <http://127.0.0.1:5001>. Para comprobar el estado del servicio, visita `/api/health`. Ejecuta las pruebas con `npm test`.

## Configuración

- `PORT`: puerto HTTP (por defecto `5001`).
- `HOST`: interfaz de red (por defecto `127.0.0.1`, solo acceso local).
- `GROQ_API_KEY`: clave privada de Groq; se mantiene en el servidor.
- `PROTRADE_COLLECTION_URL`: URL del catálogo de productos de Protrade (por defecto, `https://protrade.com.ar/todos-los-productos/`).
- `CHROME_BIN`: ruta opcional al ejecutable de Chrome/Chromium para el fallback Selenium en Linux.
- `MERCADOLIBRE_ACCESS_TOKEN`: token opcional para la búsqueda de productos en Mercado Libre Argentina.
- `WHATSAPP_PHONE`: teléfono para el botón de WhatsApp, con código de país y solo dígitos (por ejemplo, `5491112345678`). Si queda vacío, WhatsApp permite elegir el contacto.
- `MI_ALIAS_MP`: alias de Mercado Pago que el panel muestra, si está configurado.
- `GOOGLE_APPLICATION_CREDENTIALS`: ruta local a las credenciales de Google Cloud, o configura Application Default Credentials.
- `JSON2VIDEO_API_KEY`: clave privada de JSON2Video para subir el audio y renderizar MP4.

El escáner prueba primero el HTML público de Protrade y, si no encuentra tarjetas o hay un fallo de red, usa Chrome headless mediante Selenium para esperar el contenido dinámico. En Ubuntu instala Chrome/Chromium y deja que Selenium Manager resuelva el controlador compatible, o configura `CHROME_BIN` con la ruta del navegador. Se usan `--headless=new`, `--no-sandbox` y `--disable-dev-shm-usage` en Linux. Los errores HTTP 403/429 se registran y no se reintentan con una identidad de navegador falsa; si el proveedor bloquea el servidor, solicita que habilite su IP. Si no se puede leer el catálogo, el panel identifica claramente los datos de demostración, que no representan inventario real. Las oportunidades se contrastan con resultados comparables de Mercado Libre Argentina y Frávega. Si ninguna fuente devuelve una coincidencia suficiente, el producto se omite. Configura `MERCADOLIBRE_ACCESS_TOKEN` si la API requiere autenticación para tu cuenta o entorno.

## Estimaciones

La calculadora usa porcentajes ilustrativos editables en `services/mercadoLibreEngine.js`. Las comisiones, impuestos, costos de envío y condiciones comerciales reales pueden variar. Verifica los valores vigentes antes de fijar precios. El feed de Google y el Schema publican los productos como disponibles (`in_stock`), según la política de stock permanente indicada para Protrade.

## Guion y audio

La función `/api/generar-audio` usa Groq para redactar un guion y Google Cloud Text-to-Speech para sintetizar un MP3 en español argentino. No genera ni monta un video. Para usarla, habilita la API Text-to-Speech y la facturación correspondiente en Google Cloud, configura credenciales ADC (por ejemplo, `gcloud auth application-default login`) y establece `GOOGLE_APPLICATION_CREDENTIALS` si usas un archivo de credenciales. Mantén ese archivo fuera del repositorio. La aplicación conserva como máximo los 20 audios más recientes en `public/audios` y limita la generación a 3 solicitudes por ventana de 10 minutos por IP.

El panel incluye un formulario para generar el MP4. El panel permite subir una imagen JPG, PNG o WebP de hasta 10 MB desde la computadora, o indicar una URL HTTPS pública. Las imágenes subidas se validan y se envían a los medios temporales de JSON2Video. La función `generarVideoAutomatico` genera el guion con Groq, sintetiza el audio con Google Cloud TTS, sube ambos recursos a JSON2Video y espera el render vertical hasta devolver el enlace del MP4. Requiere `GROQ_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS` (o credenciales ADC) y `JSON2VIDEO_API_KEY`. Este proceso puede consumir créditos de los proveedores.

## API local

- `GET /api/health`
- `GET /api/oportunidades`
- `GET /api/google-feed` — feed RSS XML de Google Merchant Center para todos los productos competitivos.
- `GET /producto/:id` — página de compra con Schema.org, QR y botón de WhatsApp.
- `POST /api/calcular-ml` — `{ "costo": 4200, "margen": 0.5 }`
- `POST /api/chat` — `{ "mensaje": "...", "historial": [] }`
- `POST /api/generar-seo` — `{ "producto": "...", "precio": 12000, "caracteristicas": "..." }`
- `POST /api/generar-audio` — `{ "producto": "...", "precio": 12000 }`
- `POST /api/generar-video-auto` — formulario `multipart/form-data` con `producto`, `precio` y archivo `imagen`; alternativamente, `producto`, `precio` e `imagenUrl` HTTPS.

Las rutas POST esperan JSON y validan datos de entrada. La aplicación está enlazada a `127.0.0.1` por defecto; no la expongas a Internet sin añadir autenticación, límites de solicitudes y una configuración de despliegue apropiada.

Las páginas de compra y el feed usan enlaces bajo `https://zintrais.tech`. El servidor omite datos de demostración del feed y devuelve un error explícito si no hay productos competitivos. Verifica el dominio en Google Merchant Center, configura el teléfono de WhatsApp y revisa que las imágenes sean accesibles antes de publicar.
