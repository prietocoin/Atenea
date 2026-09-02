const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
  host: process.env.DB_HOST || 'automat_postgres-db',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'automat',
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Obtener lista de socios para el filtro
app.get('/api/socios', async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT DISTINCT nombre FROM nombres_fb WHERE roles = 'SOCIO' AND nombre IS NOT NULL ORDER BY nombre"
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ Error en /api/socios:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Obtener lista de hashes recientes
app.get('/api/hashes', async (req, res) => {
  try {
    const { socio, fechaInicio, fechaFin } = req.query;
    let query = `SELECT DISTINCT hash_corto FROM cola_fb WHERE hash_corto IS NOT NULL AND hash_corto != ''`;
    let params = [];

    if (socio) {
      params.push(socio);
      query += ` AND (nombre_socio_1 = $${params.length} OR nombre_socio_2 = $${params.length})`;
    }
    if (fechaInicio) {
      params.push(fechaInicio);
      query += ` AND to_timestamp(timestamp)::date >= $${params.length}`;
    }
    if (fechaFin) {
      params.push(fechaFin);
      query += ` AND to_timestamp(timestamp)::date <= $${params.length}`;
    }

    query += ' ORDER BY hash_corto DESC LIMIT 100';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('❌ Error en /api/hashes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Consultar registros de la tabla cola_fb
app.get('/api/cola', async (req, res) => {
  try {
    const { socio, fechaInicio, fechaFin, hash, soloDuplicados } = req.query;
    let query = `
      SELECT 
        hash_largo,
        hash_corto,
        grupo_raw,
        grupo_raw_2,
        usuario_raw,
        nombre AS usuario_push,
        caption,
        timestamp,
        to_timestamp(timestamp) AS fecha_hora,
        conteo,
        nombre_raw_1,
        nombre_raw_2,
        nombre_socio_1,
        nombre_socio_2,
        url_imagen
      FROM cola_fb 
      WHERE 1=1`;
    let params = [];

    if (socio) {
      params.push(socio);
      query += ` AND (nombre_socio_1 = $${params.length} OR nombre_socio_2 = $${params.length})`;
    }
    if (fechaInicio) {
      params.push(fechaInicio);
      query += ` AND to_timestamp(timestamp)::date >= $${params.length}`;
    }
    if (fechaFin) {
      params.push(fechaFin);
      query += ` AND to_timestamp(timestamp)::date <= $${params.length}`;
    }
    if (hash) {
      params.push(hash);
      query += ` AND (hash_corto = $${params.length} OR hash_largo = $${params.length})`;
    }
    if (soloDuplicados === 'true') {
      query += ` AND conteo > 1`;
    }

    query += ' ORDER BY timestamp DESC LIMIT 200';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('❌ Error en /api/cola:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Actualizar socios o nota en cola_fb
app.put('/api/cola/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const { nombre_socio_1, nombre_socio_2, caption } = req.body;

    await pool.query(
      `UPDATE cola_fb 
       SET nombre_socio_1 = $1, nombre_socio_2 = $2, caption = $3
       WHERE hash_largo = $4 OR hash_corto = $4`,
      [nombre_socio_1, nombre_socio_2, caption, hash]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error en /api/cola/:hash:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Reporte consolidado de socios
app.get('/api/reportes/socios', async (req, res) => {
  try {
    const query = `
      SELECT 
        COALESCE(s.socio, 'SIN ASIGNAR') AS socio,
        COUNT(*) AS total_comprobantes,
        SUM(c.conteo) AS total_recepciones,
        SUM(CASE WHEN c.conteo > 1 THEN 1 ELSE 0 END) AS total_duplicados
      FROM cola_fb c
      CROSS JOIN LATERAL (
        VALUES (c.nombre_socio_1), (c.nombre_socio_2)
      ) AS s(socio)
      WHERE s.socio IS NOT NULL AND s.socio != ''
      GROUP BY s.socio
      ORDER BY total_comprobantes DESC;
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error('❌ Error en /api/reportes/socios:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Directorio nombres_fb
app.get('/api/directorio', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM nombres_fb ORDER BY nombre ASC');
    res.json(rows);
  } catch (err) {
    console.error('❌ Error en /api/directorio:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Crear o Actualizar Grupo en nombres_fb (UPSERT)
app.post('/api/directorio', async (req, res) => {
  try {
    const { id_grupo, nombre, roles, moneda_socio, usd, pen, cop, clp } = req.body;
    
    await pool.query(`
      INSERT INTO nombres_fb (id_grupo, nombre, roles, moneda_socio, usd, pen, cop, clp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id_grupo) 
      DO UPDATE SET 
        nombre = EXCLUDED.nombre,
        roles = EXCLUDED.roles,
        moneda_socio = EXCLUDED.moneda_socio,
        usd = EXCLUDED.usd,
        pen = EXCLUDED.pen,
        cop = EXCLUDED.cop,
        clp = EXCLUDED.clp
    `, [id_grupo, nombre, roles, moneda_socio, usd, pen, cop, clp]);

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error en POST /api/directorio:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 80;
app.listen(PORT, () => console.log(`🚀 Atenea Audit Panel activo en puerto ${PORT}`));
