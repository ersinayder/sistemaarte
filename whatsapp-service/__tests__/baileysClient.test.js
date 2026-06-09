const { buildSocketOptions, getDisconnectStatusCode, resolveRecipientJid } = require('../src/baileysClient');

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
  it('disables expensive startup sync for a send-only local service', () => {
    const logger = { level: 'warn' };
    const auth = { creds: {}, keys: {} };
    const options = buildSocketOptions({
      version: [2, 3000, 0],
      auth,
      logger,
    });

    expect(options).toMatchObject({
      version: [2, 3000, 0],
      auth,
      logger,
      printQRInTerminal: false,
      syncFullHistory: false,
      fireInitQueries: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60000,
    });
    expect(options.defaultQueryTimeoutMs).toBeUndefined();
    expect(options.shouldSyncHistoryMessage()).toBe(false);
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
