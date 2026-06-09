module.exports = {
  apps: [
    {
      name: 'sistema-arte-whatsapp',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '350M',
      env: {
        NODE_ENV: 'production',
        WHATSAPP_SERVICE_HOST: process.env.WHATSAPP_SERVICE_HOST || '127.0.0.1',
        WHATSAPP_SERVICE_PORT: process.env.WHATSAPP_SERVICE_PORT || '8080',
        WHATSAPP_SERVICE_INSTANCE: process.env.WHATSAPP_SERVICE_INSTANCE || process.env.WHATSAPP_WEB_INSTANCE || 'loja',
        WHATSAPP_SERVICE_SESSION_DIR: process.env.WHATSAPP_SERVICE_SESSION_DIR || './sessions',
        WHATSAPP_SERVICE_API_KEY: process.env.WHATSAPP_SERVICE_API_KEY || process.env.WHATSAPP_WEB_API_KEY,
        WHATSAPP_SERVICE_LOG_LEVEL: process.env.WHATSAPP_SERVICE_LOG_LEVEL || 'warn',
      },
    },
  ],
};
