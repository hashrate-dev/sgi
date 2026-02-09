import express from 'express';

const app = express();
app.listen(8080, () => console.log("Server on"));

app.use(express.json());
app.use(express.urlencoded({ extended: true})); 
app.use('/static', express.static('./public'));