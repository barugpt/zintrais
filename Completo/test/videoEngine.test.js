const test = require('node:test');
const assert = require('node:assert/strict');
const {
    validarDatosGuion,
    validarUrlImagen,
    validarImagenSubida
} = require('../services/videoEngine');

test('normaliza producto y valida precio para el generador de audio', () => {
    assert.deepEqual(validarDatosGuion('  Parlante Bluetooth  ', '12000'), {
        producto: 'Parlante Bluetooth',
        precio: 12000
    });
});

test('rechaza producto vacío, demasiado largo y precio inválido', () => {
    assert.throws(() => validarDatosGuion(' ', 12000), TypeError);
    assert.throws(() => validarDatosGuion('p'.repeat(201), 12000), TypeError);
    assert.throws(() => validarDatosGuion('Producto', 0), TypeError);
});

test('acepta solo URLs HTTPS públicas para la imagen del video', () => {
    assert.equal(
        validarUrlImagen('https://cdn.example.com/producto.jpg'),
        'https://cdn.example.com/producto.jpg'
    );
    assert.throws(() => validarUrlImagen('http://cdn.example.com/producto.jpg'), TypeError);
    assert.throws(() => validarUrlImagen('https://127.0.0.1/producto.jpg'), TypeError);
    assert.throws(() => validarUrlImagen('https://localhost/producto.jpg'), TypeError);
});

test('detecta imágenes JPG, PNG y WebP subidas y rechaza contenido falso', () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const jpeg = Buffer.from([255, 216, 255, 0]);
    const webp = Buffer.from('RIFF0000WEBP', 'ascii');

    assert.equal(validarImagenSubida({ buffer: png }).contentType, 'image/png');
    assert.equal(validarImagenSubida({ buffer: jpeg }).contentType, 'image/jpeg');
    assert.equal(validarImagenSubida({ buffer: webp }).contentType, 'image/webp');
    assert.throws(() => validarImagenSubida({ buffer: Buffer.from('not an image') }), TypeError);
    assert.throws(() => validarImagenSubida(null), TypeError);
});
