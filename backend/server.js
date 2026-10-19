require("dotenv").config();
const express      = require("express");
const cors         = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit    = require("express-rate-limit");
const helmet       = require("helmet");
const path         = require("path");
const fs           = require("fs");

const { initDB, backup, shouldRunBackup, setBackupDate } = require("./database");
const { auth }               = require("./middlewares/auth");
const { errorHandler }       = require("./middlewares/errorHandler");
const { csrfOriginGuard }    = require("./middlewares/csrfOriginGuard");
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
const HOST = process.env.HOST || "127.0.0.1";

const TRUST_PROXY = process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true" ? 1 : false;
app.set("trust proxy", TRUST_PROXY);

app.use(helmet({ contentSecurityPolicy: { directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), "upgrade-insecure-requests": null } } }));
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use("/api", csrfOriginGuard({ allowedOrigins }));

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/kpis/stream') || req.path.startsWith('/impressao/agente/stream'),
  message: { error: "Muitas requisições. Tente novamente em instantes." },
});
app.use("/api", globalLimiter);

// ── Rotas ──────────────────────────────────────────────────────────────────────
app.use("/api/auth",        require("./routes/auth"));
app.use("/api/users",       require("./routes/users"));
app.use("/api/permission-profiles", require("./routes/permissionProfiles"));
app.use("/api/clientes",    require("./routes/clientes"));
app.use("/api/ordens",      require("./routes/ordens"));
app.use("/api/ordens",      require("./routes/pdf"));
app.use("/api/propostas",   require("./routes/propostas"));
app.use("/api/caixa",       require("./routes/caixa"));
app.use("/api/relatorios",  require("./routes/relatorios"));
app.use("/api/financeiro",  require("./routes/financeiro"));
app.use("/api/consulta",    require("./routes/consulta"));
app.use("/api/backup",      require("./routes/backup"));
app.use("/api/produtos",    require("./routes/produtos"));
app.use("/api/configuracoes", require("./routes/configuracoes"));
app.use("/api/servidor",      require("./routes/servidor"));
app.use("/api/kpis",        require("./routes/kpis"));
app.use("/api/impressao/agente", require("./routes/impressaoAgente"));
// ── NF-e ──────────────────────────────────────────────────────────────────────
app.use("/api/nfe",         require("./routes/nfe"));

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Backup automático diário — verifica a cada 5min às 2h BRT (Intl, DST-safe)
setInterval(() => {
  if (shouldRunBackup()) {
    setBackupDate(hoje());
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

// WhatsApp: worker de background somente se expressamente habilitado por env (desativado por padrao para evitar bloqueio)
if (process.env.WHATSAPP_WEB_ENABLED === "true") {
  const { getWhatsappRuntimeConfig } = require("./utils/whatsappConfig");
  const { createWhatsappWebProvider } = require("./utils/whatsappWebProvider");
  const { createWhatsappWorker } = require("./utils/whatsappWorker");
  const runtime = getWhatsappRuntimeConfig();
  if (runtime.provider === "web_local" && runtime.enabled && runtime.webBaseUrl && runtime.webInstance) {
    const provider = createWhatsappWebProvider({
      baseUrl: runtime.webBaseUrl,
      instance: runtime.webInstance,
      apiKey: runtime.webApiKey,
    });
    createWhatsappWorker({ provider }).start();
    console.log("[WhatsAppWorker] Fila automatica ativa.");
  }
}

app.listen(PORT, HOST, () => {
  console.log("\n╔══════════════════════════════════════╗");
  console.log(`║  Sistema Oficina — Servidor OK       ║`);
  console.log(`║  http://${HOST}:${PORT}                 ║`);
  console.log("╚══════════════════════════════════════╝\n");
});
