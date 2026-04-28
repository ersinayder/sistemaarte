require("dotenv").config();
const express      = require("express");
const cors         = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit    = require("express-rate-limit");
const path         = require("path");
const fs           = require("fs");

const { initDB, backup }     = require("./database");
const { auth }               = require("./middlewares/auth");
const { errorHandler }       = require("./middlewares/errorHandler");
const { hoje }               = require("./utils/dates");

const IS_PROD = process.env.NODE_ENV === "production";

if (IS_PROD && !process.env.CORS_ORIGINS) {
  throw new Error("[Config] CORS_ORIGINS deve ser definido em produ\u00e7\u00e3o!");
}

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map(o => o.trim())
  : ["http://localhost:5173"];

const app  = express();
const PORT = process.env.PORT || 3001;

app.set("trust proxy", 1);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/kpis/stream'),
  message: { error: "Muitas requisi\u00e7\u00f5es. Tente novamente em instantes." },
});
app.use("/api", globalLimiter);

// ── Rotas ────────────────────────────────────────────────────────────────────────────────────
app.use("/api/auth",       require("./routes/auth"));
app.use("/api/users",      require("./routes/users"));
app.use("/api/clientes",   require("./routes/clientes"));
app.use("/api/ordens",     require("./routes/ordens"));
app.use("/api/ordens",     require("./routes/pdf"));
app.use("/api/caixa",      require("./routes/caixa"));
app.use("/api/relatorios", require("./routes/relatorios"));
app.use("/api/consulta",   require("./routes/consulta"));
app.use("/api/backup",     require("./routes/backup"));
app.use("/api/produtos",   require("./routes/produtos"));
app.use("/api/kpis",       require("./routes/kpis"));

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Backup automático diário — verifica a cada 5min; usa hoje() BRT para evitar mismatch UTC
let _backupDate = "";
setInterval(() => {
  const hj = hoje(); // BRT correto via utils/dates
  const h  = new Date(Date.now() - 3 * 60 * 60 * 1000).getHours(); // hora BRT
  if (h >= 2 && _backupDate !== hj) {
    _backupDate = hj;
    backup()
      .then(() => console.log("[Backup] Concluido:", new Date().toISOString()))
      .catch(err => console.error("[Backup] FALHOU:", err.message));
  }
}, 5 * 60 * 1000);

// ── Servir SPA ─────────────────────────────────────────────────────────────────────────────────────
const DIST = path.join(__dirname, "..", "frontend", "dist");
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) return res.status(404).json({ error: "Rota nao encontrada" });
    res.sendFile(path.join(DIST, "index.html"));
  });
} else {
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) return res.status(404).json({ error: "Rota nao encontrada" });
    res.send("<h2>Frontend nao encontrado. Rode <code>npm run build</code> dentro de <code>frontend</code></h2>");
  });
}

app.use(errorHandler);

initDB();
app.listen(PORT, "0.0.0.0", () => {
  console.log("\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
  console.log(`\u2551  Sistema Oficina \u2014 Servidor OK       \u2551`);
  console.log(`\u2551  http://0.0.0.0:${PORT}                 \u2551`);
  console.log("\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d\n");
});
