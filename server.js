require('dotenv').config();

const express = require('express');
const path = require('node:path');
const multer = require('multer');
const { escanearProtrade } = require('./services/seleniumEngine');
const { calcularJugadaMayorista, rankearProductos } = require('./services/tradingEngine');
const { calcularPrecioMercadoLibre } = require('./services/mercadoLibreEngine');
const { generarRespuestaVenta, obtenerAliasMP } = require('./services/aiEngine');
const { generarSchemaProducto, generarTextoGEO } = require('./services/geoSeoEngine');
const { generarGuionYVoz, generarVideoAutomatico } = require('./services/videoEngine');

const app = express();
const MAX_JSON_BYTES = '32kb';
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

app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        servicio: 'SINTRA IS',
        iaConfigurada: Boolean(process.env.GROQ_API_KEY),
        aliasMp: obtenerAliasMP()
    });
});

app.get('/api/oportunidades', manejarAsync(async (req, res) => {
    const resultado = await escanearProtrade();
    const productosCalculados = resultado.productos.map((producto) => ({
        producto: producto.nombre,
        stock: producto.stock,
        ...calcularJugadaMayorista(producto.costoProveedor)
    }));
    const topVentas = rankearProductos(
        productosCalculados,
        ['parlante', 'auricular', 'led', 'smartwatch']
    ).slice(0, 10);

    res.json({
        topVentas,
        fuente: resultado.fuente,
        demo: resultado.demo,
        aviso: resultado.aviso
    });
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
