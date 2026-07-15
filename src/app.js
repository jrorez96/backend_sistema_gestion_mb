const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

const allowedOrigins = [
  'http://localhost:5173',                 // desarrollo local
  process.env.FRONTEND_URL,                // se define en Render (tu dominio de Vercel)
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
}));

app.use(express.json());

app.use('/api/clientes', clientesRoutes);
app.use('/api/llantas', llantasRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/viajes', viajesRoutes);
app.use('/api/facturas', facturasRoutes);
app.use('/api/reportes', reportesRoutes);

app.get('/', (req, res) => res.send('API funcionando correctamente'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));