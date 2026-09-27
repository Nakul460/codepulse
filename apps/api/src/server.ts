import cors from "cors";
import express from "express";
import { loadRootEnv } from "./env.js";
import { webhookRouter } from "./ingest/webhook.js";
import { internalRouter } from "./internal.js";
import { apiMongoose, connect } from "./db.js";

loadRootEnv();

const app = express();
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);

// The browser only ever talks to the Next.js origin, which proxies /api/ingest
// here. This is belt-and-braces for local development, where the two run on
// different ports.
const allowedOrigins = (process.env.API_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
  }),
);

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "api" });
});

app.get("/ready", (_request, response) => {
  // Liveness only. Readiness against Mongo and Redis is the worker's concern
  // and is reported through the queue, not this process.
  response.json({ ok: true });
});

app.use("/api/ingest", webhookRouter);
app.use("/api/internal", internalRouter);

app.use((_request, response) => {
  response.status(404).json({ message: "Not found" });
});

await connect();

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`[api] listening on http://localhost:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[api] ${signal} received, closing`);
    server.close(() => {
      void apiMongoose.connection.close().finally(() => process.exit(0));
    });
  });
}
