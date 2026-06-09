const { buildSocketOptions, getDisconnectStatusCode } = require('../src/baileysClient');

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
