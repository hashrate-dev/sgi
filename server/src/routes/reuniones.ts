import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { fetchCalendlyAgenda } from "../lib/calendlyAgenda.js";

export const reunionesRouter = Router();

reunionesRouter.get(
  "/reuniones/agenda",
  requireAuth,
  requireRole("admin_a", "admin_b"),
  async (req, res, next) => {
    try {
      const token = process.env.CALENDLY_API_TOKEN?.trim();
      const rangeRaw = String(req.query.range ?? "upcoming").toLowerCase();
      const range = rangeRaw === "past" ? "past" : "upcoming";

      if (!token) {
        res.json({
          configured: false,
          range,
          ownerName: null,
          ownerTimezone: null,
          events: [],
          fetchedAt: new Date().toISOString(),
          message:
            "Calendly no está configurado en el servidor. Definí CALENDLY_API_TOKEN (Personal Access Token de Calendly).",
        });
        return;
      }

      const agenda = await fetchCalendlyAgenda(token, range);
      res.json({ configured: true, ...agenda });
    } catch (err) {
      next(err);
    }
  }
);
