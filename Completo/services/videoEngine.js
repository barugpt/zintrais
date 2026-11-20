const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isIP } = require('node:net');
const axios = require('axios');
const textToSpeech = require('@google-cloud/text-to-speech');
const { generarRespuestaVenta } = require('./aiEngine');

const JSON2VIDEO_API = 'https://api.json2video.com/v2';
const AUDIO_DIRECTORY = path.join(__dirname, '..', 'public', 'audios');
const MAX_SAVED_AUDIO_FILES = 20;
const MAX_POLL_TIME_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;

// Valida los datos antes de enviar solicitudes a los servicios externos.
function validarDatosGuion(producto, precio) {
    if (typeof producto !== 'string' || !producto.trim() || producto.length > 200) {
        throw new TypeError('El producto debe tener entre 1 y 200 caracteres.');
    }

    const precioNumerico = Number(precio);
    if (!Number.isFinite(precioNumerico) || precioNumerico <= 0) {
        throw new TypeError('El precio debe ser un número mayor que cero.');
    }

    return { producto: producto.trim(), precio: precioNumerico };
}

function validarUrlImagen(urlImagenProducto) {
    if (typeof urlImagenProducto !== 'string' || urlImagenProducto.length > 2048) {
        throw new TypeError('La URL de la imagen debe ser una dirección HTTPS válida.');
    }

    let url;
    try {
        url = new URL(urlImagenProducto);
    } catch {
        throw new TypeError('La URL de la imagen no es válida.');
    }

    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password ||
        isIP(host) || host === 'localhost' || host.endsWith('.localhost') ||
        host.endsWith('.local') || host.endsWith('.internal')) {
        throw new TypeError('La imagen debe estar en una URL HTTPS pública.');
    }

    return url.toString();
}

function validarImagenSubida(imagen) {
    if (!imagen || !Buffer.isBuffer(imagen.buffer) || imagen.buffer.length === 0) {
        throw new TypeError('Selecciona una imagen JPG, PNG o WebP.');
    }

    const bytes = imagen.buffer;
    let contentType;
    let extension;
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        contentType = 'image/png';
        extension = 'png';
    } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
        contentType = 'image/jpeg';
        extension = 'jpg';
    } else if (
        bytes.toString('ascii', 0, 4) === 'RIFF' &&
        bytes.toString('ascii', 8, 12) === 'WEBP'
    ) {
        contentType = 'image/webp';
        extension = 'webp';
    } else {
        throw new TypeError('El archivo no parece ser una imagen JPG, PNG o WebP válida.');
    }

    return { buffer: bytes, contentType, extension };
}

// Genera el guion con Groq y lo sintetiza como MP3 con voz argentina.
async function crearGuionYAudio(producto, precio) {
    const datos = validarDatosGuion(producto, precio);
    const prompt = [
        'Escribe un guion hablado de aproximadamente 15 segundos para un video de TikTok.',
        'Usa español argentino natural, cordial y profesional.',
        'No inventes características, stock, descuentos, garantías ni plazos de entrega.',
        `Producto: ${datos.producto}.`,
        `Precio informado: ${datos.precio} pesos argentinos.`,
        'Devuelve únicamente el texto que se leerá en voz alta.'
    ].join(' ');
    const guion = await generarRespuestaVenta(prompt);
    const cliente = new textToSpeech.TextToSpeechClient();

    try {
        const [respuesta] = await cliente.synthesizeSpeech({
            input: { text: guion },
            voice: { languageCode: 'es-AR', name: 'es-AR-Standard-B' },
            audioConfig: { audioEncoding: 'MP3' }
        });

        if (!respuesta.audioContent) {
            throw new Error('Google Text-to-Speech no devolvió contenido de audio.');
        }

        return {
            datos,
            guion,
            audio: Buffer.from(respuesta.audioContent)
        };
    } catch (error) {
        if (/default credentials|could not find default credentials/i.test(error.message)) {
            const configuracionError = new Error(
                'Configura las credenciales ADC de Google Cloud Text-to-Speech.'
            );
            configuracionError.status = 503;
            throw configuracionError;
        }
        throw error;
    } finally {
        cliente.close();
    }
}

async function limpiarAudiosAntiguos() {
    const archivos = await fs.readdir(AUDIO_DIRECTORY, { withFileTypes: true });
    const audios = await Promise.all(
        archivos
            .filter((archivo) => archivo.isFile() && /^audio_[\da-f-]+\.mp3$/i.test(archivo.name))
            .map(async (archivo) => ({
                nombre: archivo.name,
                modificado: (await fs.stat(path.join(AUDIO_DIRECTORY, archivo.name))).mtimeMs
            }))
    );
    audios.sort((a, b) => b.modificado - a.modificado);
    await Promise.all(
        audios.slice(MAX_SAVED_AUDIO_FILES).map(({ nombre }) =>
            fs.unlink(path.join(AUDIO_DIRECTORY, nombre))
        )
    );
}

async function generarGuionYVoz(producto, precio) {
    const { guion, audio } = await crearGuionYAudio(producto, precio);
    await fs.mkdir(AUDIO_DIRECTORY, { recursive: true });
    const nombre = `audio_${randomUUID()}.mp3`;
    await fs.writeFile(path.join(AUDIO_DIRECTORY, nombre), audio);
    await limpiarAudiosAntiguos();
    return { guion, audioUrl: `/audios/${nombre}` };
}

async function subirMedioAJson2Video(buffer, contentType, extension) {
    const apiKey = process.env.JSON2VIDEO_API_KEY;
    const nombre = `sintra-${randomUUID()}.${extension}`;
    const { data: registro } = await axios.post(
        `${JSON2VIDEO_API}/media/file`,
        { name: nombre, contentType, size: buffer.length, folder: 'temp' },
        {
            timeout: 20000,
            headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' }
        }
    );

    if (!registro?.uploadUrl || !registro?.fileUrl) {
        throw new Error('JSON2Video no devolvió las direcciones necesarias para subir el audio.');
    }

    const uploadUrl = new URL(registro.uploadUrl);
    const fileUrl = new URL(registro.fileUrl);
    if (uploadUrl.protocol !== 'https:' || fileUrl.protocol !== 'https:') {
        throw new Error('JSON2Video devolvió una URL de medios no segura.');
    }

    await axios.put(uploadUrl.toString(), buffer, {
        timeout: 60000,
        maxBodyLength: buffer.length,
        headers: { 'Content-Type': contentType }
    });

    return fileUrl.toString();
}

// Consulta el estado del render hasta obtener el MP4 o alcanzar el tiempo límite.
async function esperarVideo(projectId, apiKey) {
    const limite = Date.now() + MAX_POLL_TIME_MS;

    while (Date.now() < limite) {
        const { data } = await axios.get(`${JSON2VIDEO_API}/movies`, {
            params: { project: projectId },
            timeout: 20000,
            headers: { 'x-api-key': apiKey }
        });
        const movie = data?.movie;

        if (movie?.status === 'done') {
            if (typeof movie.url !== 'string' || !movie.url.startsWith('https://')) {
                throw new Error('JSON2Video terminó el render, pero no devolvió un enlace HTTPS al MP4.');
            }
            return movie.url;
        }
        if (movie?.status === 'error' || movie?.status === 'timeout') {
            throw new Error(movie.message || `JSON2Video informó que el render terminó con estado ${movie.status}.`);
        }
        if (!movie) {
            throw new Error('JSON2Video devolvió un estado de render inesperado.');
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    const error = new Error('Se agotó el tiempo de espera del render de JSON2Video.');
    error.status = 504;
    throw error;
}

async function generarVideoAutomatico(producto, precio, imagenProducto) {
    const datos = validarDatosGuion(producto, precio);
    const imagenSubida = imagenProducto && typeof imagenProducto === 'object'
        ? validarImagenSubida(imagenProducto)
        : null;
    const imagenUrlIngresada = typeof imagenProducto === 'string'
        ? validarUrlImagen(imagenProducto)
        : null;
    if (!imagenSubida && !imagenUrlIngresada) {
        throw new TypeError('Selecciona una imagen o proporciona una URL HTTPS pública.');
    }

    const apiKey = process.env.JSON2VIDEO_API_KEY;

    if (!apiKey) {
        const error = new Error('Configura JSON2VIDEO_API_KEY en el archivo .env.');
        error.status = 503;
        throw error;
    }

    const { guion, audio } = await crearGuionYAudio(datos.producto, datos.precio);
    // JSON2Video necesita una URL accesible para incorporar el archivo de audio.
    const audioUrl = await subirMedioAJson2Video(audio, 'audio/mpeg', 'mp3');
    const imagenUrl = imagenSubida
        ? await subirMedioAJson2Video(
            imagenSubida.buffer,
            imagenSubida.contentType,
            imagenSubida.extension
        )
        : imagenUrlIngresada;
    const { data: render } = await axios.post(
        `${JSON2VIDEO_API}/movies`,
        {
            resolution: 'instagram-story',
            'client-data': { producto: datos.producto, precio: datos.precio, guion },
            elements: [
                { type: 'audio', src: audioUrl, volume: 1, duration: 15 }
            ],
            scenes: [{
                duration: 15,
                elements: [
                    { type: 'image', src: imagenUrl, duration: 15 },
                    {
                        type: 'text',
                        text: `${datos.producto} · $${datos.precio.toLocaleString('es-AR')}`,
                        duration: 15
                    }
                ]
            }]
        },
        {
            timeout: 30000,
            headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' }
        }
    );

    if (!render?.project) {
        throw new Error('JSON2Video no devolvió el identificador del render.');
    }

    const videoUrl = await esperarVideo(render.project, apiKey);
    return { videoUrl, guion };
}

module.exports = {
    generarVideoAutomatico,
    generarGuionYVoz,
    validarDatosGuion,
    validarUrlImagen,
    validarImagenSubida
};
