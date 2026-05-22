import type { Request, Response, NextFunction } from "express";

const QUOTE_CART_ROLES = new Set(["cliente", "admin_a", "admin_b", "operador", "lector"]);

type QuoteCartUser = { role: string };

/** Carrito / quote-sync: cualquier usuario autenticado con rol del sistema. */
export function canUseMarketplaceQuoteCart(user: QuoteCartUser): boolean {
  return QUOTE_CART_ROLES.has(String(user.role).toLowerCase().trim());
}

export function requireMarketplaceQuoteCartAccess(req: Request, res: Response, next: NextFunction): void {
  const u = req.user;
  if (!u) {
    res.status(401).json({ error: { message: "No autenticado" } });
    return;
  }
  if (canUseMarketplaceQuoteCart(u)) {
    next();
    return;
  }
  res.status(403).json({
    error: { message: "Tu cuenta no puede usar el carrito de cotización del marketplace." },
  });
}
