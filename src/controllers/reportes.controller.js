exports.reporteViajes = async (req, res) => {
  const { desde, hasta } = req.query;
  const pool = await getPool();
  const result = await pool.request()
    .input('desde', sql.Date, desde)
    .input('hasta', sql.Date, hasta)
    .query('SELECT * FROM Viajes WHERE Fecha BETWEEN @desde AND @hasta ORDER BY Fecha');

  const totalViajes = result.recordset.reduce((sum, r) => sum + r.Total, 0);
  res.json({ viajes: result.recordset, totalViajes });
};