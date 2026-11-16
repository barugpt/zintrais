const crypto = require('node:crypto');
const { formatARS } = require('./tradingEngine');

const STOREFRONT_URL = 'https://zintrais.tech';
const PRODUCT_IMAGE_PLACEHOLDER = `${STOREFRONT_URL}/product-placeholder.svg`;

function slugificar(texto) {
    return String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('es-AR')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'producto';
}

function crearIdProducto(producto) {
    const identidad = String(producto.id || producto.url || producto.nombre);
    const sufijo = crypto.createHash('sha256').update(identidad).digest('hex').slice(0, 10);
    return `${slugificar(producto.nombre)}-${sufijo}`;
}

function obtenerUrlProducto(id) {
    return `${STOREFRONT_URL}/producto/${encodeURIComponent(id)}`;
}

function obtenerImagenProducto(producto) {
    if (typeof producto.imagenUrl === 'string') {
        try {
            const url = new URL(producto.imagenUrl);
            if (url.protocol === 'https:') return url.href;
        } catch {
            return PRODUCT_IMAGE_PLACEHOLDER;
        }
    }
    return PRODUCT_IMAGE_PLACEHOLDER;
}

function obtenerDisponibilidad() {
    return 'https://schema.org/InStock';
}

function crearUrlWhatsapp(producto) {
    const telefonoConfigurado = process.env.WHATSAPP_PHONE?.trim();
    const telefono = telefonoConfigurado?.replace(/\D/g, '');
    if (telefonoConfigurado && !/^\d{8,15}$/.test(telefono)) {
        throw new TypeError('WHATSAPP_PHONE debe incluir entre 8 y 15 dígitos, con código de país.');
    }

    const base = telefono ? `https://wa.me/${telefono}` : 'https://wa.me/';
    const mensaje = `Hola, quiero comprar ${producto.nombre} por ${formatARS(producto.precioVentaNumerico)}.`;
    return `${base}?text=${encodeURIComponent(mensaje)}`;
}

function escaparHtml(valor) {
    return String(valor).replace(/[&<>"']/g, (caracter) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[caracter]);
}

function escaparXml(valor) {
    return escaparHtml(valor);
}

function crearSchemaProducto(producto, urlProducto, imagenUrl) {
    const disponibilidad = obtenerDisponibilidad();
    return {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: producto.nombre,
        description: `Producto disponible en SINTRA IS. Consultá disponibilidad y condiciones por WhatsApp.`,
        image: [imagenUrl],
        sku: producto.id,
        offers: {
            '@type': 'Offer',
            url: urlProducto,
            priceCurrency: 'ARS',
            price: producto.precioVentaNumerico.toFixed(2),
            availability: disponibilidad,
            itemCondition: 'https://schema.org/NewCondition'
        }
    };
}

function renderizarPaginaProducto(template, producto) {
    const urlProducto = obtenerUrlProducto(producto.id);
    const imagenUrl = obtenerImagenProducto(producto);
    const disponibilidadSchema = crearSchemaProducto(producto, urlProducto, imagenUrl);
    const schemaJson = JSON.stringify(disponibilidadSchema)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
    const reemplazos = {
        NOMBRE_HTML: escaparHtml(producto.nombre),
        IMAGEN_URL_HTML: escaparHtml(imagenUrl),
        PRECIO_HTML: escaparHtml(formatARS(producto.precioVentaNumerico)),
        DISPONIBILIDAD_HTML: 'En stock',
        QR_URL_HTML: '/qr_pago.png',
        WHATSAPP_URL_HTML: escaparHtml(crearUrlWhatsapp(producto)),
        CANONICAL_URL_HTML: escaparHtml(urlProducto),
        SCHEMA_JSON: schemaJson
    };

    return template.replace(/{{([A-Z_]+)}}/g, (_, clave) => reemplazos[clave] || '');
}

function generarGoogleFeed(productos) {
    const items = productos
        .filter((producto) =>
            producto.aceptado === true &&
            Number.isFinite(producto.precioVentaNumerico) &&
            Number.isFinite(producto.precioWebNumerico) &&
            producto.precioVentaNumerico < producto.precioWebNumerico
        )
        .map((producto) => {
            const campos = {
                id: producto.id,
                title: producto.nombre,
                description: `Producto disponible en SINTRA IS. Consultá disponibilidad y condiciones por WhatsApp.`,
                link: obtenerUrlProducto(producto.id),
                image_link: obtenerImagenProducto(producto),
                availability: 'in_stock',
                price: `${producto.precioVentaNumerico.toFixed(2)} ARS`,
                condition: 'new',
                identifier_exists: 'no'
            };
            return `  <item>\n${Object.entries(campos)
                .map(([nombre, valor]) =>
                    `    <g:${nombre}>${escaparXml(valor)}</g:${nombre}>`
                )
                .join('\n')}\n  </item>`;
        });

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">',
        ' <channel>',
        '  <title>SINTRA IS</title>',
        `  <link>${STOREFRONT_URL}</link>`,
        '  <description>Productos con precio competitivo de SINTRA IS.</description>',
        ...items,
        ' </channel>',
        '</rss>'
    ].join('\n');
}

module.exports = {
    STOREFRONT_URL,
    PRODUCT_IMAGE_PLACEHOLDER,
    crearIdProducto,
    obtenerUrlProducto,
    obtenerImagenProducto,
    obtenerDisponibilidad,
    crearUrlWhatsapp,
    crearSchemaProducto,
    renderizarPaginaProducto,
    generarGoogleFeed
};
