const { loadConfig } = require('../src/config');

describe('loadConfig', () => {
  it('uses safe local defaults for Windows/PM2 deployment', () => {
    const config = loadConfig({});

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(8080);
    expect(config.instance).toBe('loja');
    expect(config.sessionDir).toContain('sessions');
    expect(config.apiKey).toBe('');
  });

  it('accepts explicit env settings and normalizes port', () => {
    const config = loadConfig({
      WHATSAPP_SERVICE_HOST: '0.0.0.0',
      WHATSAPP_SERVICE_PORT: '9090',
      WHATSAPP_SERVICE_INSTANCE: 'arte',
      WHATSAPP_SERVICE_SESSION_DIR: 'C:\\sistemaarte\\whatsapp-sessions',
      WHATSAPP_SERVICE_API_KEY: 'secret',
    });

    expect(config).toMatchObject({
      host: '0.0.0.0',
      port: 9090,
      instance: 'arte',
      sessionDir: 'C:\\sistemaarte\\whatsapp-sessions',
      apiKey: 'secret',
    });
  });
});
