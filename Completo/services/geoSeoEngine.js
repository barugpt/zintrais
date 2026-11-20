const { generarRespuestaVenta } = require('./aiEngine');

function generarSchemaProducto(producto, precio) {
    if (typeof producto !== 'string' || !producto.trim() || producto.length > 200) {
        throw new TypeError('El nombre del producto debe tener entre 1 y 200 caracteres.');
    }
    const valor = Number(precio);
    if (!Number.isFinite(valor) || valor <= 0) {
        throw new TypeError('El precio debe ser un número mayor que cero.');
    }

    const schema = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: producto.trim(),
        description: `Información comercial de ${producto.trim()}. Consulta disponibilidad y condiciones de envío.`,
        brand: { '@type': 'Brand', name: 'SINTRA IS' },
        offers: {
            '@type': 'Offer',
            priceCurrency: 'ARS',
            price: valor.toFixed(2)
        }
    };

    const json = JSON.stringify(schema, null, 2).replace(/</g, '\\u003c');
    return `<script type="application/ld+json">\n${json}\n</script>`;
}

async function generarTextoGEO(producto, caracteristicas = '') {
    if (typeof producto !== 'string' || !producto.trim() || producto.length > 200) {
        throw new TypeError('El nombre del producto debe tener entre 1 y 200 caracteres.');
    }
    if (typeof caracteristicas !== 'string' || caracteristicas.length > 1000) {
        throw new TypeError('Las características deben tener hasta 1000 caracteres.');
    }

    const prompt = [
        'Redacta una descripción breve y natural en español para una página de producto.',
        `Producto: ${producto.trim()}`,
        caracteristicas.trim() ? `Características proporcionadas: ${caracteristicas.trim()}` : '',
        'No inventes precios, disponibilidad, ventajas comparativas ni plazos de entrega.',
        'Responde en 2 o 3 oraciones y usa únicamente los datos proporcionados.'
    ].filter(Boolean).join('\n');

    return generarRespuestaVenta(prompt);
}

module.exports = { generarSchemaProducto, generarTextoGEO };
