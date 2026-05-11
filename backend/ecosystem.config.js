// PM2 ecosystem — carrega variaveis do .env em producao
// O .env NUNCA e commitado (.gitignore)
require('dotenv').config();

module.exports = {
  apps: [
    // ═══════════════════════════════════════════════════════════
    //  PRODUCAO — porta 3001 — branch main
    //  pm2 start ecosystem.config.js --only sistemaarte-backend --env production
    // ═══════════════════════════════════════════════════════════
    {
      name: 'sistemaarte-backend',
      script: './server.js',
      cwd: 'C:\\sistemaarte\\backend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '300M',
      env_production: {
        NODE_ENV:           'production',
        PORT:               process.env.PORT               || 3001,
        JWT_SECRET:         process.env.JWT_SECRET,
        CORS_ORIGINS:       process.env.CORS_ORIGINS,
        EVOLUTION_API_URL:  process.env.EVOLUTION_API_URL,
        EVOLUTION_API_KEY:  process.env.EVOLUTION_API_KEY,
        EVOLUTION_INSTANCE: process.env.EVOLUTION_INSTANCE,
        WHATSAPP_ENABLED:   process.env.WHATSAPP_ENABLED,
        // ── NF-e ──────────────────────────────────────────────
        NFE_CERT_PATH:      process.env.NFE_CERT_PATH,
        NFE_CERT_PASSWORD:  process.env.NFE_CERT_PASSWORD,
        NFE_AMBIENTE:       process.env.NFE_AMBIENTE      || 'homologacao',
        NFE_CNPJ_EMITENTE:  process.env.NFE_CNPJ_EMITENTE,
        NFE_IE_EMITENTE:    process.env.NFE_IE_EMITENTE,
      },
      error_file: 'C:\\Users\\Administrator\\.pm2\\logs\\sistemaarte-backend-error.log',
      out_file:   'C:\\Users\\Administrator\\.pm2\\logs\\sistemaarte-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    // ═══════════════════════════════════════════════════════════
    //  DEV/HOMOLOGACAO NF-e — porta 3002 — branch feat/nfe-sprint-*
    //
    //  Setup inicial no servidor:
    //    git clone https://github.com/ersinayder/sistemaarte C:\sistemaarte-dev
    //    cd C:\sistemaarte-dev && git checkout feat/nfe-sprint-1
    //    cd backend && npm install
    //    copy .env.example .env   (editar: PORT=3002, NFE_AMBIENTE=homologacao)
    //
    //  Iniciar:  pm2 start ecosystem.config.js --only sistemaarte-dev --env dev
    //  Parar:    pm2 stop sistemaarte-dev
    //  Logs:     pm2 logs sistemaarte-dev
    // ═══════════════════════════════════════════════════════════
    {
      name: 'sistemaarte-dev',
      script: './server.js',
      cwd: 'C:\\sistemaarte-dev\\backend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '200M',
      env_dev: {
        NODE_ENV:           'production',   // usa o mesmo guard de producao
        PORT:               3002,
        JWT_SECRET:         process.env.JWT_SECRET,
        CORS_ORIGINS:       process.env.CORS_ORIGINS_DEV || 'http://localhost:5174',
        EVOLUTION_API_URL:  process.env.EVOLUTION_API_URL,
        EVOLUTION_API_KEY:  process.env.EVOLUTION_API_KEY,
        EVOLUTION_INSTANCE: process.env.EVOLUTION_INSTANCE,
        WHATSAPP_ENABLED:   'false',
        // ── NF-e HOMOLOGACAO ──────────────────────────────────
        // Aponta para o mesmo .pfx de homologacao (nunca producao aqui)
        NFE_CERT_PATH:      process.env.NFE_CERT_PATH,
        NFE_CERT_PASSWORD:  process.env.NFE_CERT_PASSWORD,
        NFE_AMBIENTE:       'homologacao',  // HARDCODED — nunca muda neste app
        NFE_CNPJ_EMITENTE:  process.env.NFE_CNPJ_EMITENTE,
        NFE_IE_EMITENTE:    process.env.NFE_IE_EMITENTE,
      },
      error_file: 'C:\\Users\\Administrator\\.pm2\\logs\\sistemaarte-dev-error.log',
      out_file:   'C:\\Users\\Administrator\\.pm2\\logs\\sistemaarte-dev-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
