const { normalizePhone } = require('../src/phone');

describe('normalizePhone', () => {
  it('keeps valid Brazilian numbers with country code', () => {
    expect(normalizePhone('+55 (31) 99999-0000')).toBe('5531999990000');
  });

  it('adds Brazil country code when the number has only DDD and subscriber digits', () => {
    expect(normalizePhone('(31) 98888-7777')).toBe('5531988887777');
  });

  it('rejects missing or too short numbers', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('1234')).toBeNull();
  });
});
