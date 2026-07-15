const { getPool, sql } = require('../config/db');

exports.getAll = async (req, res) => {
  try {
    const { buscar, pagina = 1, limite = 10 } = req.query;
    const pool = await getPool();
    const paginaNum = Math.max(1, Number(pagina));
    const limiteNum = Math.max(1, Number(limite));
    const offset = (paginaNum - 1) * limiteNum;

    let whereClause = '';
    if (buscar) {
      whereClause = ' WHERE Destino LIKE @buscar';
    }

    const countRequest = pool.request();
    if (buscar) countRequest.input('buscar', sql.NVarChar, `%${buscar}%`);
    const countResult = await countRequest.query(`SELECT COUNT(*) AS total FROM Viajes${whereClause}`);
    const total = countResult.recordset[0].total;

    const dataRequest = pool.request();
    if (buscar) dataRequest.input('buscar', sql.NVarChar, `%${buscar}%`);
    dataRequest.input('offset', sql.Int, offset);
    dataRequest.input('limite', sql.Int, limiteNum);

    const result = await dataRequest.query(`
      SELECT * FROM Viajes${whereClause}
      ORDER BY Fecha DESC
      OFFSET @offset ROWS FETCH NEXT @limite ROWS ONLY
    `);

    res.json({
      datos: result.recordset,
      total,
      pagina: paginaNum,
      totalPaginas: Math.ceil(total / limiteNum) || 1,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { fecha, destino, precio } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('fecha', sql.Date, fecha)
      .input('destino', sql.NVarChar(150), destino)
      .input('precio', sql.Decimal(10, 2), precio)
      .query(`INSERT INTO Viajes (Fecha, Destino, Precio) OUTPUT INSERTED.* VALUES (@fecha, @destino, @precio)`);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { fecha, destino, precio } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('fecha', sql.Date, fecha)
      .input('destino', sql.NVarChar(150), destino)
      .input('precio', sql.Decimal(10, 2), precio)
      .query(`UPDATE Viajes SET Fecha=@fecha, Destino=@destino, Precio=@precio OUTPUT INSERTED.* WHERE ViajeId=@id`);
    if (result.recordset.length === 0) return res.status(404).json({ error: 'Viaje no encontrado' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM Viajes WHERE ViajeId=@id');
    res.json({ mensaje: 'Viaje eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};