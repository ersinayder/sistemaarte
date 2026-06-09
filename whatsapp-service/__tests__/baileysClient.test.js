const { getDisconnectStatusCode } = require('../src/baileysClient');

describe('getDisconnectStatusCode', () => {
  it('reads Baileys Boom status code when available', () => {
    expect(getDisconnectStatusCode({ error: { output: { statusCode: 401 } } })).toBe(401);
  });

  it('falls back to direct statusCode and returns null when absent', () => {
    expect(getDisconnectStatusCode({ error: { statusCode: 515 } })).toBe(515);
    expect(getDisconnectStatusCode(null)).toBeNull();
  });
});
