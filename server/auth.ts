import crypto from "node:crypto";
import type { RequestHandler } from "express";
import { config } from "./config.ts";

const same = (a: string, b: string) => {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

/**
 * HTTP Basic auth in front of the whole app when BASIC_AUTH_PASSWORD is set.
 * Left open: the host's health check, and /api/announce (it has its own bearer token,
 * and CI can't send both in one Authorization header).
 */
export const basicAuth: RequestHandler = (req, res, next) => {
  if (!config.basicAuthPassword) return next();
  if (req.path === "/healthz" || req.path === "/api/announce") return next();

  const [scheme, encoded] = (req.headers.authorization ?? "").split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString();
    const split = decoded.indexOf(":");
    const user = decoded.slice(0, split);
    const pass = decoded.slice(split + 1);
    // Check both, always, so timing doesn't reveal which one was wrong.
    const ok = same(user, config.basicAuthUser) && same(pass, config.basicAuthPassword);
    if (split >= 0 && ok) return next();
  }
  res.set("WWW-Authenticate", `Basic realm="${config.paperName.replace(/"/g, "")}", charset="UTF-8"`);
  res.status(401).send("Sign in to read the paper");
};
