const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

process.on('uncaughtException', (err) => console.error('⚠️ Excepción aislada:', err.message));
process.on('unhandledRejection', (reason) => console.error('⚠️ Promesa rechazada aislada:', reason));

const DEFAULT_DB_URL = 'postgres://postgres:lrh48me5dz3pqtgg214j@automat_postgres-db:5432/automat';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || DEFAULT_DB_URL,
  ssl: false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => console.error('⚠️ Error en PostgreSQL:', err.message));

// Función de Truncado según Regla de Precisión
function aplicarReglaPrecision(val) {
  const v = Math.abs(parseFloat(val) || 0);
  if (v === 0) return 0;

  if (v > 499.99) {
    return Math.trunc(v);
  } else if (v < 10) {
    if (v < 1) {
      const magnitud = Math.floor(Math.log10(v));
      const f = Math.pow(10, 2 - magnitud);
      return Math.trunc(v * f) / f;
    }
    return Math.trunc(v * 1000) / 1000;
  } else {
    return Math.trunc(v * 100) / 100;
  }
}

function calcularTallaAutomatica(conteo) {
  if (conteo <= 2) return 'S';
  if (conteo <= 5) return 'M';
  if (conteo <= 8) return 'L';
  return 'XL';
}

const SEED_SOCIOS_CONFIG = {
  "OMAR": {
    "id_grupo": "120363323877732465@g.us",
    "nombre": "Omar",
    "roles": "SOCIO",
    "moneda_socio": "USDT",
    "talla": "M",
    "whatsapp": "120363323877732465@g.us",
    "pen": "D", "cop": "D", "clp": "D", "ars": "D", "ves": "D", "brl": "P", "mxn": "D", "pyg": "D", "usd": "P", "ecu": "D", "eur": "P", "usdt": "A",
    "cartelera_paises": [
      { "pais": "Brazil", "moneda": "BRL", "activo": true, "orden": 1 },
      { "pais": "Colombia", "moneda": "COP", "activo": true, "orden": 2 },
      { "pais": "Chile", "moneda": "CLP", "activo": true, "orden": 3 },
      { "pais": "Peru", "moneda": "PEN", "activo": true, "orden": 4 }
    ],
    "ajustes": { "P-USDT": 1.0, "D-USDT": 1.0, "P-PYUSD": -0.8, "D-PYUSD": 1.2, "P-PEN": -0.976, "D-PEN": 1.026, "P-COP": -0.976, "D-COP": 1.03, "P-CLP": -0.962, "D-CLP": 1.042, "P-ARS": -0.962, "D-ARS": 1.042, "D-USD": 1.087, "D-ECU": 1.064, "P-BRL": 0.9709, "D-BRL": -1.0309, "P-VES": -0.976, "D-VES": 1.026, "P-PYG": -0.97, "D-PYG": 1.03, "P-EUR": 0.962, "D-EUR": -1.042, "P-BOB": -0.9259, "D-BOB": 1.087 }
  },
  "CHASAN": {
    "id_grupo": "120363339357414946@g.us",
    "nombre": "Chasan",
    "roles": "SOCIO",
    "moneda_socio": "USDT",
    "talla": "M",
    "whatsapp": "120363339357414946@g.us",
    "pen": "D", "cop": "D", "clp": "D", "ars": "D", "ves": "D", "brl": "D", "mxn": "D", "pyg": "D", "usd": "P", "ecu": "D", "eur": "D", "usdt": "A",
    "cartelera_paises": [
      { "pais": "Peru", "moneda": "PEN", "activo": true, "orden": 1 },
      { "pais": "Chile", "moneda": "CLP", "activo": true, "orden": 2 },
      { "pais": "Colombia", "moneda": "COP", "activo": true, "orden": 3 },
      { "pais": "Argentina", "moneda": "ARS", "activo": true, "orden": 4 }
    ],
    "ajustes": { "P-USDT": 1.0, "D-USDT": 1.0, "P-PYUSD": -0.8, "D-PYUSD": 1.2, "P-PEN": -0.976, "D-PEN": 1.026, "P-COP": -0.976, "D-COP": 1.03, "P-CLP": 0.98, "D-CLP": -1.02, "P-ARS": -0.962, "D-ARS": 1.042, "D-USD": 1.087, "P-ECU": -0.96, "D-ECU": 1.042, "P-MXN": 0.97, "D-MXN": -1.03, "P-BRL": -0.952, "D-BRL": 1.053, "P-PYG": -0.962, "D-PYG": 1.042, "P-EUR": -0.9259, "D-EUR": 1.087, "P-DOP": -0.943, "D-DOP": 1.064, "P-BOB": -0.9259, "D-BOB": 1.087, "P-CRC": -0.943, "D-CRC": 1.064, "P-CAD": -0.962, "D-CAD": 1.042 }
  },
  "JOSEM": {
    "id_grupo": "120363345944393252@g.us",
    "nombre": "JoseM",
    "roles": "SOCIO",
    "moneda_socio": "USDT",
    "talla": "L",
    "whatsapp": "",
    "pen": "D", "cop": "D", "clp": "P", "ars": "D", "ves": "D", "brl": "D", "mxn": "D", "pyg": "D", "usd": "D", "ecu": "D", "eur": "D", "usdt": "A",
    "cartelera_paises": [
      { "pais": "Peru", "moneda": "PEN", "activo": true, "orden": 1 },
      { "pais": "Chile", "moneda": "CLP", "activo": true, "orden": 2 },
      { "pais": "Colombia", "moneda": "COP", "activo": true, "orden": 3 },
      { "pais": "Argentina", "moneda": "ARS", "activo": true, "orden": 4 },
      { "pais": "Brazil", "moneda": "BRL", "activo": true, "orden": 5 },
      { "pais": "Paraguay", "moneda": "PYG", "activo": true, "orden": 6 }
    ],
    "ajustes": { "P-USDT": 1.0, "D-USDT": 1.0, "P-PYUSD": -0.8, "D-PYUSD": 1.2, "P-PEN": -0.976, "D-PEN": 1.026, "P-COP": -0.976, "D-COP": 1.03, "P-CLP": 0.98, "D-CLP": -1.02, "P-ARS": -0.962, "D-ARS": 1.042, "D-USD": 1.087, "P-ECU": -0.94, "D-ECU": 1.064, "P-MXN": -0.943, "D-MXN": 1.064, "P-BRL": -0.952, "D-BRL": 1.053, "P-VES": -0.976, "D-VES": 1.026, "P-PYG": -0.962, "D-PYG": 1.042, "P-EUR": -0.9259, "D-EUR": 1.087, "P-DOP": -0.943, "D-DOP": 1.064, "P-BOB": -0.9259, "D-BOB": 1.087, "P-CRC": -0.943, "D-CRC": 1.064, "P-CAD": -0.962, "D-CAD": 1.042 }
  },
  "NELSY": {
    "id_grupo": "GRP_NELSY",
    "nombre": "Nelsy",
    "roles": "SOCIO",
    "moneda_socio": "USDT",
    "talla": "L",
    "whatsapp": "",
    "pen": "D", "cop": "D", "clp": "D", "ars": "D", "ves": "D", "brl": "D", "mxn": "D", "pyg": "D", "usd": "P", "ecu": "D", "eur": "D", "usdt": "A",
    "cartelera_paises": [
      { "pais": "Peru", "moneda": "PEN", "activo": true, "orden": 1 },
      { "pais": "Chile", "moneda": "CLP", "activo": true, "orden": 2 },
      { "pais": "Colombia", "moneda": "COP", "activo": true, "orden": 3 },
      { "pais": "Argentina", "moneda": "ARS", "activo": true, "orden": 4 },
      { "pais": "Brazil", "moneda": "BRL", "activo": true, "orden": 5 },
      { "pais": "Paraguay", "moneda": "PYG", "activo": true, "orden": 6 }
    ],
    "ajustes": { "P-USDT": 1.0, "D-USDT": 1.0, "P-PYUSD": -0.8, "D-PYUSD": 1.2, "P-PEN": -0.976, "D-PEN": 1.026, "P-COP": -0.976, "D-COP": 1.03, "P-CLP": -0.962, "D-CLP": 1.042, "P-ARS": 0.98, "D-ARS": -1.02, "P-USD": -0.93, "D-USD": 1.087, "P-ECU": -0.94, "D-ECU": 1.064, "P-MXN": -0.943, "D-MXN": 1.064, "P-BRL": -0.952, "D-BRL": 1.053, "P-VES": 0.99, "P-PYG": -0.97, "D-PYG": 1.03, "P-EUR": -0.926, "D-EUR": 1.087, "P-DOP": -0.943, "D-DOP": 1.064, "P-BOB": -0.926, "D-BOB": 1.087, "P-CRC": -0.943, "D-CRC": 1.064, "P-CAD": -0.962, "D-CAD": 1.042 }
  },
  "MERLI": {
    "id_grupo": "120363307631639715@g.us",
    "nombre": "Merli",
    "roles": "SOCIO",
    "moneda_socio": "PEN",
    "talla": "L",
    "whatsapp": "120363307631639715@g.us",
    "pen": "A", "cop": "D", "clp": "D", "ars": "D", "ves": "D", "brl": "D", "mxn": "D", "pyg": "D", "usd": "D", "ecu": "D", "eur": "D", "usdt": "D",
    "cartelera_paises": [
      { "pais": "Chile", "moneda": "CLP", "activo": true, "orden": 1 },
      { "pais": "Colombia", "moneda": "COP", "activo": true, "orden": 2 },
      { "pais": "Argentina", "moneda": "ARS", "activo": true, "orden": 3 },
      { "pais": "Paraguay", "moneda": "PYG", "activo": true, "orden": 4 },
      { "pais": "EEUU-Zelle", "moneda": "USD", "activo": true, "orden": 5 },
      { "pais": "Brazil", "moneda": "BRL", "activo": true, "orden": 6 }
    ],
    "ajustes": { "P-USDT": -0.9259, "D-USDT": 1.087, "P-PEN": -0.967, "D-PEN": 1.047, "P-COP": -0.967, "D-COP": 1.047, "P-CLP": -0.967, "D-CLP": 1.047, "P-ARS": -0.967, "D-ARS": 1.047, "P-VES": -0.967, "D-VES": 1.047 }
  },
  "JAVIER": {
    "id_grupo": "120363401374720092@g.us",
    "nombre": "Javier",
    "roles": "SOCIO",
    "moneda_socio": "USDT",
    "talla": "S",
    "whatsapp": "120363422300818123@g.us",
    "pen": "D", "cop": "D", "clp": "D", "ars": "D", "ves": "D", "brl": "P", "mxn": "D", "pyg": "D", "usd": "D", "ecu": "D", "eur": "D", "usdt": "A",
    "cartelera_paises": [
      { "pais": "Peru", "moneda": "PEN", "activo": true, "orden": 1 },
      { "pais": "Argentina", "moneda": "ARS", "activo": true, "orden": 2 }
    ],
    "ajustes": { "P-PEN": -0.976, "D-PEN": 1.026, "P-ARS": -0.962, "D-ARS": 1.042, "D-ECU": 1.064 }
  }
};

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mercado_tasas (
        id SERIAL PRIMARY KEY,
        id_tasa VARCHAR(20) NOT NULL,
        moneda VARCHAR(10) NOT NULL,
        tasa_base NUMERIC(18, 6) NOT NULL,
        timestamp BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_mercado_tasas_id_tasa ON mercado_tasas(id_tasa);
      CREATE INDEX IF NOT EXISTS idx_mercado_tasas_moneda_ts ON mercado_tasas(moneda, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_mercado_tasas_ts ON mercado_tasas (timestamp ASC);
      CREATE INDEX IF NOT EXISTS idx_cola_fb_ts ON cola_fb (timestamp DESC);
    `);

    await pool.query(`
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS usd VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS pen VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS cop VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS clp VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS ves VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS ars VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS mxn VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS brl VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS pyg VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS dop VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS crc VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS eur VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS cad VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS ecu VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS pan VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS usdt VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS talla VARCHAR(10) DEFAULT 'M';
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(50);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS cartelera_paises JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS ajustes JSONB DEFAULT '{}'::jsonb;
    `);

    for (const [socioKey, config] of Object.entries(SEED_SOCIOS_CONFIG)) {
      const check = await pool.query(
        `SELECT id_grupo FROM nombres_fb WHERE UPPER(TRIM(nombre)) = UPPER(TRIM($1));`,
        [config.nombre]
      );

      const jsonCartelera = JSON.stringify(config.cartelera_paises || []);
      const jsonAjustes = JSON.stringify(config.ajustes || {});

      if (check.rows.length > 0) {
        await pool.query(
          `UPDATE nombres_fb SET 
            roles = COALESCE($1, roles),
            moneda_socio = COALESCE($2, moneda_socio),
            talla = COALESCE($3, talla),
            whatsapp = COALESCE($4, whatsapp),
            pen = COALESCE($5, pen),
            cop = COALESCE($6, cop),
            clp = COALESCE($7, clp),
            ars = COALESCE($8, ars),
            ves = COALESCE($9, ves),
            brl = COALESCE($10, brl),
            mxn = COALESCE($11, mxn),
            pyg = COALESCE($12, pyg),
            usd = COALESCE($13, usd),
            ecu = COALESCE($14, ecu),
            eur = COALESCE($15, eur),
            usdt = COALESCE($16, usdt),
            cartelera_paises = CASE WHEN cartelera_paises = '[]'::jsonb OR cartelera_paises IS NULL THEN $17::jsonb ELSE cartelera_paises END,
            ajustes = CASE WHEN ajustes = '{}'::jsonb OR ajustes IS NULL THEN $18::jsonb ELSE ajustes END
           WHERE UPPER(TRIM(nombre)) = UPPER(TRIM($19));`,
          [
            config.roles, config.moneda_socio, config.talla, config.whatsapp,
            config.pen, config.cop, config.clp, config.ars, config.ves,
            config.brl, config.mxn, config.pyg, config.usd, config.ecu,
            config.eur, config.usdt,
            jsonCartelera, jsonAjustes, config.nombre
          ]
        );
      } else {
        await pool.query(
          `INSERT INTO nombres_fb (
            id_grupo, nombre, roles, moneda_socio, talla, whatsapp,
            pen, cop, clp, ars, ves, brl, mxn, pyg, usd, ecu, eur, usdt,
            cartelera_paises, ajustes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20::jsonb)
          ON CONFLICT DO NOTHING;`,
          [
            config.id_grupo, config.nombre, config.roles, config.moneda_socio, config.talla, config.whatsapp,
            config.pen, config.cop, config.clp, config.ars, config.ves,
            config.brl, config.mxn, config.pyg, config.usd, config.ecu, config.eur, config.usdt,
            jsonCartelera, jsonAjustes
          ]
        );
      }
    }
    console.log('✅ Base de datos sembrada.');

    await pool.query(`
      DROP VIEW IF EXISTS v_comprobantes_auditados CASCADE;
      CREATE VIEW v_comprobantes_auditados AS
      WITH primer_lote AS (
        SELECT id_tasa, timestamp
        FROM mercado_tasas
        ORDER BY timestamp ASC
        LIMIT 1
      ),
      lotes_rangos AS (
        SELECT 
          id_tasa,
          timestamp AS t_inicio,
          LEAD(timestamp) OVER (ORDER BY timestamp ASC) AS t_fin
        FROM (
          SELECT DISTINCT id_tasa, timestamp 
          FROM mercado_tasas
        ) lotes
      )
      SELECT 
        f.hash_largo,
        c.hash_corto,
        c.timestamp AS timestamp_comprobante,
        to_timestamp(c.timestamp) AS fecha_hora_comprobante,
        f.monto,
        UPPER(f.moneda) AS moneda,
        f.banco,
        f.titular,
        f.referencia,
        f.procesado_ia,
        c.nombre_socio_1,
        c.nombre_socio_2,
        c.url_imagen,
        c.conteo,
        COALESCE(lr.id_tasa, (SELECT id_tasa FROM primer_lote), 'T360') AS lote_tasa_asignado,
        
        COALESCE(
          mt.tasa_base, 
          mt_primer.tasa_base,
          CASE WHEN UPPER(f.moneda) IN ('USD', 'USDT', 'PYUSD') THEN 1.0 ELSE NULL END
        ) AS tasa_mercado_aplicada,
        
        CASE 
          WHEN UPPER(f.moneda) IN ('USD', 'USDT', 'PYUSD') THEN ROUND(f.monto::numeric, 2)
          WHEN COALESCE(mt.tasa_base, mt_primer.tasa_base) > 0 
            THEN ROUND((f.monto / COALESCE(mt.tasa_base, mt_primer.tasa_base))::numeric, 2)
          ELSE NULL
        END AS monto_usd_equivalente

      FROM comprobantes_fb f
      INNER JOIN cola_fb c ON f.hash_largo = c.hash_largo
      LEFT JOIN lotes_rangos lr 
        ON c.timestamp >= lr.t_inicio 
       AND (lr.t_fin IS NULL OR c.timestamp < lr.t_fin)
      LEFT JOIN mercado_tasas mt 
        ON mt.id_tasa = lr.id_tasa 
       AND mt.moneda = UPPER(f.moneda)
      LEFT JOIN mercado_tasas mt_primer
        ON mt_primer.id_tasa = (SELECT id_tasa FROM primer_lote)
       AND mt_primer.moneda = UPPER(f.moneda);
    `);
    console.log('✅ Vista v_comprobantes_auditados sincronizada.');
  } catch (err) {
    console.error('⚠️ Error al inicializar esquema en PostgreSQL:', err.message);
  }
}

initDB();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

let borradorTasas = {};

app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/api/test-db', async (req, res) => {
  try {
    const testQuery = await pool.query('SELECT NOW();');
    const countMaster = await pool.query(
      'SELECT COUNT(*) FROM comprobantes_fb f INNER JOIN cola_fb c ON f.hash_largo = c.hash_largo WHERE c.conteo > 1;'
    );
    res.json({
      status: 'OK',
      hora_servidor: testQuery.rows[0].now,
      registros_tabla_maestra: parseInt(countMaster.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', mensaje: err.message });
  }
});

// ENDPOINT PARA OBTENER ÚLTIMAS TASAS PUBLICADAS DEL MERCADO
app.get('/api/tasas/ultimas', async (req, res) => {
  try {
    const lastLotRes = await pool.query(`
      SELECT id_tasa FROM mercado_tasas ORDER BY timestamp DESC, id DESC LIMIT 1;
    `);

    if (lastLotRes.rows.length === 0) {
      return res.json({ id_tasa: 'T360', tasas: { USD: 1.0, USDT: 1.0, PYUSD: 1.2, ECU: 1.0, PAN: 1.0 } });
    }

    const lastIdTasa = lastLotRes.rows[0].id_tasa;
    const ratesRes = await pool.query(
      `SELECT moneda, tasa_base FROM mercado_tasas WHERE id_tasa = $1;`,
      [lastIdTasa]
    );

    const tasasObj = { USD: 1.0, USDT: 1.0, PYUSD: 1.2, ECU: 1.0, PAN: 1.0 };
    ratesRes.rows.forEach(r => {
      tasasObj[r.moneda.toUpperCase()] = parseFloat(r.tasa_base);
    });

    res.json({ id_tasa: lastIdTasa, tasas: tasasObj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- TASAS ---
app.post('/api/tasas/n8n-webhook', (req, res) => {
  try {
    let payload = req.body;
    if (Array.isArray(payload)) payload = payload[0] || {};
    if (payload.json) payload = payload.json;

    borradorTasas = payload;
    console.log('✅ Borrador de tasas actualizado desde n8n:', borradorTasas);
    return res.json({ success: true, message: 'Borrador cargado en memoria', rates: borradorTasas });
  } catch (err) {
    console.error('❌ Error al recibir borrador:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/tasas/fetch-hoo', (req, res) => {
  if (!borradorTasas || Object.keys(borradorTasas).length === 0) {
    return res.status(404).json({ success: false, msg: 'El motor de n8n aún no ha enviado un borrador reciente.' });
  }
  return res.json({ success: true, rates: borradorTasas });
});

app.post('/api/tasas/publicar', async (req, res) => {
  try {
    const { id_tasa, tasas } = req.body;
    const timestamp = Math.floor(Date.now() / 1000);

    if (!tasas || Object.keys(tasas).length === 0) {
      return res.status(400).json({ success: false, message: 'No se enviaron tasas para publicar.' });
    }

    let codigoTasa = id_tasa;
    if (!codigoTasa) {
      const lastRes = await pool.query("SELECT id_tasa FROM mercado_tasas ORDER BY id DESC LIMIT 1;");
      if (lastRes.rows.length > 0) {
        const num = parseInt(lastRes.rows[0].id_tasa.replace('T', '')) + 1;
        codigoTasa = `T${String(num).padStart(3, '0')}`;
      } else {
        codigoTasa = 'T359';
      }
    }

    for (const [moneda, valor] of Object.entries(tasas)) {
      if (valor && !isNaN(valor)) {
        await pool.query(
          `INSERT INTO mercado_tasas (id_tasa, moneda, tasa_base, timestamp) VALUES ($1, $2, $3, $4);`,
          [codigoTasa, moneda.toUpperCase(), parseFloat(valor), timestamp]
        );
      }
    }

    console.log(`✅ Lote ${codigoTasa} guardado exitosamente en PostgreSQL.`);
    res.json({ success: true, id_tasa: codigoTasa, message: `Tasa ${codigoTasa} publicada correctamente` });
  } catch (err) {
    console.error("❌ Error al publicar tasa:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- COMPROBANTES Y CÁLCULO UNIFICADO ---
const getComprobantesHandler = async (req, res) => {
  try {
    const { socio, fechaInicio, hash, soloDuplicados } = req.query;

    let query = `
      SELECT 
        v.hash_largo, 
        v.monto, 
        v.moneda, 
        v.banco, 
        v.referencia, 
        v.titular, 
        v.procesado_ia,
        v.hash_corto, 
        v.url_imagen, 
        v.nombre_socio_1, 
        v.nombre_socio_2, 
        v.timestamp_comprobante AS timestamp, 
        v.conteo, 
        v.lote_tasa_asignado, 
        
        COALESCE(
          v.tasa_mercado_aplicada,
          CASE WHEN UPPER(f.moneda) IN ('USD', 'USDT', 'PYUSD') THEN 1.0 ELSE NULL END
        ) AS tasa_base,
        
        v.monto_usd_equivalente,

        t.tipo_op,

        CASE 
          WHEN UPPER(TRIM(COALESCE(n1.moneda_socio, 'USDT'))) = 'USD' THEN 'USDT'
          ELSE UPPER(TRIM(COALESCE(n1.moneda_socio, 'USDT')))
        END AS moneda_socio_1,
        
        COALESCE(
          mt_s1.tasa_base,
          CASE WHEN UPPER(COALESCE(n1.moneda_socio, 'USDT')) IN ('USD', 'USDT', 'PYUSD') THEN 1.0 ELSE 1.0 END
        ) AS tasa_base_socio_1,
        COALESCE((n1.ajustes->>(t.tipo_op || '-' || v.moneda))::numeric, 1.0) AS factor_1,

        CASE 
          WHEN UPPER(TRIM(COALESCE(n2.moneda_socio, 'USDT'))) = 'USD' THEN 'USDT'
          ELSE UPPER(TRIM(COALESCE(n2.moneda_socio, 'USDT')))
        END AS moneda_socio_2,

        COALESCE(
          mt_s2.tasa_base,
          CASE WHEN UPPER(COALESCE(n2.moneda_socio, 'USDT')) IN ('USD', 'USDT', 'PYUSD') THEN 1.0 ELSE 1.0 END
        ) AS tasa_base_socio_2,
        COALESCE((n2.ajustes->>(t.tipo_op || '-' || v.moneda))::numeric, 1.0) AS factor_2

      FROM v_comprobantes_auditados v
      LEFT JOIN nombres_fb n1 ON UPPER(TRIM(n1.nombre)) = UPPER(TRIM(v.nombre_socio_1))
      LEFT JOIN nombres_fb n2 ON UPPER(TRIM(n2.nombre)) = UPPER(TRIM(v.nombre_socio_2))

      LEFT JOIN mercado_tasas mt_s1
        ON mt_s1.id_tasa = v.lote_tasa_asignado
       AND mt_s1.moneda = CASE WHEN UPPER(COALESCE(n1.moneda_socio, 'USDT')) = 'USD' THEN 'USDT' ELSE UPPER(COALESCE(n1.moneda_socio, 'USDT')) END

      LEFT JOIN mercado_tasas mt_s2
        ON mt_s2.id_tasa = v.lote_tasa_asignado
       AND mt_s2.moneda = CASE WHEN UPPER(COALESCE(n2.moneda_socio, 'USDT')) = 'USD' THEN 'USDT' ELSE UPPER(COALESCE(n2.moneda_socio, 'USDT')) END

      LEFT JOIN LATERAL (
        SELECT COALESCE(
          CASE v.moneda
            WHEN 'PEN' THEN n1.pen
            WHEN 'COP' THEN n1.cop
            WHEN 'CLP' THEN n1.clp
            WHEN 'VES' THEN n1.ves
            WHEN 'ARS' THEN n1.ars
            WHEN 'USD' THEN n1.usd
            ELSE 'D'
          END,
          'D'
        ) AS tipo_op
      ) t ON TRUE

      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    if (soloDuplicados === 'true') {
      query += ` AND v.conteo > 1`;
    }

    if (socio) {
      query += ` AND (v.nombre_socio_1 = $${paramIndex} OR v.nombre_socio_2 = $${paramIndex})`;
      values.push(socio);
      paramIndex++;
    }

    if (fechaInicio) {
      const startTimestamp = Math.floor(new Date(fechaInicio).getTime() / 1000);
      query += ` AND v.timestamp_comprobante >= $${paramIndex}`;
      values.push(startTimestamp);
      paramIndex++;
    }

    if (hash) {
      query += ` AND v.hash_corto = $${paramIndex}`;
      values.push(hash);
      paramIndex++;
    }

    query += ` ORDER BY v.timestamp_comprobante DESC;`;

    const { rows } = await pool.query(query, values);

    const rowsProcesadas = rows.map(row => {
      const monto = parseFloat(row.monto) || 0;
      const tasaBaseOrigen = parseFloat(row.tasa_base) || 1.0;

      // --- SOCIO 1 ---
      let monedaSocio1 = (row.moneda_socio_1 || 'USDT').toUpperCase();
      if (monedaSocio1 === 'USD') monedaSocio1 = 'USDT';
      const tasaBaseSocio1 = parseFloat(row.tasa_base_socio_1) || 1.0;
      const factor1 = Math.abs(parseFloat(row.factor_1) || 1.0);

      const tasaCrossBase1 = tasaBaseSocio1 > 0 ? (tasaBaseOrigen / tasaBaseSocio1) : tasaBaseOrigen;
      const tasa1Raw = tasaCrossBase1 * factor1;
      const tasa1 = aplicarReglaPrecision(tasa1Raw);

      const m1Socio = tasa1 > 0 ? parseFloat((monto / tasa1).toFixed(2)) : 0;
      const m1Usdt = tasaBaseSocio1 > 0 ? parseFloat((m1Socio / tasaBaseSocio1).toFixed(2)) : m1Socio;

      // --- SOCIO 2 ---
      let monedaSocio2 = (row.moneda_socio_2 || 'USDT').toUpperCase();
      if (monedaSocio2 === 'USD') monedaSocio2 = 'USDT';
      const tasaBaseSocio2 = parseFloat(row.tasa_base_socio_2) || 1.0;
      const factor2 = Math.abs(parseFloat(row.factor_2) || 1.0);

      const tasaCrossBase2 = tasaBaseSocio2 > 0 ? (tasaBaseOrigen / tasaBaseSocio2) : tasaBaseOrigen;
      const tasa2Raw = tasaCrossBase2 * factor2;
      const tasa2 = aplicarReglaPrecision(tasa2Raw);

      const m2Socio = tasa2 > 0 ? parseFloat((monto / tasa2).toFixed(2)) : 0;
      const m2Usdt = tasaBaseSocio2 > 0 ? parseFloat((m2Socio / tasaBaseSocio2).toFixed(2)) : m2Socio;

      return {
        ...row,
        tasa_1: tasa1,
        moneda_socio_1: monedaSocio1,
        m1_socio: m1Socio,
        m1_usdt: m1Usdt,

        tasa_2: tasa2,
        moneda_socio_2: monedaSocio2,
        m2_socio: m2Socio,
        m2_usdt: m2Usdt
      };
    });

    res.json(rowsProcesadas);
  } catch (err) {
    console.error('Error en GET /api/comprobantes:', err.message);
    res.status(500).json({ error: err.message });
  }
};

app.get('/api/comprobantes', getComprobantesHandler);
app.get('/api/cola', getComprobantesHandler);

app.put('/api/comprobantes/:hash_largo', async (req, res) => {
  try {
    const { hash_largo } = req.params;
    const { monto, moneda, banco, referencia, titular, nombre_socio_1, nombre_socio_2 } = req.body;

    const queryMaster = `
      UPDATE comprobantes_fb
      SET monto = $1, moneda = $2, banco = $3, referencia = $4, titular = $5, procesado_ia = TRUE
      WHERE hash_largo = $6 RETURNING *;
    `;

    const { rows } = await pool.query(queryMaster, [
      monto !== undefined && monto !== '' ? parseFloat(monto) : null,
      moneda || null,
      banco ? banco.toUpperCase() : null,
      referencia || null,
      titular ? titular.toUpperCase() : null,
      hash_largo
    ]);

    if (nombre_socio_1 !== undefined || nombre_socio_2 !== undefined) {
      await pool.query(
        `UPDATE cola_fb SET nombre_socio_1 = $1, nombre_socio_2 = $2 WHERE hash_largo = $3;`,
        [nombre_socio_1 || null, nombre_socio_2 || null, hash_largo]
      );
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Error en PUT /api/comprobantes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/comprobantes/:hash_largo', async (req, res) => {
  try {
    const { hash_largo } = req.params;
    const { rows } = await pool.query(`DELETE FROM comprobantes_fb WHERE hash_largo = $1 RETURNING *;`, [hash_largo]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Comprobante no encontrado' });
    }

    await pool.query(`UPDATE cola_fb SET estado = 'DESCARTADO' WHERE hash_largo = $1;`, [hash_largo]);
    res.json({ success: true, message: 'Comprobante eliminado' });
  } catch (err) {
    console.error('Error en DELETE /api/comprobantes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- SOCIOS Y DIRECTORIO ---
app.get('/api/socios', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT nombre FROM (
        SELECT nombre_socio_1 AS nombre FROM cola_fb WHERE nombre_socio_1 IS NOT NULL AND nombre_socio_1 != ''
        UNION
        SELECT nombre_socio_2 AS nombre FROM cola_fb WHERE nombre_socio_2 IS NOT NULL AND nombre_socio_2 != ''
        UNION
        SELECT nombre FROM nombres_fb WHERE roles = 'SOCIO'
      ) s ORDER BY nombre ASC;
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/directorio', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM nombres_fb ORDER BY nombre ASC;');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ELIMINACIÓN DE PERFIL/SOCIO DEL DIRECTORIO
app.delete('/api/directorio/:nombre', async (req, res) => {
  try {
    const { nombre } = req.params;
    if (!nombre) {
      return res.status(400).json({ error: 'Nombre de socio requerido.' });
    }

    const { rows } = await pool.query(
      `DELETE FROM nombres_fb WHERE UPPER(TRIM(nombre)) = UPPER(TRIM($1)) RETURNING *;`,
      [nombre]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Socio no encontrado.' });
    }

    console.log(`🗑️ Socio ${nombre} eliminado del directorio nombres_fb.`);
    res.json({ success: true, message: `Socio ${nombre} eliminado correctamente.` });
  } catch (err) {
    console.error('Error al borrar socio:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ENDPOINT UNIFICADO CON TALLA AUTOMÁTICA
app.post('/api/socios/config', async (req, res) => {
  try {
    const { 
      nombre, roles, moneda_socio, whatsapp, 
      pen, cop, clp, ars, ves, brl, mxn, pyg, dop, crc, eur, cad, usd, ecu, pan, usdt,
      cartelera_paises, ajustes 
    } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre del socio es obligatorio.' });
    }

    const socioNombre = nombre.trim();
    const idGrupo = 'GRP_' + socioNombre.toUpperCase().replace(/\s+/g, '_');

    const cpArray = cartelera_paises || [];
    const conteoActivos = cpArray.filter(p => p.activo).length;
    const tallaCalculada = calcularTallaAutomatica(conteoActivos);

    const jsonCartelera = JSON.stringify(cpArray);
    const jsonAjustes = JSON.stringify(ajustes || {});

    const query = `
      INSERT INTO nombres_fb (
        id_grupo, nombre, roles, moneda_socio, talla, whatsapp,
        pen, cop, clp, ars, ves, brl, mxn, pyg, dop, crc, eur, cad, usd, ecu, pan, usdt,
        cartelera_paises, ajustes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23::jsonb, $24::jsonb)
      ON CONFLICT (id_grupo) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        roles = EXCLUDED.roles,
        moneda_socio = EXCLUDED.moneda_socio,
        talla = EXCLUDED.talla,
        whatsapp = EXCLUDED.whatsapp,
        pen = EXCLUDED.pen, cop = EXCLUDED.cop, clp = EXCLUDED.clp, ars = EXCLUDED.ars,
        ves = EXCLUDED.ves, brl = EXCLUDED.brl, mxn = EXCLUDED.mxn, pyg = EXCLUDED.pyg,
        dop = EXCLUDED.dop, crc = EXCLUDED.crc, eur = EXCLUDED.eur, cad = EXCLUDED.cad,
        usd = EXCLUDED.usd, ecu = EXCLUDED.ecu, pan = EXCLUDED.pan, usdt = EXCLUDED.usdt,
        cartelera_paises = EXCLUDED.cartelera_paises,
        ajustes = EXCLUDED.ajustes
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [
      idGrupo, socioNombre, roles || 'SOCIO', moneda_socio || 'USDT', tallaCalculada, whatsapp || '',
      pen || 'D', cop || 'D', clp || 'D', ars || 'D', ves || 'D', brl || 'D', mxn || 'D', pyg || 'D',
      dop || 'D', crc || 'D', eur || 'D', cad || 'D', usd || 'P', ecu || 'D', pan || 'D', usdt || 'A',
      jsonCartelera, jsonAjustes
    ]);

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Error al guardar configuracion de socio:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`✅ Servidor Atenea v2 activo en http://${HOST}:${PORT}`);
});
