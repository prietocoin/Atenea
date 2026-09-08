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

// FACTORES BASE DE MERCADO MATRIZ COMPLETA (T363)
const FACTORES_BASE_MERCADO = {
  "P-USDT": 1.0,   "D-USDT": 1.0,
  "P-PYUSD": 0.8,  "D-PYUSD": 1.2,
  "P-PEN": 0.976,  "D-PEN": 1.026,
  "P-COP": 0.976,  "D-COP": 1.030,
  "P-CLP": 0.962,  "D-CLP": 1.042,
  "P-ARS": 0.962,  "D-ARS": 1.042,
  "P-VES": 0.976,  "D-VES": 1.026,
  "P-BRL": 0.952,  "D-BRL": 1.053,
  "P-MXN": 0.943,  "D-MXN": 1.064,
  "P-PYG": 0.962,  "D-PYG": 1.042,
  "P-EUR": 0.926,  "D-EUR": 1.087,
  "P-USD": 0.930,  "D-USD": 1.087,
  "P-ECU": 0.940,  "D-ECU": 1.064,
  "P-DOP": 0.943,  "D-DOP": 1.064,
  "P-CRC": 0.943,  "D-CRC": 1.064,
  "P-CAD": 0.962,  "D-CAD": 1.042,
  "P-BOB": 0.926,  "D-BOB": 1.087
};

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
  if (conteo <= 3) return 'S';
  if (conteo <= 6) return 'M';
  return 'L';
}

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

      CREATE TABLE IF NOT EXISTS notificaciones_tasas (
        id SERIAL PRIMARY KEY,
        id_tasa VARCHAR(50) NOT NULL,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS recordar_activo BOOLEAN DEFAULT FALSE;
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS saldo_anterior NUMERIC(18, 2) DEFAULT 0.00;
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS cartelera_paises JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS ajustes JSONB DEFAULT '{}'::jsonb;
    `);

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
        c.hash_largo,
        c.hash_corto,
        c.timestamp AS timestamp_comprobante,
        to_timestamp(c.timestamp) AS fecha_hora_comprobante,
        COALESCE(f.monto, 0) AS monto,
        COALESCE(UPPER(f.moneda), 'USDT') AS moneda,
        f.banco,
        f.titular,
        f.referencia,
        COALESCE(f.procesado_ia, FALSE) AS procesado_ia,
        c.nombre_socio_1,
        c.nombre_socio_2,
        c.url_imagen,
        COALESCE(c.conteo, 1) AS conteo,
        COALESCE(lr.id_tasa, (SELECT id_tasa FROM primer_lote), 'T360') AS lote_tasa_asignado,
        
        COALESCE(
          mt.tasa_base, 
          mt_primer.tasa_base,
          CASE WHEN UPPER(COALESCE(f.moneda, 'USDT')) IN ('USD', 'USDT', 'PYUSD') THEN 1.0 ELSE NULL END
        ) AS tasa_mercado_aplicada,
        
        CASE 
          WHEN UPPER(COALESCE(f.moneda, 'USDT')) IN ('USD', 'USDT', 'PYUSD') THEN ROUND(COALESCE(f.monto, 0)::numeric, 2)
          WHEN COALESCE(mt.tasa_base, mt_primer.tasa_base) > 0 
            THEN ROUND((COALESCE(f.monto, 0) / COALESCE(mt.tasa_base, mt_primer.tasa_base))::numeric, 2)
          ELSE NULL
        END AS monto_usd_equivalente

      FROM cola_fb c
      LEFT JOIN comprobantes_fb f ON TRIM(LOWER(c.hash_largo)) = TRIM(LOWER(f.hash_largo))
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
    console.log('✅ Esquema y Vista v_comprobantes_auditados sincronizados en PostgreSQL.');
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
    const testQuery = await pool.query("SELECT NOW() AT TIME ZONE 'America/Caracas' AS ahora_ve;");
    const countMaster = await pool.query(
      'SELECT COUNT(*) FROM comprobantes_fb f INNER JOIN cola_fb c ON f.hash_largo = c.hash_largo WHERE c.conteo > 1;'
    );
    res.json({
      status: 'OK',
      hora_servidor_ve: testQuery.rows[0].ahora_ve,
      registros_tabla_maestra: parseInt(countMaster.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', mensaje: err.message });
  }
});

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

app.post('/api/tasas/n8n-webhook', (req, res) => {
  try {
    let payload = req.body;
    if (Array.isArray(payload)) payload = payload[0] || {};
    if (payload.json) payload = payload.json;

    borradorTasas = payload;
    return res.json({ success: true, message: 'Borrador cargado en memoria', rates: borradorTasas });
  } catch (err) {
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
        const lastLot = lastRes.rows[0].id_tasa;
        const match = lastLot.match(/\d+/);
        const num = match ? parseInt(match[0], 10) + 1 : 1;
        codigoTasa = `T${String(num).padStart(3, '0')}`;
      } else {
        codigoTasa = 'T360';
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

    await pool.query(
      `INSERT INTO notificaciones_tasas (id_tasa) VALUES ($1);`,
      [codigoTasa]
    );

    res.json({ success: true, id_tasa: codigoTasa, message: `Tasa ${codigoTasa} publicada correctamente` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/tasas/reenviar', async (req, res) => {
  try {
    const { id_tasa } = req.body;
    let codigoTasa = id_tasa;

    if (!codigoTasa) {
      const lastRes = await pool.query("SELECT id_tasa FROM mercado_tasas ORDER BY id DESC LIMIT 1;");
      if (lastRes.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'No hay tasas registradas para reenviar.' });
      }
      codigoTasa = lastRes.rows[0].id_tasa;
    }

    await pool.query(`INSERT INTO notificaciones_tasas (id_tasa) VALUES ($1);`, [codigoTasa]);

    res.json({ success: true, id_tasa: codigoTasa, message: `Reenvío activado para la tasa ${codigoTasa}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/socios/desactivar-todos', async (req, res) => {
  try {
    await pool.query(`UPDATE nombres_fb SET activo = FALSE WHERE UPPER(TRIM(nombre)) != 'GENERAL';`);
    res.json({ success: true, message: 'Todos los socios desactivados correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/socios/guardar-vigentes', async (req, res) => {
  try {
    await pool.query(`UPDATE nombres_fb SET recordar_activo = activo;`);
    res.json({ success: true, message: 'Plantilla de socios activos memorizada correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/socios/restaurar-vigentes', async (req, res) => {
  try {
    await pool.query(`UPDATE nombres_fb SET activo = COALESCE(recordar_activo, FALSE);`);
    res.json({ success: true, message: 'Socios vigentes restaurados correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// HANDLER CENTRALIZADO: TIPO DICTADO POR SOCIO 1 Y HEREDADO POR SOCIO 2
const getComprobantesHandler = async (req, res) => {
  try {
    const { socio, nombre, fechaInicio, fechaFin, desdeHash, hash, rol, soloDuplicados } = req.query;
    const targetSocio = (socio || nombre || '').trim();

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
          CASE WHEN UPPER(v.moneda) IN ('USD', 'USDT', 'PYUSD') THEN 1.0 ELSE NULL END
        ) AS tasa_base,
        
        v.monto_usd_equivalente,

        t.tipo_op,

        CASE 
          WHEN UPPER(TRIM(COALESCE(n1.moneda_socio, 'USDT'))) = 'USD' THEN 'USDT'
          ELSE UPPER(TRIM(COALESCE(n1.moneda_socio, 'USDT')))
        END AS moneda_socio_1,
        n1.roles AS rol_socio_1,
        n1.ajustes AS ajustes_socio_1,
        
        COALESCE(
          mt_s1.tasa_base,
          CASE WHEN UPPER(COALESCE(n1.moneda_socio, 'USDT')) IN ('USD', 'USDT', 'PYUSD') THEN 1.0 ELSE 1.0 END
        ) AS tasa_base_socio_1,
        (n1.ajustes->>(t.tipo_op || '-' || UPPER(v.moneda)))::numeric AS factor_1_raw,

        CASE 
          WHEN UPPER(TRIM(COALESCE(n2.moneda_socio, 'USDT'))) = 'USD' THEN 'USDT'
          ELSE UPPER(TRIM(COALESCE(n2.moneda_socio, 'USDT')))
        END AS moneda_socio_2,
        n2.roles AS rol_socio_2,
        n2.ajustes AS ajustes_socio_2,

        COALESCE(
          mt_s2.tasa_base,
          CASE WHEN UPPER(COALESCE(n2.moneda_socio, 'USDT')) IN ('USD', 'USDT', 'PYUSD') THEN 1.0 ELSE 1.0 END
        ) AS tasa_base_socio_2,
        (n2.ajustes->>(t.tipo_op || '-' || UPPER(v.moneda)))::numeric AS factor_2_raw

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
          CASE UPPER(TRIM(v.moneda))
            WHEN 'PEN' THEN n1.pen
            WHEN 'COP' THEN n1.cop
            WHEN 'CLP' THEN n1.clp
            WHEN 'ARS' THEN n1.ars
            WHEN 'MXN' THEN n1.mxn
            WHEN 'BRL' THEN n1.brl
            WHEN 'VES' THEN n1.ves
            WHEN 'PYG' THEN n1.pyg
            WHEN 'DOP' THEN n1.dop
            WHEN 'CRC' THEN n1.crc
            WHEN 'EUR' THEN n1.eur
            WHEN 'CAD' THEN n1.cad
            WHEN 'USD' THEN n1.usd
            WHEN 'ECU' THEN n1.ecu
            WHEN 'PAN' THEN n1.pan
            WHEN 'USDT' THEN n1.usdt
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

    if (rol && rol.trim() && rol.trim().toUpperCase() !== 'TODOS') {
      query += ` AND (UPPER(TRIM(n1.roles)) = UPPER(TRIM($${paramIndex})) OR UPPER(TRIM(n2.roles)) = UPPER(TRIM($${paramIndex})))`;
      values.push(rol.trim());
      paramIndex++;
    }

    if (targetSocio && targetSocio.toUpperCase() !== 'TODOS') {
      query += ` AND (UPPER(TRIM(v.nombre_socio_1)) = UPPER(TRIM($${paramIndex})) OR UPPER(TRIM(v.nombre_socio_2)) = UPPER(TRIM($${paramIndex})))`;
      values.push(targetSocio);
      paramIndex++;
    }

    if (hash && hash.trim()) {
      query += ` AND (v.hash_corto ILIKE $${paramIndex} OR v.hash_largo ILIKE $${paramIndex})`;
      values.push(`%${hash.trim()}%`);
      paramIndex++;
    }

    if (fechaInicio && fechaInicio.trim()) {
      const startTimestamp = Math.floor(new Date(fechaInicio.trim() + 'T00:00:00-04:00').getTime() / 1000);
      if (!isNaN(startTimestamp)) {
        query += ` AND v.timestamp_comprobante >= $${paramIndex}`;
        values.push(startTimestamp);
        paramIndex++;
      }
    }

    if (fechaFin && fechaFin.trim()) {
      const endTimestamp = Math.floor(new Date(fechaFin.trim() + 'T23:59:59-04:00').getTime() / 1000);
      if (!isNaN(endTimestamp)) {
        query += ` AND v.timestamp_comprobante <= $${paramIndex}`;
        values.push(endTimestamp);
        paramIndex++;
      }
    }

    if (desdeHash && desdeHash.trim()) {
      const hashRes = await pool.query(
        `SELECT timestamp_comprobante FROM v_comprobantes_auditados WHERE hash_corto = $1 OR hash_largo = $1 LIMIT 1;`,
        [desdeHash.trim()]
      );
      if (hashRes.rows.length > 0) {
        const hashTs = hashRes.rows[0].timestamp_comprobante;
        query += ` AND v.timestamp_comprobante >= $${paramIndex}`;
        values.push(hashTs);
        paramIndex++;
      }
    }

    query += ` ORDER BY v.timestamp_comprobante DESC;`;

    const { rows } = await pool.query(query, values);

    const rowsProcesadas = rows.map(row => {
      const monto = parseFloat(row.monto) || 0;
      const tasaBaseOrigen = parseFloat(row.tasa_base) || 1.0;
      const monOrig = (row.moneda || 'USDT').trim().toUpperCase();

      // --- 1. SOCIO 1 DICTA IMPERATIVAMENTE EL TIPO DE OPERACIÓN ---
      let tipoOp1 = (row.tipo_op || 'D').trim().toUpperCase();
      if (!['D', 'P', 'A', 'C'].includes(tipoOp1)) tipoOp1 = 'D';

      // --- 2. SOCIO 2 HEREDA EXACTAMENTE EL MISMO TIPO DE OPERACIÓN DEL SOCIO 1 ---
      let tipoOp2 = tipoOp1;

      // --- 3. LECTURA DE FACTORES DE AJUSTES EN AMBOS PERFILES ---
      const aj1 = typeof row.ajustes_socio_1 === 'string' ? JSON.parse(row.ajustes_socio_1) : (row.ajustes_socio_1 || {});
      const aj2 = typeof row.ajustes_socio_2 === 'string' ? JSON.parse(row.ajustes_socio_2) : (row.ajustes_socio_2 || {});

      const f1Val = parseFloat(aj1[`${tipoOp1}-${monOrig}`]);
      const factor1 = !isNaN(f1Val) ? f1Val : (row.factor_1_raw !== null && row.factor_1_raw !== undefined ? parseFloat(row.factor_1_raw) : 1.0);

      const f2Val = parseFloat(aj2[`${tipoOp2}-${monOrig}`]);
      const factor2 = !isNaN(f2Val) ? f2Val : 1.0;

      // --- 4. CÁLCULO ARITMÉTICO Y SIGNO SOCIO 1 ---
      let monedaSocio1 = (row.moneda_socio_1 || 'USDT').toUpperCase();
      if (monedaSocio1 === 'USD') monedaSocio1 = 'USDT';
      const tasaBaseSocio1 = parseFloat(row.tasa_base_socio_1) || 1.0;

      const tasaCrossBase1 = tasaBaseSocio1 > 0 ? (tasaBaseOrigen / tasaBaseSocio1) : tasaBaseOrigen;
      const tasa1Raw = tasaCrossBase1 * Math.abs(factor1);
      let tasa1 = aplicarReglaPrecision(tasa1Raw);
      let m1Socio = tasa1 > 0 ? parseFloat((monto / tasa1).toFixed(2)) : 0;
      
      if (tipoOp1 === 'P' || factor1 < 0) {
        m1Socio = -Math.abs(m1Socio);
        tasa1 = -Math.abs(tasa1);
      } else {
        m1Socio = Math.abs(m1Socio);
        tasa1 = Math.abs(tasa1);
      }
      const m1Usdt = tasaBaseSocio1 > 0 ? parseFloat((m1Socio / tasaBaseSocio1).toFixed(2)) : m1Socio;

      // --- 5. CÁLCULO ARITMÉTICO Y SIGNO SOCIO 2 (TIPO HEREDADO) ---
      let monedaSocio2 = (row.moneda_socio_2 || 'USDT').toUpperCase();
      if (monedaSocio2 === 'USD') monedaSocio2 = 'USDT';
      const tasaBaseSocio2 = parseFloat(row.tasa_base_socio_2) || 1.0;

      const tasaCrossBase2 = tasaBaseSocio2 > 0 ? (tasaBaseOrigen / tasaBaseSocio2) : tasaBaseOrigen;
      const tasa2Raw = tasaCrossBase2 * Math.abs(factor2);
      let tasa2 = aplicarReglaPrecision(tasa2Raw);
      let m2Socio = tasa2 > 0 ? parseFloat((monto / tasa2).toFixed(2)) : 0;

      if (tipoOp2 === 'P' || factor2 < 0) {
        m2Socio = -Math.abs(m2Socio);
        tasa2 = -Math.abs(tasa2);
      } else {
        m2Socio = Math.abs(m2Socio);
        tasa2 = Math.abs(tasa2);
      }
      const m2Usdt = tasaBaseSocio2 > 0 ? parseFloat((m2Socio / tasaBaseSocio2).toFixed(2)) : m2Socio;

      // DETERMINACIÓN FÍSICA PARA EL SOCIO CONSULTADO EN EL REPORTE
      let montoSocioFinal = m1Socio;
      let tasaSocioFinal = tasa1;
      let monedaSocioFinal = monedaSocio1;
      let tipoOpSocioFinal = tipoOp1;

      if (targetSocio) {
        const targetNorm = targetSocio.trim().toUpperCase();
        if (row.nombre_socio_2 && row.nombre_socio_2.trim().toUpperCase() === targetNorm) {
          montoSocioFinal = m2Socio;
          tasaSocioFinal = tasa2;
          monedaSocioFinal = monedaSocio2;
          tipoOpSocioFinal = tipoOp2;
        }
      }

      const hashCorto = row.hash_corto || 'OP';
      const etiquetaHash = `[${tipoOpSocioFinal}-${hashCorto}]`;

      return {
        ...row,
        tipo_op: tipoOp1, // Insignia oficial en Comprobantes (dictada por Socio 1)
        tasa_1: tasa1,
        moneda_socio_1: monedaSocio1,
        m1_socio: m1Socio,
        m1_usdt: m1Usdt,

        tasa_2: tasa2,
        moneda_socio_2: monedaSocio2,
        m2_socio: m2Socio,
        m2_usdt: m2Usdt,

        // PROPIEDADES CENTRALIZADAS PARA LA SPA Y N8N
        monto_socio_final: montoSocioFinal,
        tasa_socio_final: tasaSocioFinal,
        moneda_socio_final: monedaSocioFinal,
        tipo_op_socio: tipoOpSocioFinal,
        etiqueta_hash: etiquetaHash
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
app.get('/api/reportes', getComprobantesHandler);
app.get('/api/reportes/operaciones', getComprobantesHandler);

// ENDPOINT DINÁMICO DE FILTROS EN CASCADA PARA SPA
app.get('/api/reportes/filtros', async (req, res) => {
  try {
    const { rol } = req.query;

    const rolesQuery = `
      SELECT DISTINCT UPPER(TRIM(roles)) AS rol 
      FROM nombres_fb 
      WHERE roles IS NOT NULL AND TRIM(roles) != ''
      ORDER BY rol ASC;
    `;

    let nombresQuery = `
      SELECT DISTINCT nombre FROM (
        SELECT nombre_socio_1 AS nombre, n1.roles AS rol FROM cola_fb c LEFT JOIN nombres_fb n1 ON UPPER(TRIM(n1.nombre)) = UPPER(TRIM(c.nombre_socio_1)) WHERE nombre_socio_1 IS NOT NULL AND nombre_socio_1 != ''
        UNION
        SELECT nombre_socio_2 AS nombre, n2.roles AS rol FROM cola_fb c LEFT JOIN nombres_fb n2 ON UPPER(TRIM(n2.nombre)) = UPPER(TRIM(c.nombre_socio_2)) WHERE nombre_socio_2 IS NOT NULL AND nombre_socio_2 != ''
        UNION
        SELECT nombre, roles AS rol FROM nombres_fb WHERE roles IN ('SOCIO', 'MATRIZ_GENERAL', 'ASESOR', 'GRUPO', 'COMPRAS')
      ) s WHERE nombre IS NOT NULL AND TRIM(nombre) != ''
    `;

    const params = [];
    if (rol && rol.trim() && rol.trim().toUpperCase() !== 'TODOS') {
      params.push(rol.trim());
      nombresQuery += ` AND UPPER(TRIM(rol)) = UPPER(TRIM($1))`;
    }

    nombresQuery += ` ORDER BY nombre ASC;`;

    const hashesQuery = `
      SELECT DISTINCT hash_corto AS hash
      FROM v_comprobantes_auditados
      WHERE hash_corto IS NOT NULL AND hash_corto != ''
      ORDER BY hash_corto ASC
      LIMIT 100;
    `;

    const [rolesRes, nombresRes, hashesRes] = await Promise.all([
      pool.query(rolesQuery),
      pool.query(nombresQuery, params),
      pool.query(hashesQuery)
    ]);

    res.json({
      success: true,
      roles: rolesRes.rows.map(r => r.rol),
      entidades: nombresRes.rows.map(r => r.nombre),
      hashes: hashesRes.rows.map(r => r.hash)
    });
  } catch (err) {
    console.error('Error en GET /api/reportes/filtros:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

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
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/socios/:nombre/estado', async (req, res) => {
  try {
    const { nombre } = req.params;
    const { activo } = req.body;

    const { rows } = await pool.query(
      `UPDATE nombres_fb SET activo = $1 WHERE UPPER(TRIM(nombre)) = UPPER(TRIM($2)) RETURNING nombre, activo;`,
      [activo, nombre]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Socio no encontrado' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/socios', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT nombre FROM (
        SELECT nombre_socio_1 AS nombre FROM cola_fb WHERE nombre_socio_1 IS NOT NULL AND nombre_socio_1 != ''
        UNION
        SELECT nombre_socio_2 AS nombre FROM cola_fb WHERE nombre_socio_2 IS NOT NULL AND nombre_socio_2 != ''
        UNION
        SELECT nombre FROM nombres_fb WHERE roles IN ('SOCIO', 'MATRIZ_GENERAL', 'ASESOR', 'GRUPO', 'COMPRAS')
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
    const { rows } = await pool.query(
      "SELECT * FROM nombres_fb WHERE UPPER(TRIM(nombre)) != 'GENERAL' ORDER BY nombre ASC;"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/directorio/:nombre', async (req, res) => {
  try {
    const { nombre } = req.params;
    if (!nombre) return res.status(400).json({ error: 'Nombre de socio requerido.' });

    const { rows } = await pool.query(
      `DELETE FROM nombres_fb WHERE UPPER(TRIM(nombre)) = UPPER(TRIM($1)) RETURNING *;`,
      [nombre]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Socio no encontrado.' });
    res.json({ success: true, message: `Socio ${nombre} eliminado correctamente.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/socios/config', async (req, res) => {
  try {
    const { 
      nombre, roles, moneda_socio, saldo_anterior, whatsapp, activo,
      pen, cop, clp, ars, ves, brl, mxn, pyg, dop, crc, eur, cad, usd, ecu, pan, usdt,
      cartelera_paises, ajustes 
    } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre del socio es obligatorio.' });
    }

    const socioNombre = nombre.trim();
    const cpArray = (cartelera_paises && cartelera_paises.length > 0) 
      ? cartelera_paises 
      : [
          { pais: 'Peru', moneda: 'PEN', activo: true, orden: 1 },
          { pais: 'Chile', moneda: 'CLP', activo: true, orden: 2 },
          { pais: 'Colombia', moneda: 'COP', activo: true, orden: 3 },
          { pais: 'Argentina', moneda: 'ARS', activo: true, orden: 4 }
        ];

    const conteoActivos = cpArray.filter(p => p.activo).length;
    const tallaCalculada = calcularTallaAutomatica(conteoActivos);

    const jsonCartelera = JSON.stringify(cpArray);
    const jsonAjustes = JSON.stringify(ajustes || {});
    const valSaldo = parseFloat(saldo_anterior) || 0;

    const checkQuery = `SELECT id_grupo, whatsapp FROM nombres_fb WHERE UPPER(TRIM(nombre)) = UPPER(TRIM($1));`;
    const checkRes = await pool.query(checkQuery, [socioNombre]);

    let rows;

    if (checkRes.rows.length > 0) {
      const updateQuery = `
        UPDATE nombres_fb SET
          roles = $1,
          moneda_socio = $2,
          talla = $3,
          whatsapp = $4,
          activo = $5,
          saldo_anterior = $6,
          pen = $7, cop = $8, clp = $9, ars = $10, ves = $11, brl = $12, mxn = $13, pyg = $14,
          dop = $15, crc = $16, eur = $17, cad = $18, usd = $19, ecu = $20, pan = $21, usdt = $22,
          cartelera_paises = $23::jsonb,
          ajustes = $24::jsonb
        WHERE UPPER(TRIM(nombre)) = UPPER(TRIM($25))
        RETURNING *;
      `;
      const updateRes = await pool.query(updateQuery, [
        roles || 'SOCIO', moneda_socio || 'USDT', tallaCalculada, 
        whatsapp || checkRes.rows[0].whatsapp || '',
        activo ?? true, valSaldo,
        pen || 'D', cop || 'D', clp || 'D', ars || 'D', ves || 'D', brl || 'D', mxn || 'D', pyg || 'D',
        dop || 'D', crc || 'D', eur || 'D', cad || 'D', usd || 'D', ecu || 'D', pan || 'D', usdt || 'A',
        jsonCartelera, jsonAjustes, socioNombre
      ]);
      rows = updateRes.rows;
    } else {
      const idGrupo = whatsapp && whatsapp.trim() ? whatsapp.trim() : ('GRP_' + socioNombre.toUpperCase().replace(/\s+/g, '_'));
      const insertQuery = `
        INSERT INTO nombres_fb (
          id_grupo, nombre, roles, moneda_socio, talla, whatsapp, activo, saldo_anterior,
          pen, cop, clp, ars, ves, brl, mxn, pyg, dop, crc, eur, cad, usd, ecu, pan, usdt,
          cartelera_paises, ajustes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25::jsonb, $26::jsonb)
        RETURNING *;
      `;
      const insertRes = await pool.query(insertQuery, [
        idGrupo, socioNombre, roles || 'SOCIO', moneda_socio || 'USDT', tallaCalculada, whatsapp || '',
        activo ?? true, valSaldo,
        pen || 'D', cop || 'D', clp || 'D', ars || 'D', ves || 'D', brl || 'D', mxn || 'D', pyg || 'D',
        dop || 'D', crc || 'D', eur || 'D', cad || 'D', usd || 'D', ecu || 'D', pan || 'D', usdt || 'A',
        jsonCartelera, jsonAjustes
      ]);
      rows = insertRes.rows;
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("Error guardando socio:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ENDPOINT DISPATCH DEL REPORTE POR WHATSAPP/N8N
app.post('/api/reportes/enviar-whatsapp', async (req, res) => {
  try {
    const { socio, remoteJid, saldoAnterior, movimiento, nuevoSaldo, moneda, comprobantes } = req.body;

    if (!remoteJid || !remoteJid.trim()) {
      return res.status(400).json({ success: false, error: 'El socio no posee un JID válido en el Directorio.' });
    }

    const N8N_WEBHOOK_URL = process.env.N8N_REPORTES_WEBHOOK || 'https://nochon.jairokov.com/webhook/reportes-whatsapp';

    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        socio,
        remoteJid,
        saldoAnterior,
        movimiento,
        nuevoSaldo,
        moneda,
        comprobantes,
        fechaEnvio: new Date().toISOString()
      })
    });

    if (!n8nResponse.ok) {
      throw new Error(`n8n respondió con estatus HTTP ${n8nResponse.status}`);
    }

    res.json({
      success: true,
      message: `Reporte de ${socio} enviado exitosamente a n8n.`,
      remoteJid
    });
  } catch (err) {
    console.error("Error en POST /api/reportes/enviar-whatsapp:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`✅ Servidor Atenea v2 activo en http://${HOST}:${PORT}`);
});
