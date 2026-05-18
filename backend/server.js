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
  throw new Error("[Config] CORS_ORIGINS deve ser definido em produção!");
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
  message: { error: "Muitas requisições. Tente novamente em instantes." },
});
app.use("/api", globalLimiter);

// ── Rotas ──────────────────────────────────────────────────────────────────────
app.use("/api/auth",        require("./routes/auth"));
app.use("/api/users",       require("./routes/users"));
app.use("/api/clientes",    require("./routes/clientes"));
app.use("/api/ordens",      require("./routes/ordens"));
app.use("/api/ordens",      require("./routes/pdf"));
app.use("/api/caixa",       require("./routes/caixa"));
app.use("/api/relatorios",  require("./routes/relatorios"));
app.use("/api/consulta",    require("./routes/consulta"));
app.use("/api/backup",      require("./routes/backup"));
app.use("/api/produtos",    require("./routes/produtos"));
app.use("/api/configuracoes", require("./routes/configuracoes"));
app.use("/api/kpis",        require("./routes/kpis"));
// ── NF-e ──────────────────────────────────────────────────────────────────────
app.use("/api/nfe",         require("./routes/nfe"));
app.use("/api/certificado", require("./routes/certificado"));

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Backup automático diário — verifica a cada 5min às 2h BRT (Intl, DST-safe)
let _backupDate = "";
setInterval(() => {
  const hj = hoje(); // BRT correto via utils/dates
  const h  = parseInt(
    new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })
      .format(new Date()),
    10
  );
  if (h >= 2 && _backupDate !== hj) {
    _backupDate = hj;
    backup()
      .then(() => console.log("[Backup] Concluido:", new Date().toISOString()))
      .catch(err => console.error("[Backup] FALHOU:", err.message));
  }
}, 5 * 60 * 1000);

// ── Servir SPA ─────────────────────────────────────────────────────────────────
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
  console.log("\n╔══════════════════════════════════════╗");
  console.log(`║  Sistema Oficina — Servidor OK       ║`);
  console.log(`║  http://0.0.0.0:${PORT}                 ║`);
  console.log("╚══════════════════════════════════════╝\n");
});
