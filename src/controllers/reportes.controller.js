const { getPool, sql } = require('../config/db');

exports.reporteVentas = async (req, res) => {
  const { desde, hasta } = req.query;
  const pool = await getPool();
  const result = await pool.request()
    .input('desde', sql.Date, desde)
    .input('hasta', sql.Date, hasta)
    .query(`
      SELECT v.*, c.Nombre AS ClienteNombre, l.Marca, l.Medida
      FROM Ventas v
      JOIN Clientes c ON v.ClienteId = c.ClienteId
      JOIN Llantas l ON v.LlantaId = l.LlantaId
      WHERE v.FechaVenta BETWEEN @desde AND @hasta
      ORDER BY v.FechaVenta
    `);

  const totalVendido = result.recordset.reduce((sum, r) => sum + r.Total, 0);
  const totalPendiente = result.recordset.reduce((sum, r) => sum + r.SaldoPendiente, 0);

  res.json({ ventas: result.recordset, totalVendido, totalPendiente });
};

exports.reporteViajes = async (req, res) => {
  const { desde, hasta } = req.query;
  const pool = await getPool();
  const result = await pool.request()
    .input('desde', sql.Date, desde)
    .input('hasta', sql.Date, hasta)
    .query('SELECT * FROM Viajes WHERE Fecha BETWEEN @desde AND @hasta ORDER BY Fecha');

  const totalViajes = result.recordset.reduce((sum, r) => sum + r.Total, 0);
  const totalPendiente = result.recordset.reduce((sum, r) => sum + r.SaldoPendiente, 0);

  res.json({ viajes: result.recordset, totalViajes, totalPendiente });
};

exports.reporteFacturas = async (req, res) => {
  const { desde, hasta } = req.query;
  const pool = await getPool();
  const result = await pool.request()
    .input('desde', sql.Date, desde)
    .input('hasta', sql.Date, hasta)
    .query('SELECT * FROM Facturas WHERE Fecha BETWEEN @desde AND @hasta ORDER BY Fecha');

  const totalFacturado = result.recordset.reduce((sum, r) => sum + r.Total, 0);
  res.json({ facturas: result.recordset, totalFacturado });
};