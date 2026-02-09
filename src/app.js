import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const publicPath = path.join(__dirname, '../public');
const PORT = process.env.PORT || 8080;

app.use(express.json()); // PARA PODER MANIPULAR JSON , NOS PERMITE RECIBIR EL JSON MEDIANTE POST
app.use(express.urlencoded({ extended: true})); 

// Route for home page
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Route for facturacion page
app.get('/facturacion', (req, res) => {
  res.sendFile(path.join(publicPath, 'facturacion.html'));
});

// Serve static files after routes
app.use(express.static(publicPath));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Error interno del servidor');
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));