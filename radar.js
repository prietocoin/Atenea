const cheerio = require('cheerio');

const HOO_URL = 'https://hoo.jairokov.com';

async function ejecutarRadarCompleto() {
  const tasas = {};

  try {
    console.log("📡 Conectando a https://hoo.jairokov.com...");

    // 1. Intentar endpoint JSON /radar usando fetch nativo de Node 18
    try {
      const resRadar = await fetch(`${HOO_URL}/radar`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(6000)
      });

      if (resRadar.ok) {
        const textRaw = await resRadar.text();
        const json = JSON.parse(textRaw);
        if (json && json.rates && Object.keys(json.rates).length > 0) {
          console.log("✅ Tasas leídas vía JSON API:", json.rates);
          return json.rates;
        }
      }
    } catch (e) {
      // Fallback si la ruta JSON devuelve HTML o falla
    }

    // 2. Extractor DOM con Cheerio sobre la grilla visual (.grid.grid-cols-2 > div)
    const resHome = await fetch(HOO_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(6000)
    });

    if (!resHome.ok) {
      throw new Error(`Estado HTTP ${resHome.status} al acceder a Hoo`);
    }

    const html = await resHome.text();
    const $ = cheerio.load(html);

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

    console.log("✅ Tasas extraídas del DOM de Hoo:", tasas);
    return tasas;

  } catch (err) {
    console.error("❌ Error en el lector de Hoo:", err.message);
    return tasas;
  }
}

module.exports = { ejecutarRadarCompleto };
