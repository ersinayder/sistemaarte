const request = require('supertest');

const { createApp } = require('../src/server');

function makeClient(overrides = {}) {
  return {
    getState: vi.fn(() => ({ state: 'close', connected: false, qr: null, lastError: null })),
    sendText: vi.fn(),
    ...overrides,
  };
}

describe('whatsapp-service HTTP contract', () => {
  it('reports connection state using Evolution-compatible fields', async () => {
    const client = makeClient({
      getState: vi.fn(() => ({ state: 'open', connected: true, qr: 'QRDATA', lastError: null })),
    });
    const app = createApp({ instance: 'loja', apiKey: '', client });

    const res = await request(app).get('/instance/connectionState/loja').expect(200);

    expect(res.body).toEqual({
      instance: { instanceName: 'loja', state: 'open' },
      state: 'open',
      connected: true,
      qrcode: 'QRDATA',
      qr: 'QRDATA',
      lastError: null,
    });
  });

  it('requires apikey when service API key is configured', async () => {
    const app = createApp({ instance: 'loja', apiKey: 'secret', client: makeClient() });

    await request(app).get('/instance/connectionState/loja').expect(401);
    await request(app).get('/instance/connectionState/loja').set('apikey', 'secret').expect(200);
  });

  it('returns 404 for unknown instances', async () => {
    const app = createApp({ instance: 'loja', apiKey: '', client: makeClient() });

    await request(app).get('/instance/connectionState/outra').expect(404);
    await request(app).post('/message/sendText/outra').send({ number: '5531999990000', text: 'Oi' }).expect(404);
  });

  it('does not send text while WhatsApp is disconnected', async () => {
    const client = makeClient();
    const app = createApp({ instance: 'loja', apiKey: '', client });

    const res = await request(app)
      .post('/message/sendText/loja')
      .send({ number: '5531999990000', text: 'Oi' })
      .expect(503);

    expect(res.body.error).toContain('desconectada');
    expect(client.sendText).not.toHaveBeenCalled();
  });

  it('normalizes the phone and sends text when connected', async () => {
    const client = makeClient({
      getState: vi.fn(() => ({ state: 'open', connected: true, qr: null, lastError: null })),
      sendText: vi.fn(() => Promise.resolve({ key: { id: 'MSG1' } })),
    });
    const app = createApp({ instance: 'loja', apiKey: '', client });

    const res = await request(app)
      .post('/message/sendText/loja')
      .send({ number: '(31) 99999-0000', text: 'Oi' })
      .expect(200);

    expect(client.sendText).toHaveBeenCalledWith({ number: '5531999990000', text: 'Oi' });
    expect(res.body).toEqual({ key: { id: 'MSG1' }, messageId: 'MSG1' });
  });

  it('rejects invalid send payloads before calling Baileys', async () => {
    const client = makeClient({
      getState: vi.fn(() => ({ state: 'open', connected: true, qr: null, lastError: null })),
    });
    const app = createApp({ instance: 'loja', apiKey: '', client });

    await request(app).post('/message/sendText/loja').send({ number: '1234', text: 'Oi' }).expect(400);
    await request(app).post('/message/sendText/loja').send({ number: '5531999990000', text: '' }).expect(400);
    expect(client.sendText).not.toHaveBeenCalled();
  });

  // SEC-02: API Key obrigatória
  describe('SEC-02: requireApiKey hardening', () => {
    it('/health responde 200 sem apiKey mesmo em production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const app = createApp({ instance: 'loja', apiKey: '', client: makeClient() });
        const res = await request(app).get('/health').expect(200);
        expect(res.body).toMatchObject({ ok: true, service: 'whatsapp-service', instance: 'loja' });
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('/health responde 200 com apiKey configurada sem enviar header', async () => {
      const app = createApp({ instance: 'loja', apiKey: 'chave-secreta', client: makeClient() });
      const res = await request(app).get('/health').expect(200);
      expect(res.body.ok).toBe(true);
    });

    it('retorna 503 em rotas autenticadas quando NODE_ENV=production e apiKey ausente', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const app = createApp({ instance: 'loja', apiKey: '', client: makeClient() });
        const res = await request(app).get('/instance/connectionState/loja').expect(503);
        expect(res.body.error).toContain('WHATSAPP_SERVICE_API_KEY ausente');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('passa em rotas autenticadas sem apiKey em NODE_ENV=test (dev-friendly)', async () => {
      // NODE_ENV já é 'test' no contexto do vitest
      const app = createApp({ instance: 'loja', apiKey: '', client: makeClient() });
      await request(app).get('/instance/connectionState/loja').expect(200);
    });

    it('retorna 401 com apiKey errada independente de NODE_ENV', async () => {
      const app = createApp({ instance: 'loja', apiKey: 'correta', client: makeClient() });
      const res = await request(app)
        .get('/instance/connectionState/loja')
        .set('apikey', 'errada')
        .expect(401);
      expect(res.body.error).toBe('API key invalida');
    });

    it('aceita apiKey correta via header apikey', async () => {
      const app = createApp({ instance: 'loja', apiKey: 'minha-chave', client: makeClient() });
      await request(app)
        .get('/instance/connectionState/loja')
        .set('apikey', 'minha-chave')
        .expect(200);
    });

    it('aceita apiKey correta via Bearer token', async () => {
      const app = createApp({ instance: 'loja', apiKey: 'minha-chave', client: makeClient() });
      await request(app)
        .get('/instance/connectionState/loja')
        .set('Authorization', 'Bearer minha-chave')
        .expect(200);
    });

    it('ignora apiKey composta somente de espaços (tratada como ausente)', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const app = createApp({ instance: 'loja', apiKey: '   ', client: makeClient() });
        // Chave composta de espaços → isConfigured=false → 503 em production
        await request(app).get('/instance/connectionState/loja').expect(503);
        // Mas /health continua acessível
        await request(app).get('/health').expect(200);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});
