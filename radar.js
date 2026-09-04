const cheerio = require('cheerio');

const HOO_URL = 'https://hoo.jairokov.com';

async function ejecutarRadarCompleto() {
  const tasas = {};

  try {
    console.log("📡 Conectando a https://hoo.jairokov.com...");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    // 1. Intentar primero el endpoint JSON /radar
    const resRadar = await fetch(`${HOO_URL}/radar`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (resRadar.ok) {
      const textRaw = await resRadar.text();
      try {
        const json = JSON.parse(textRaw);
        if (json && json.rates && Object.keys(json.rates).length > 0) {
          console.log("✅ Tasas leídas vía JSON API:", json.rates);
          return json.rates;
        }
      } catch (e) {
        // Si /radar devuelve HTML, el flujo continúa al scraper del DOM
      }
    }

    // 2. Extractor exacto del DOM visual basado en tu inspección de pantalla
    const controllerHome = new AbortController();
    const timeoutHome = setTimeout(() => controllerHome.abort(), 8000);

    const resHome = await fetch(HOO_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: controllerHome.signal
    });
    clearTimeout(timeoutHome);

    if (!resHome.ok) {
      throw new Error(`Estado HTTP ${resHome.status} al acceder a Hoo`);
    }

    const html = await resHome.text();
    const $ = cheerio.load(html);

    // Selector dirigido a los contenedores `.grid.grid-cols-2 > div` de la captura
    $('.grid.grid-cols-2 > div').each((_, el) => {
      const spans = $(el).find('span');
      if (spans.length >= 2) {
        const moneda = $(spans[0]).text().trim().toUpperCase();
        const valorRaw = $(spans[1]).text().trim().replace(/,/g, '');
        const valor = parseFloat(valorRaw);

        if (moneda && !isNaN(valor) && valor > 0) {
          tasas[moneda] = valor;
        }
      }
    });

    console.log("✅ Tasas extraídas exactamente desde el DOM de Hoo:", tasas);
    return tasas;

  } catch (err) {
    console.error("❌ Error en el lector de Hoo:", err.message);
    return tasas;
  }
}

module.exports = { ejecutarRadarCompleto };
