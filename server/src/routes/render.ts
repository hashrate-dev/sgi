/**
 * Integración con Render API (https://api-docs.render.com/reference/authentication).
 * Requiere RENDER_API_KEY en el entorno. La key se crea en:
 * https://dashboard.render.com → Account Settings → API Keys
 */
import { Router, Request, Response } from "express";
import { env } from "../config/env.js";

const RENDER_API_BASE = "https://api.render.com/v1";

const renderRouter = Router();

function getAuthHeader(): string | null {
  const key = env.RENDER_API_KEY?.trim();
  if (!key) return null;
  return `Bearer ${key}`;
}

/**
 * GET /api/render/services?limit=20
 * Lista servicios del usuario en Render.
 */
renderRouter.get("/render/services", async (req: Request, res: Response) => {
  const auth = getAuthHeader();
  if (!auth) {
    res.status(503).json({
      error: {
        message: "RENDER_API_KEY no configurada. Añadila en Variables de entorno (Render o .env) y redeploy."
      }
    });
    return;
  }

  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const url = `${RENDER_API_BASE}/services?limit=${limit}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: auth
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      res.status(response.status).json({
        error: {
          message: (data as { message?: string })?.message ?? "Error al conectar con Render API",
          status: response.status
        }
      });
      return;
    }

    res.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({
      error: { message: `Error de conexión con Render API: ${msg}` }
    });
  }
});

/**
 * POST /api/render/services/:serviceId/deploy
 * Dispara un deploy del servicio indicado.
 * serviceId = ID del servicio en Render (ej. srv-xxx).
 */
renderRouter.post("/render/services/:serviceId/deploy", async (req: Request, res: Response) => {
  const auth = getAuthHeader();
  if (!auth) {
    res.status(503).json({
      error: { message: "RENDER_API_KEY no configurada." }
    });
    return;
  }

  const { serviceId } = req.params;
  if (!serviceId) {
    res.status(400).json({ error: { message: "Falta serviceId." } });
    return;
  }

  const url = `${RENDER_API_BASE}/services/${serviceId}/deploys`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: auth
      },
      body: JSON.stringify({ clearCache: "do_not_clear" })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      res.status(response.status).json({
        error: {
          message: (data as { message?: string })?.message ?? "Error al disparar deploy",
          status: response.status
        }
      });
      return;
    }

    res.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({
      error: { message: `Error de conexión con Render API: ${msg}` }
    });
  }
});

export { renderRouter };
