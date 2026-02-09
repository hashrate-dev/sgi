import express from 'express';

const app = express();

// IMPORTANTE: Koyeb asigna el puerto automáticamente. 
// Usamos process.env.PORT para leerlo, y 8080 como respaldo local.
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/static', express.static('./public'));

// Ruta de prueba para saber que funciona
app.get('/', (req, res) => {
    res.send("¡Servidor de Facturación funcionando en Koyeb!");
});

// IMPORTANTE: Escuchar en '0.0.0.0' para que sea accesible externamente
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server on port ${PORT}`);
});