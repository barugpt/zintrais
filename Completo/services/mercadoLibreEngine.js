const { formatARS } = require('./tradingEngine');

const COMISION_MERCADO_LIBRE = 0.14;
const COMISION_PAGO = 0.066;
const IMPUESTOS_ESTIMADOS = 0.05;
const COSTO_TOTAL_PLATAFORMAS =
    COMISION_MERCADO_LIBRE + COMISION_PAGO + IMPUESTOS_ESTIMADOS;

function calcularPrecioMercadoLibre(costoProtrade, margenDeseado) {
    const costo = Number(costoProtrade);
    const margen = Number(margenDeseado);

    if (!Number.isFinite(costo) || costo <= 0) {
        throw new TypeError('El costo debe ser un número mayor que cero.');
    }
    if (!Number.isFinite(margen) || margen < 0 || margen > 10) {
        throw new TypeError('El margen debe estar entre 0 y 10 (0 a 1000%).');
    }

    const precioVentaNecesario =
        (costo * (1 + margen)) / (1 - COSTO_TOTAL_PLATAFORMAS);
    const gananciaNeta =
        precioVentaNecesario * (1 - COSTO_TOTAL_PLATAFORMAS) - costo;

    return {
        costo: formatARS(costo),
        precioPublicar: formatARS(precioVentaNecesario),
        gananciaNeta: formatARS(gananciaNeta),
        comisiones: 'Estimación: ML 14% + pagos 6,6% + impuestos 5%',
        porcentajeCostos: COSTO_TOTAL_PLATAFORMAS * 100
    };
}

module.exports = { calcularPrecioMercadoLibre };
