// PM2 ecosystem — carrega variaveis do .env em producao
// O .env NUNCA e commitado (.gitignore)
require('dotenv').config();

module.exports = {
  apps: [
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
        // ── NF-e ──────────────────────────────────────────
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
  ],
};
