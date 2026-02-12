/**
 * Vercel serverless: devuelve la URL del backend (VITE_API_URL) para que el cliente la use en todos los navegadores.
 */
export default function handler(req, res) {
  const url = (process.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({ url });
}
