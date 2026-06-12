const {
  buildSocketOptions,
  createRecentMessageStore,
  getDisconnectStatusCode,
  resolveRecipientJid,
} = require('../src/baileysClient');

describe('getDisconnectStatusCode', () => {
  it('reads Baileys Boom status code when available', () => {
    expect(getDisconnectStatusCode({ error: { output: { statusCode: 401 } } })).toBe(401);
  });

  it('falls back to direct statusCode and returns null when absent', () => {
    expect(getDisconnectStatusCode({ error: { statusCode: 515 } })).toBe(515);
    expect(getDisconnectStatusCode(null)).toBeNull();
  });
});

describe('buildSocketOptions', () => {
  it('keeps Baileys init queries enabled and exposes getMessage for retry handling', () => {
    const logger = { level: 'warn' };
    const auth = { creds: {}, keys: {} };
    const getMessage = vi.fn();
    const options = buildSocketOptions({
      version: [2, 3000, 0],
      auth,
      logger,
      getMessage,
    });

    expect(options).toMatchObject({
      version: [2, 3000, 0],
      auth,
      logger,
      printQRInTerminal: false,
      syncFullHistory: false,
      fireInitQueries: true,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60000,
      getMessage,
    });
    expect(options.defaultQueryTimeoutMs).toBeUndefined();
    expect(options.shouldSyncHistoryMessage).toBeUndefined();
  });
});

describe('createRecentMessageStore', () => {
  it('keeps sent message content available for Baileys retry requests', async () => {
    const store = createRecentMessageStore({ ttlMs: 60000, maxSize: 2 });
    const message = { conversation: 'Oi' };

    store.save({ key: { id: 'MSG1', remoteJid: '5531999990000@s.whatsapp.net' }, message });

    await expect(store.getMessage({ id: 'MSG1' })).resolves.toBe(message);
  });

  it('drops old sent messages beyond the configured cache size', async () => {
    const store = createRecentMessageStore({ ttlMs: 60000, maxSize: 2 });

    store.save({ key: { id: 'MSG1' }, message: { conversation: 'um' } });
    store.save({ key: { id: 'MSG2' }, message: { conversation: 'dois' } });
    store.save({ key: { id: 'MSG3' }, message: { conversation: 'tres' } });

    await expect(store.getMessage({ id: 'MSG1' })).resolves.toBeUndefined();
    await expect(store.getMessage({ id: 'MSG2' })).resolves.toEqual({ conversation: 'dois' });
    await expect(store.getMessage({ id: 'MSG3' })).resolves.toEqual({ conversation: 'tres' });
  });
});

describe('resolveRecipientJid', () => {
  it('uses the jid returned by WhatsApp lookup before sending', async () => {
    const sock = {
      onWhatsApp: vi.fn(() => Promise.resolve([{ exists: true, jid: '553191213101@s.whatsapp.net' }])),
    };

    await expect(resolveRecipientJid(sock, '5531991213101')).resolves.toBe('553191213101@s.whatsapp.net');
    expect(sock.onWhatsApp).toHaveBeenCalledWith('5531991213101');
  });

  it('rejects numbers that WhatsApp does not recognize', async () => {
    const sock = {
      onWhatsApp: vi.fn(() => Promise.resolve([{ exists: false, jid: '5531991213101@s.whatsapp.net' }])),
    };

    await expect(resolveRecipientJid(sock, '5531991213101')).rejects.toThrow('Numero nao encontrado no WhatsApp');
  });
});
