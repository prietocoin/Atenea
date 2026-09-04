const { ProxyAgent } = require('undici');

// Configuración de Proxy
const PROXY_IP = process.env.PROXY_IP || '46.203.210.178';
const PROXY_PORT = process.env.PROXY_PORT || '5625';
const PROXY_USER = process.env.PROXY_USER || 'ttsctjnu';
const PROXY_PASS = process.env.PROXY_PASS || 'ul2gxifzz0pk';

const PROXY_URL = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_IP}:${PROXY_PORT}`;
const proxyAgent = new ProxyAgent(PROXY_URL);

/**
 * Petición HTTP con soporte de Proxy y Fallback directo
 */
async function consultarHoo(endpoint) {
  const url = `https://hoo.jairokov.com${endpoint}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/html, */*'
  };

  // Intento 1: A través de Proxy
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers,
      dispatcher: proxyAgent,
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) return await res.text();
  } catch (e) {
    console.warn(`⚠️ Intento vía Proxy a ${url} falló: ${e.message}. Probando conexión directa...`);
  }

  // Intento 2: Conexión directa
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return await res.text();
  } catch (e) {
    console.error(`❌ Error en conexión directa a ${url}: ${e.message}`);
    return null;
  }

  return null;
}

/**
 * Extractor secundario por Expresión Regular sobre HTML/Texto plano 
 * de las tarjetas de Hoo Monitor (PEN, COP, CLP, ARS, MXN, VES, PYG, DOP, CRC, EUR, CAD, BOB, BRL, BCV)
 */
function extraerTasasDesdeTextoHTML(textoRaw) {
  const tasas = {};
  const listaMonedas = ["PEN", "COP", "CLP", "ARS", "MXN", "VES", "PYG", "DOP", "CRC", "EUR", "CAD", "BOB", "BRL", "BCV"];

  listaMonedas.forEach(moneda => {
    // Busca patrones tipo "COP": 3130 o COP ... 3130 en el HTML
    const regex = new RegExp(`"${moneda}"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`, 'i');
    const match = textoRaw.match(regex);

    if (match && match[1]) {
      tasas[moneda] = parseFloat(match[1]);
    } else {
      // Búsqueda flexible por estructura de tarjeta HTML/DOM
      const regexDOM = new RegExp(`${moneda}[\\s\\S]*?([0-9]+(?:\\.[0-9]+)?)`, 'i');
      const matchDOM = textoRaw.match(regexDOM);
      if (matchDOM && matchDOM[1]) {
        const val = parseFloat(matchDOM[1]);
        if (!isNaN(val) && val > 0) tasas[moneda] = val;
      }
    }
  });

  return tasas;
}

/**
 * Función principal del ejecutor Radar
 */
async function ejecutarRadarCompleto() {
  console.log(`🚀 [Atenea Radar] Capturando grilla oficial desde https://hoo.jairokov.com...`);

  // 1. Intento de consumo de API JSON /radar
  const respuestaRadar = await consultarHoo('/radar');

  if (respuestaRadar) {
    try {
      const json = JSON.parse(respuestaRadar);
      if (json && json.rates && Object.keys(json.rates).length > 0) {
        console.log("✅ [Atenea Radar] Tasas capturadas exitosamente vía JSON API:", json.rates);
        return json.rates;
      }
    } catch (e) {
      console.warn("⚠️ La respuesta de /radar fue HTML. Ejecutando extractor DOM sobre la captura...");
      const tasasExtraidas = extraerTasasDesdeTextoHTML(respuestaRadar);
      if (Object.keys(tasasExtraidas).length > 0) {
        console.log("✅ [Atenea Radar] Tasas extraídas desde el HTML de /radar:", tasasExtraidas);
        return tasasExtraidas;
      }
    }
  }

  // 2. Fallback: Captura visual del frontend https://hoo.jairokov.com/
  console.log("📡 Intentando captura alternativa desde la raíz de Hoo Monitor...");
  const respuestaHome = await consultarHoo('/');
  if (respuestaHome) {
    const tasasHome = extraerTasasDesdeTextoHTML(respuestaHome);
    if (Object.keys(tasasHome).length > 0) {
      console.log("✅ [Atenea Radar] Tasas extraídas desde el frontend principal:", tasasHome);
      return tasasHome;
    }
  }

  console.error("❌ No se pudieron capturar las tasas desde hoo.jairokov.com");
  return {};
}

module.exports = { ejecutarRadarCompleto };
