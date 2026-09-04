const cheerio = require('cheerio');

const HOO_URL = 'https://hoo.jairokov.com/';

async function ejecutarRadarCompleto() {
  const tasasExtraidas = {};

  try {
    console.log("📡 Conectando a Hoo Monitor...");
    const res = await fetch(HOO_URL, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) {
      console.error(`⚠️ Estado HTTP ${res.status} al acceder a Hoo`);
      return {};
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Réplica exacta del código validado en la consola del navegador
    $('.grid.grid-cols-2 > div').each((_, tarjeta) => {
      const spans = $(tarjeta).find('span');
      if (spans.length >= 2) {
        const moneda = $(spans[0]).text().trim().toUpperCase();
        const valorTexto = $(spans[1]).text().trim().replace(/,/g, '');
        const valor = parseFloat(valorTexto);

        if (moneda.length === 3 && !isNaN(valor) && valor > 0) {
          tasasExtraidas[moneda] = valor;
        }
      }
    });

    console.log("✅ [Atenea Radar] Tasas capturadas con éxito:", tasasExtraidas);
    return tasasExtraidas;

  } catch (err) {
    console.error("❌ Error de comunicación con Hoo:", err.message);
    return {};
  }
}

module.exports = { ejecutarRadarCompleto };
