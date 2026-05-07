// PM2 ecosystem — carrega variaveis de ambiente do .env em producao
// O .env NUNCA e commitado (esta no .gitignore)
// Em producao: C:\sistemaarte\backend\.env deve conter JWT_SECRET, CORS_ORIGINS, etc.
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
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3001,
        JWT_SECRET: process.env.JWT_SECRET,
        CORS_ORIGINS: process.env.CORS_ORIGINS,
      },
      error_file: 'C:\\Users\\Administrator\\.pm2\\logs\\sistemaarte-backend-error.log',
      out_file:   'C:\\Users\\Administrator\\.pm2\\logs\\sistemaarte-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
