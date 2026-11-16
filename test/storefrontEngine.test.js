const test = require('node:test');
const assert = require('node:assert/strict');
const {
    crearIdProducto,
    obtenerImagenProducto,
    crearUrlWhatsapp,
    renderizarPaginaProducto,
    generarGoogleFeed
} = require('../services/storefrontEngine');

function crearProducto(overrides = {}) {
    return {
        id: 'termo-1',
        nombre: 'Termo eléctrico',
        precioVentaNumerico: 27300,
        precioWebNumerico: 30000,
        aceptado: true,
        stock: null,
        ...overrides
    };
}

test('crea IDs estables a partir de la identidad del producto', () => {
    const producto = crearProducto({ url: 'https://protrade.test/products/termo-1' });
    assert.equal(crearIdProducto(producto), crearIdProducto({ ...producto, costoProveedor: 20000 }));
});

test('usa una imagen de reemplazo si no hay imagen HTTPS disponible', () => {
    assert.equal(obtenerImagenProducto(crearProducto()), 'https://zintrais.tech/product-placeholder.svg');
    assert.equal(
        obtenerImagenProducto(crearProducto({ imagenUrl: 'http://example.test/term.jpg' })),
        'https://zintrais.tech/product-placeholder.svg'
    );
});

test('renderiza HTML escapado y Schema en stock aunque no informe cantidad', () => {
    const template = '<h1>{{NOMBRE_HTML}}</h1><p>{{PRECIO_HTML}}</p><p>{{DISPONIBILIDAD_HTML}}</p><script>{{SCHEMA_JSON}}</script>';
    const html = renderizarPaginaProducto(template, crearProducto({
        nombre: '</script><img src=x onerror=alert(1)>',
        stock: 0
    }));

    assert.match(html, /&lt;\/script&gt;&lt;img/);
    assert.match(html, /\\u003c\/script/);
    assert.match(html, /<p>En stock<\/p>/);
    assert.match(html, /"priceCurrency":"ARS"/);
    assert.match(html, /"availability":"https:\/\/schema\.org\/InStock"/);
});

test('crea una URL WhatsApp con el producto y precio en el mensaje', () => {
    const anterior = process.env.WHATSAPP_PHONE;
    try {
        process.env.WHATSAPP_PHONE = '5491112345678';
        const url = new URL(crearUrlWhatsapp(crearProducto()));
        assert.equal(url.hostname, 'wa.me');
        assert.equal(url.pathname, '/5491112345678');
        assert.match(url.searchParams.get('text'), /Termo eléctrico/);
        assert.match(url.searchParams.get('text'), /27\.300/);
    } finally {
        if (anterior === undefined) delete process.env.WHATSAPP_PHONE;
        else process.env.WHATSAPP_PHONE = anterior;
    }
});

test('genera un RSS Google XML con enlaces propios y solo productos aceptados', () => {
    const xml = generarGoogleFeed([
        crearProducto({ stock: 0 }),
        crearProducto({ id: 'sin-cantidad', stock: null }),
        crearProducto({ id: 'rechazado', aceptado: false })
    ]);

    assert.match(xml, /<g:link>https:\/\/zintrais\.tech\/producto\/termo-1<\/g:link>/);
    assert.match(xml, /<g:price>27300\.00 ARS<\/g:price>/);
    assert.equal((xml.match(/<item>/g) || []).length, 2);
    assert.equal((xml.match(/<g:availability>in_stock<\/g:availability>/g) || []).length, 2);
});
