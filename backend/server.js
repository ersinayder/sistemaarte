require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");

const { initDB, backup } = require("./database");
const { auth }           = require("./middlewares/auth");

const app  = express();
const PORT = process.env.PORT || 3001;

// CORS — libera same-origin e origens localhost em dev
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ── Rotas ──────────────────────────────────────────────────────────────────
app.use("/api/auth",      require("./routes/auth"));
app.use("/api/users",     require("./routes/users"));
app.use("/api/clientes",  require("./routes/clientes"));
app.use("/api/ordens",    require("./routes/ordens"));
app.use("/api/caixa",     require("./routes/caixa"));
app.use("/api/relatorios",require("./routes/relatorios"));
app.use("/api/consulta",  require("./routes/consulta"));
app.use("/api/backup",    require("./routes/backup"));
app.use("/api/produtos",  require("./routes/produtos"));

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Backup automático diário às 02:00
setInterval(() => {
  const h = new Date().getHours();
  if (h === 2) backup().catch(() => {});
}, 60 * 60 * 1000);

// ── Servir SPA ─────────────────────────────────────────────────────────────
const DIST = path.join(__dirname, "..", "frontend", "dist");
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) return res.status(404).json({ error: "Rota não encontrada" });
    res.sendFile(path.join(DIST, "index.html"));
  });
} else {
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) return res.status(404).json({ error: "Rota não encontrada" });
    res.send("<h2>Frontend não encontrado. Rode <code>npm run build</code> dentro de <code>frontend</code></h2>");
  });
}

// ── Init ───────────────────────────────────────────────────────────────────
initDB();
app.listen(PORT, "0.0.0.0", () => {
  console.log("\n╔══════════════════════════════════════╗");
  console.log(`║  Sistema Oficina — Servidor OK       ║`);
  console.log(`║  http://0.0.0.0:${PORT}                 ║`);
  console.log("╚══════════════════════════════════════╝\n");
});
