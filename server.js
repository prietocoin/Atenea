const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://usuario:password@localhost:5432/fundablock',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// -----------------------------------------------------------------------------
// 1. OBTENER COLA DE COMPROBANTES (CON LEFT JOIN Y FILTROS)
// -----------------------------------------------------------------------------
app.get('/api/cola', async (req, res) => {
  try {
    const { socio, fechaInicio, hash, soloDuplicados } = req.query;

    let query = `
      SELECT 
        c.hash_largo, 
        c.hash_corto, 
        c.url_imagen, 
        c.nombre_socio_1, 
        c.nombre_socio_2, 
        c.caption, 
        c.timestamp, 
        c.conteo,
        f.monto, 
        f.moneda, 
        f.banco, 
        f.referencia, 
        f.titular, 
        f.procesado_ia
      FROM cola_fb c
      LEFT JOIN comprobantes_fb f ON c.hash_largo = f.hash_largo
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    // Filtro por Socio
    if (socio) {
      query += ` AND (c.nombre_socio_1 = $${paramIndex} OR c.nombre_socio_2 = $${paramIndex})`;
      values.push(socio);
      paramIndex++;
    }

    // Filtro por Fecha ( Timestamp unix o date )
    if (fechaInicio) {
      const startTimestamp = Math.floor(new Date(fechaInicio).getTime() / 1000);
      query += ` AND c.timestamp >= $${paramIndex}`;
      values.push(startTimestamp);
      paramIndex++;
    }

    // Filtro por Hash corto
    if (hash) {
      query += ` AND c.hash_corto = $${paramIndex}`;
      values.push(hash);
      paramIndex++;
    }

    // Filtro por Duplicados (>1)
    if (soloDuplicados === 'true') {
      query += ` AND c.conteo > 1`;
    }

    query += ` ORDER BY c.timestamp DESC;`;

    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (err) {
    console.error('Error en GET /api/cola:', err.message);
    res.status(500).json({ error: 'Error al consultar la cola' });
  }
});

// -----------------------------------------------------------------------------
// 2. ACTUALIZAR ASIGNACIÓN DE SOCIOS Y CAPTION (cola_fb)
// -----------------------------------------------------------------------------
app.put('/api/cola/:hash_largo', async (req, res) => {
  try {
    const { hash_largo } = req.params;
    const { nombre_socio_1, nombre_socio_2, caption } = req.body;

    const query = `
      UPDATE cola_fb
      SET 
        nombre_socio_1 = $1,
        nombre_socio_2 = $2,
        caption = $3
      WHERE hash_largo = $4
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [
      nombre_socio_1 || null,
      nombre_socio_2 || null,
      caption || null,
      hash_largo
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Registro no encontrado en cola_fb' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Error en PUT /api/cola:', err.message);
    res.status(500).json({ error: 'Error al actualizar asignación de socio' });
  }
});

// -----------------------------------------------------------------------------
// 3. AUDITAR/CORREGIR DATOS EXTRAÍDOS DE IA (comprobantes_fb)
// -----------------------------------------------------------------------------
app.put('/api/comprobante/:hash_largo', async (req, res) => {
  try {
    const { hash_largo } = req.params;
    const { monto, moneda, banco, referencia, titular } = req.body;

    const query = `
      INSERT INTO comprobantes_fb (hash_largo, monto, moneda, banco, referencia, titular, procesado_ia)
      VALUES ($1, $2, $3, $4, $5, $6, TRUE)
      ON CONFLICT (hash_largo) DO UPDATE SET
        monto = EXCLUDED.monto,
        moneda = EXCLUDED.moneda,
        banco = EXCLUDED.banco,
        referencia = EXCLUDED.referencia,
        titular = EXCLUDED.titular,
        procesado_ia = TRUE
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [
      hash_largo,
      monto !== undefined && monto !== '' ? monto : null,
      moneda || null,
      banco ? banco.toUpperCase() : null,
      referencia || null,
      titular ? titular.toUpperCase() : null
    ]);

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Error en PUT /api/comprobante:', err.message);
    res.status(500).json({ error: 'Error al actualizar datos del comprobante' });
  }
});

// -----------------------------------------------------------------------------
// 4. OBTENER LISTA ÚNICA DE SOCIOS PARA FILTROS
// -----------------------------------------------------------------------------
app.get('/api/socios', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT nombre FROM (
        SELECT nombre_socio_1 AS nombre FROM cola_fb WHERE nombre_socio_1 IS NOT NULL AND nombre_socio_1 != ''
        UNION
        SELECT nombre_socio_2 AS nombre FROM cola_fb WHERE nombre_socio_2 IS NOT NULL AND nombre_socio_2 != ''
        UNION
        SELECT nombre FROM nombres_fb WHERE roles = 'SOCIO'
      ) s
      ORDER BY nombre ASC;
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error('Error en GET /api/socios:', err.message);
    res.status(500).json({ error: 'Error al obtener la lista de socios' });
  }
});

// -----------------------------------------------------------------------------
// 5. OBTENER REPORTES CONSOLIDADOS POR SOCIO
// -----------------------------------------------------------------------------
app.get('/api/reportes/socios', async (req, res) => {
  try {
    const query = `
      SELECT 
        COALESCE(c.nombre_socio_1, 'Sin Asignar') AS socio,
        COUNT(DISTINCT c.hash_largo) AS total_comprobantes,
        SUM(c.conteo) AS total_recepciones,
        SUM(GREATEST(c.conteo - 1, 0)) AS total_duplicados
      FROM cola_fb c
      GROUP BY COALESCE(c.nombre_socio_1, 'Sin Asignar')
      ORDER BY total_comprobantes DESC;
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error('Error en GET /api/reportes/socios:', err.message);
    res.status(500).json({ error: 'Error al obtener reportes' });
  }
});

// -----------------------------------------------------------------------------
// 6. GESTIÓN DEL DIRECTORIO (nombres_fb)
// -----------------------------------------------------------------------------
app.get('/api/directorio', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM nombres_fb ORDER BY nombre ASC;');
    res.json(rows);
  } catch (err) {
    console.error('Error en GET /api/directorio:', err.message);
    res.status(500).json({ error: 'Error al consultar directorio' });
  }
});

app.post('/api/directorio', async (req, res) => {
  try {
    const { id_grupo, nombre, roles, moneda_socio, usd, pen, cop, clp } = req.body;

    const query = `
      INSERT INTO nombres_fb (id_grupo, nombre, roles, moneda_socio, usd, pen, cop, clp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id_grupo) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        roles = EXCLUDED.roles,
        moneda_socio = EXCLUDED.moneda_socio,
        usd = EXCLUDED.usd,
        pen = EXCLUDED.pen,
        cop = EXCLUDED.cop,
        clp = EXCLUDED.clp
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [
      id_grupo,
      nombre,
      roles || 'GRUPO',
      moneda_socio || null,
      usd || null,
      pen || null,
      cop || null,
      clp || null
    ]);

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Error en POST /api/directorio:', err.message);
    res.status(500).json({ error: 'Error al guardar en directorio' });
  }
});

// Ruta fallback para SPA (Single Page Application)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor Backend Atenea corriendo en puerto ${PORT}`);
});
