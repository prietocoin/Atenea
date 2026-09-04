const { ProxyAgent } = require('undici');

const MONEDAS = ["PEN", "COP", "CLP", "ARS", "MXN", "VES", "PYG", "DOP", "CRC", "EUR", "CAD", "BOB", "BRL", "BCV"];

const PROXY_IP = process.env.PROXY_IP || '46.203.210.178';
const PROXY_PORT = process.env.PROXY_PORT || '5625';
const PROXY_USER = process.env.PROXY_USER || 'ttsctjnu';
const PROXY_PASS = process.env.PROXY_PASS || 'ul2gxifzz0pk';

let proxyAgent = null;
try {
  const proxyUrl = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_IP}:${PROXY_PORT}`;
  proxyAgent = new ProxyAgent(proxyUrl);
} catch (e) {
  console.error("⚠️ Error inicializando ProxyAgent:", e.message);
}

async function consultarHoo(endpoint) {
  const url = `https://hoo.jairokov.com${endpoint}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/html, */*'
  };

  // 1. Intento Directo
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return await res.text();
  } catch (e) {}

  // 2. Intento vía Proxy
  if (proxyAgent) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { headers, dispatcher: proxyAgent, signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) return await res.text();
    } catch (e) {}
  }

  return null;
}

async function ejecutarRadarCompleto() {
  const resultados = {};
  try {
    console.log("🚀 [Atenea Radar] Consultando tasas desde hoo.jairokov.com...");
    const raw = await consultarHoo('/radar');
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (data && data.rates) {
          MONEDAS.forEach(m => {
            if (data.rates[m] !== undefined) {
              resultados[m] = parseFloat(data.rates[m]);
            }
          });
          if (Object.keys(resultados).length > 0) {
            console.log("✅ [Atenea Radar] Tasas obtenidas correctamente:", resultados);
            return resultados;
          }
        }
      } catch (e) {
        // En caso de respuesta HTML/Texto
        MONEDAS.forEach(m => {
          const reg = new RegExp(`"${m}"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`, 'i');
          const match = raw.match(reg);
          if (match && match[1]) {
            resultados[m] = parseFloat(match[1]);
          }
        });
      }
    }
  } catch (err) {
    console.error("❌ Error protegido en radar.js:", err.message);
  }
  return resultados;
}

module.exports = { ejecutarRadarCompleto };
