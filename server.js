require('dotenv').config();

const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const multer = require('multer');
const { escanearProtrade } = require('./services/seleniumEngine');
const {
    filtrarProductosCompetitivos,
    rankearProductos
} = require('./services/tradingEngine');
const { consultarPreciosCompetencia } = require('./services/competitorPriceEngine');
const {
    crearIdProducto,
    generarGoogleFeed,
    renderizarPaginaProducto
} = require('./services/storefrontEngine');
const { calcularPrecioMercadoLibre } = require('./services/mercadoLibreEngine');
const { generarRespuestaVenta, obtenerAliasMP } = require('./services/aiEngine');
const { generarSchemaProducto, generarTextoGEO } = require('./services/geoSeoEngine');
const { generarGuionYVoz, generarVideoAutomatico } = require('./services/videoEngine');

const app = express();
const MAX_JSON_BYTES = '32kb';
const CATALOGO_TTL_MS = 60 * 1000;
let catalogoEnCache = null;
let promesaCatalogo = null;
const cargarImagenVideo = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 3, parts: 4 },
    fileFilter: (req, file, callback) => {
        const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
        if (!tiposPermitidos.includes(file.mimetype)) {
            return callback(new TypeError('La imagen debe ser JPG, PNG o WebP.'));
        }
        callback(null, true);
    }
});

app.disable('x-powered-by');
app.use(express.json({ limit: MAX_JSON_BYTES }));
app.get('/qr_pago.png', manejarAsync(async (req, res) => {
    const imagenes = [
        {
            ruta: path.join(__dirname, 'public', 'qr_pago.png'),
            tipo: 'image/png'
        },
        {
            ruta: path.join(__dirname, 'Nueva carpeta', 'WhatsApp Image 2026-11-16 at 16.35.31.jpeg'),
            tipo: 'image/jpeg'
        },
        {
            ruta: path.join(__dirname, 'public', 'Nueva carpeta', 'WhatsApp Image 2026-11-16 at 16.35.31.jpeg'),
            tipo: 'image/jpeg'
        }
    ];

    for (const imagen of imagenes) {
        try {
            const contenido = await fs.readFile(imagen.ruta);
            return res.type(imagen.tipo).send(contenido);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }

    return res.status(404).type('text').send('No se encontró la imagen QR de pago.');
}));
app.use(express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    index: 'index.html'
}));

function manejarAsync(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function validarTexto(valor, nombre, maxLength) {
    if (typeof valor !== 'string' || !valor.trim() || valor.length > maxLength) {
        throw new TypeError(`${nombre} debe tener entre 1 y ${maxLength} caracteres.`);
    }
    return valor.trim();
}

async function obtenerCatalogoCompetitivo() {
    if (catalogoEnCache && catalogoEnCache.expiraEn > Date.now()) {
        return catalogoEnCache.valor;
    }

    if (!promesaCatalogo) {
        promesaCatalogo = (async () => {
            const resultado = await escanearProtrade();
            const conPrecioWeb = await consultarPreciosCompetencia(resultado.productos);
            const competitivos = filtrarProductosCompetitivos(conPrecioWeb)
                .map((producto) => ({
                    ...producto,
                    id: crearIdProducto(producto)
                }));
            const catalogo = {
                productos: competitivos,
                fuente: resultado.fuente,
                demo: resultado.demo,
                aviso: resultado.aviso,
                cantidadOmitida: resultado.productos.length - competitivos.length
            };
            catalogoEnCache = {
                valor: catalogo,
                expiraEn: Date.now() + CATALOGO_TTL_MS
            };
            return catalogo;
        })();
    }

    try {
        return await promesaCatalogo;
    } finally {
        promesaCatalogo = null;
    }
}

app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        servicio: 'SINTRA IS',
        iaConfigurada: Boolean(process.env.GROQ_API_KEY),
        aliasMp: obtenerAliasMP()
    });
});

app.get('/api/oportunidades', manejarAsync(async (req, res) => {
    const catalogo = await obtenerCatalogoCompetitivo();
    const productosCalculados = catalogo.productos.map((producto) => ({
        ...producto,
        producto: producto.nombre
    }));
    const topVentas = rankearProductos(productosCalculados).slice(0, 10);

    res.json({
        topVentas,
        fuente: `${catalogo.fuente} + comparación web (Mercado Libre / Frávega)`,
        demo: catalogo.demo,
        aviso: catalogo.aviso || (catalogo.cantidadOmitida
            ? `${catalogo.cantidadOmitida} producto(s) se omitieron por no encontrar una comparación válida o por no superar el precio web.`
            : null)
    });
}));

app.get('/producto/:id', manejarAsync(async (req, res) => {
    const catalogo = await obtenerCatalogoCompetitivo();
    if (catalogo.demo) {
        return res.status(503).type('text').send(
            'No se publican páginas de compra con el catálogo de demostración.'
        );
    }

    const producto = catalogo.productos.find((item) => item.id === req.params.id);
    if (!producto) {
        return res.status(404).type('text').send('Producto no encontrado o no disponible.');
    }

    const template = await fs.readFile(path.join(__dirname, 'public', 'producto.html'), 'utf8');
    res.type('html').send(renderizarPaginaProducto(template, producto));
}));

app.get('/api/google-feed', manejarAsync(async (req, res) => {
    const catalogo = await obtenerCatalogoCompetitivo();
    if (catalogo.demo) {
        return res.status(503).type('text').send(
            'No se genera el feed de Google con datos de demostración.'
        );
    }
    if (!catalogo.productos.length) {
        return res.status(503).type('text').send(
            'No hay productos competitivos para publicar en el feed.'
        );
    }

    res.set('Content-Type', 'application/rss+xml; charset=utf-8')
        .send(generarGoogleFeed(catalogo.productos));
}));

app.post('/api/calcular-ml', (req, res) => {
    const { costo, margen } = req.body || {};
    res.json(calcularPrecioMercadoLibre(costo, margen));
});

app.post('/api/chat', manejarAsync(async (req, res) => {
    const mensaje = validarTexto(req.body?.mensaje, 'El mensaje', 2000);
    const reply = await generarRespuestaVenta(mensaje, req.body?.historial || []);
    res.json({ reply });
}));

app.post('/api/generar-seo', manejarAsync(async (req, res) => {
    const producto = validarTexto(req.body?.producto, 'El producto', 200);
    const precio = req.body?.precio;
    const caracteristicas = req.body?.caracteristicas || '';
    const schema = generarSchemaProducto(producto, precio);
    const textoVenta = await generarTextoGEO(producto, caracteristicas);
    res.json({ schema, textoVenta });
}));

const solicitudesAudio = new Map();
function limitarGeneracionAudio(req, res, next) {
    const ahora = Date.now();
    const ventanaMs = 10 * 60 * 1000;
    const maxSolicitudes = 3;
    const solicitudes = (solicitudesAudio.get(req.ip) || [])
        .filter((fecha) => ahora - fecha < ventanaMs);

    if (solicitudes.length >= maxSolicitudes) {
        return res.status(429).json({
            error: 'Se alcanzó el límite temporal de generación de audio. Intenta nuevamente más tarde.'
        });
    }

    solicitudes.push(ahora);
    solicitudesAudio.set(req.ip, solicitudes);
    next();
}

app.post('/api/generar-audio', limitarGeneracionAudio, manejarAsync(async (req, res) => {
    const producto = validarTexto(req.body?.producto, 'El producto', 200);
    const resultado = await generarGuionYVoz(producto, req.body?.precio);
    res.json({
        mensaje: 'Guion y audio generados. No se creó un video terminado.',
        ...resultado
    });
}));

app.post(
    '/api/generar-video-auto',
    limitarGeneracionAudio,
    cargarImagenVideo.single('imagen'),
    manejarAsync(async (req, res) => {
        const producto = validarTexto(req.body?.producto, 'El producto', 200);
        const resultado = await generarVideoAutomatico(
            producto,
            req.body?.precio,
            req.file || req.body?.imagenUrl
        );
        res.json(resultado);
    })
);

app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Ruta de API no encontrada.' });
});

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);

    const status = error.status || error.statusCode ||
        (error instanceof multer.MulterError ? 400 : error instanceof TypeError ? 400 : 500);
    if (status >= 500) {
        console.error(`Error en ${req.method} ${req.path}: ${error.message}`);
    }
    res.status(status).json({
        error: status >= 500 ? 'No se pudo completar la solicitud.' : error.message
    });
});

if (require.main === module) {
    const port = Number(process.env.PORT || 5001);
    const host = process.env.HOST || '127.0.0.1';
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new TypeError('PORT debe ser un puerto válido entre 1 y 65535.');
    }
    app.listen(port, host, () => {
        console.log(`SINTRA IS disponible en http://${host}:${port}`);
        if (!process.env.GROQ_API_KEY) {
            console.warn('Asistente IA desactivado: configura GROQ_API_KEY en .env.');
        }
    });
}

module.exports = app;
