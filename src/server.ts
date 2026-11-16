import Fastify from "fastify";
import formbody from "@fastify/formbody";
import { config } from "./config.js";
import { PaymentError, quoteNgn } from "./payments.js";

export function buildServer() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
  app.register(formbody);

  app.get("/health", async () => ({ ok: true }));

  app.get<{ Querystring: { ngn?: string } }>("/quote", async (req, reply) => {
    const amountNgn = Number(req.query.ngn);
    try {
      return await quoteNgn(amountNgn);
    } catch (err) {
      if (err instanceof PaymentError) return reply.code(400).send({ error: err.code, message: err.message });
      req.log.error({ err: (err as Error).message }, "quote failed");
      return reply.code(502).send({ error: "RATE_UNAVAILABLE", message: "Could not fetch the BTC/NGN rate" });
    }
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildServer()
    .listen({ port: config.port, host: "0.0.0.0" })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
