import { Hono } from "hono";
import { cors } from "hono/cors";
import { ZodError } from "zod";
import { AUTH_HEADER } from "@konfam/shared";
import { BankError } from "./bank/types";
import type { AppDeps } from "./deps";
import { HttpError } from "./errors";
import { attestationRoutes } from "./routes/attestation";
import { bankRoutes } from "./routes/bank";
import { intentsRoutes } from "./routes/intents";
import { payeeRoutes } from "./routes/payee";
import { sandboxRoutes } from "./routes/sandbox";
import { tradeRoutes } from "./routes/trades";

export function createApp(deps: AppDeps) {
  const origins = deps.config.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: origins.includes("*") ? "*" : origins,
      allowHeaders: ["content-type", AUTH_HEADER],
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    }),
  );

  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json({ error: error.message }, error.status);
    if (error instanceof BankError) return c.json({ error: error.message }, error.status);
    if (error instanceof ZodError) {
      return c.json({ error: error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") }, 400);
    }
    if (error instanceof SyntaxError) return c.json({ error: "Invalid JSON body" }, 400);
    console.error(error);
    return c.json({ error: "Internal error" }, 500);
  });

  app.get("/health", (c) =>
    c.json({ ok: true, mode: deps.chain.mode, bank: deps.bank.name, watching: deps.verifier.watched().length }),
  );
  app.route("/", attestationRoutes(deps));
  app.route("/", bankRoutes(deps));
  app.route("/", payeeRoutes(deps));
  app.route("/", tradeRoutes(deps));
  app.route("/", intentsRoutes(deps.intents));
  if (deps.sandbox) app.route("/", sandboxRoutes(deps.sandbox));

  return app;
}
