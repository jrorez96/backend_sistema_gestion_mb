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
      whereClause = ' WHERE Nombre LIKE @buscar OR Empresa LIKE @buscar OR Telefono LIKE @buscar';
    }

    // Conteo total (para saber cuántas páginas hay)
    const countRequest = pool.request();
    if (buscar) countRequest.input('buscar', sql.NVarChar, `%${buscar}%`);
    const countResult = await countRequest.query(`SELECT COUNT(*) AS total FROM Clientes${whereClause}`);
    const total = countResult.recordset[0].total;

    // Datos de la página solicitada
    const dataRequest = pool.request();
    if (buscar) dataRequest.input('buscar', sql.NVarChar, `%${buscar}%`);
    dataRequest.input('offset', sql.Int, offset);
    dataRequest.input('limite', sql.Int, limiteNum);

    const result = await dataRequest.query(`
      SELECT * FROM Clientes${whereClause}
      ORDER BY ClienteId DESC
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

exports.getById = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT * FROM Clientes WHERE ClienteId = @id');
    if (result.recordset.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { nombre, empresa, direccion, telefono } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });

    const pool = await getPool();
    const result = await pool.request()
      .input('nombre', sql.NVarChar(150), nombre)
      .input('empresa', sql.NVarChar(150), empresa || null)
      .input('direccion', sql.NVarChar(250), direccion || null)
      .input('telefono', sql.NVarChar(30), telefono || null)
      .query(`INSERT INTO Clientes (Nombre, Empresa, Direccion, Telefono)
              OUTPUT INSERTED.*
              VALUES (@nombre, @empresa, @direccion, @telefono)`);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { nombre, empresa, direccion, telefono } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('nombre', sql.NVarChar(150), nombre)
      .input('empresa', sql.NVarChar(150), empresa || null)
      .input('direccion', sql.NVarChar(250), direccion || null)
      .input('telefono', sql.NVarChar(30), telefono || null)
      .query(`UPDATE Clientes SET Nombre=@nombre, Empresa=@empresa, Direccion=@direccion, Telefono=@telefono
              OUTPUT INSERTED.*
              WHERE ClienteId=@id`);
    if (result.recordset.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Clientes WHERE ClienteId=@id');
    res.json({ mensaje: 'Cliente eliminado' });
  } catch (err) {
    res.status(400).json({ error: 'No se puede eliminar: el cliente tiene ventas asociadas' });
  }
};