function assertPositiveNumber(value, fieldName) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
        throw new TypeError(`${fieldName} debe ser un número mayor que cero.`);
    }
    return number;
}

function formatARS(value) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0
    }).format(value);
}

function calcularJugadaMayorista(costoProveedor) {
    const costo = assertPositiveNumber(costoProveedor, 'El costo');
    const precioMercadoEstimado = costo * 2.5;
    const precioVentaSugerido = precioMercadoEstimado * 0.75;
    const gananciaNeta = precioVentaSugerido - costo;

    return {
        costo: formatARS(costo),
        precioMercado: formatARS(precioMercadoEstimado),
        precioVentaSugerido: formatARS(precioVentaSugerido),
        gananciaNeta: formatARS(gananciaNeta),
        rentabilidad: `${((gananciaNeta / costo) * 100).toFixed(0)}%`,
        gananciaNumerica: gananciaNeta
    };
}

function rankearProductos(productos, palabrasTendencia = []) {
    const tendencias = palabrasTendencia
        .filter((palabra) => typeof palabra === 'string')
        .map((palabra) => palabra.toLocaleLowerCase('es-AR'));

    return productos
        .map((producto) => {
            const nombre = String(producto.producto || '');
            const esTendencia = tendencias.some((palabra) =>
                nombre.toLocaleLowerCase('es-AR').includes(palabra)
            );
            const ganancia = Number(producto.gananciaNumerica);

            return {
                ...producto,
                esTendencia,
                score: ganancia * (esTendencia ? 1.5 : 1)
            };
        })
        .sort((a, b) => b.score - a.score);
}

module.exports = { calcularJugadaMayorista, rankearProductos, formatARS };
