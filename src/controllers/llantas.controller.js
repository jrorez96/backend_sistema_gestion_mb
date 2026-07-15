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
      whereClause = ' WHERE Marca LIKE @buscar OR Medida LIKE @buscar OR Taco LIKE @buscar OR Perfil LIKE @buscar';
    }

    const countRequest = pool.request();
    if (buscar) countRequest.input('buscar', sql.NVarChar, `%${buscar}%`);
    const countResult = await countRequest.query(`SELECT COUNT(*) AS total FROM Llantas${whereClause}`);
    const total = countResult.recordset[0].total;

    const dataRequest = pool.request();
    if (buscar) dataRequest.input('buscar', sql.NVarChar, `%${buscar}%`);
    dataRequest.input('offset', sql.Int, offset);
    dataRequest.input('limite', sql.Int, limiteNum);

    const result = await dataRequest.query(`
      SELECT * FROM Llantas${whereClause}
      ORDER BY LlantaId DESC
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
      .query('SELECT * FROM Llantas WHERE LlantaId = @id');
    if (result.recordset.length === 0) return res.status(404).json({ error: 'Llanta no encontrada' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { marca, perfil, taco, medida, cantidad, precioCompra, precioVenta } = req.body;

    if (!marca || !perfil || !taco || !medida) {
      return res.status(400).json({ error: 'Marca, perfil, taco y medida son obligatorios' });
    }
    if (precioCompra == null || precioVenta == null) {
      return res.status(400).json({ error: 'Precio de compra y precio de venta son obligatorios' });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('marca', sql.NVarChar(100), marca)
      .input('perfil', sql.NVarChar(50), perfil)
      .input('taco', sql.NVarChar(50), taco)
      .input('medida', sql.NVarChar(50), medida)
      .input('cantidad', sql.Int, cantidad || 0)
      .input('precioCompra', sql.Decimal(10, 2), precioCompra)
      .input('precioVenta', sql.Decimal(10, 2), precioVenta)
      .query(`
        INSERT INTO Llantas (Marca, Perfil, Taco, Medida, Cantidad, PrecioCompra, PrecioVenta)
        OUTPUT INSERTED.*
        VALUES (@marca, @perfil, @taco, @medida, @cantidad, @precioCompra, @precioVenta)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { marca, perfil, taco, medida, cantidad, precioCompra, precioVenta } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('marca', sql.NVarChar(100), marca)
      .input('perfil', sql.NVarChar(50), perfil)
      .input('taco', sql.NVarChar(50), taco)
      .input('medida', sql.NVarChar(50), medida)
      .input('cantidad', sql.Int, cantidad)
      .input('precioCompra', sql.Decimal(10, 2), precioCompra)
      .input('precioVenta', sql.Decimal(10, 2), precioVenta)
      .query(`
        UPDATE Llantas
        SET Marca=@marca, Perfil=@perfil, Taco=@taco, Medida=@medida,
            Cantidad=@cantidad, PrecioCompra=@precioCompra, PrecioVenta=@precioVenta
        OUTPUT INSERTED.*
        WHERE LlantaId=@id
      `);
    if (result.recordset.length === 0) return res.status(404).json({ error: 'Llanta no encontrada' });
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
      .query('DELETE FROM Llantas WHERE LlantaId=@id');
    res.json({ mensaje: 'Llanta eliminada' });
  } catch (err) {
    res.status(400).json({ error: 'No se puede eliminar: la llanta tiene ventas asociadas' });
  }
};