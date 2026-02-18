/** Mínimo: responde sin cargar server. Para diagnosticar si la API está desplegada. */
export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.status(200).end(JSON.stringify({ ok: true, t: Date.now() }));
}
