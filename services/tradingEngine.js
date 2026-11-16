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

const MARGEN_GANANCIA = 0.5;
const MULTIPLICADOR_TENDENCIA = 2;
const PALABRAS_ALTA_ROTACION = [
    'termo',
    'auricular',
    'parlante',
    'led',
    'cargador',
    'mate'
];

function calcularJugadaMayorista(costoProveedor, precioWeb) {
    const costo = assertPositiveNumber(costoProveedor, 'El costo');
    const precioVenta = costo * (1 + MARGEN_GANANCIA);
    const gananciaNeta = precioVenta - costo;

    const resultado = {
        costo: formatARS(costo),
        precioVentaSugerido: formatARS(precioVenta),
        gananciaNeta: formatARS(gananciaNeta),
        rentabilidad: `${((gananciaNeta / costo) * 100).toFixed(0)}%`,
        precioVentaNumerico: precioVenta,
        gananciaNumerica: gananciaNeta
    };

    if (precioWeb !== undefined) {
        const precioCompetencia = assertPositiveNumber(precioWeb, 'El precio web');
        resultado.precioWeb = formatARS(precioCompetencia);
        resultado.precioWebNumerico = precioCompetencia;
        resultado.aceptado = precioVenta < precioCompetencia;
    }

    return resultado;
}

function filtrarProductosCompetitivos(productos) {
    return productos
        .map((producto) => {
            if (producto.precioWeb === undefined) {
                throw new TypeError('Cada producto debe incluir un precio web válido.');
            }
            const calculo = calcularJugadaMayorista(
                producto.costoProveedor,
                producto.precioWeb
            );
            return { ...producto, ...calculo };
        })
        .filter((producto) => producto.aceptado);
}

function rankearProductos(productos, palabrasTendencia = []) {
    const tendencias = [
        ...PALABRAS_ALTA_ROTACION,
        ...palabrasTendencia
            .filter((palabra) => typeof palabra === 'string')
            .map((palabra) => palabra.toLocaleLowerCase('es-AR'))
    ];

    return productos
        .map((producto) => {
            const nombre = String(producto.producto || '').toLocaleLowerCase('es-AR');
            const esTendencia = tendencias.some((palabra) => nombre.includes(palabra));
            const ganancia = Number(producto.gananciaNumerica);

            return {
                ...producto,
                esTendencia,
                score: ganancia * (esTendencia ? MULTIPLICADOR_TENDENCIA : 1)
            };
        })
        .sort((a, b) => b.score - a.score);
}

module.exports = {
    calcularJugadaMayorista,
    filtrarProductosCompetitivos,
    rankearProductos,
    formatARS
};
