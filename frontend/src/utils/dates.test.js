import { describe, it, expect } from 'vitest';
import { hojeBrt, hojeMaisDiasBrt, mesAtualBrt } from './dates';

describe('frontend dates utilities', () => {
  it('retorna a data no fuso de Brasilia mesmo entre 21h e 23h59 UTC (noite em BRT)', () => {
    // 2026-10-16 22:30:00 BRT is 2026-10-17 01:30:00 UTC
    const dateAtNight = new Date('2026-10-17T01:30:00.000Z');
    expect(hojeBrt(dateAtNight)).toBe('2026-10-16');
    expect(mesAtualBrt(dateAtNight)).toBe('2026-10');
    expect(hojeMaisDiasBrt(5, dateAtNight)).toBe('2026-10-21');
  });

  it('retorna a data correta pela manha em Brasilia', () => {
    // 2026-10-16 08:15:00 BRT is 2026-10-16 11:15:00 UTC
    const dateMorning = new Date('2026-10-16T11:15:00.000Z');
    expect(hojeBrt(dateMorning)).toBe('2026-10-16');
    expect(mesAtualBrt(dateMorning)).toBe('2026-10');
    expect(hojeMaisDiasBrt(7, dateMorning)).toBe('2026-10-23');
  });

  it('suporta virada de mes e dias negativos em hojeMaisDiasBrt', () => {
    const endOfMonth = new Date('2026-10-31T15:00:00.000Z'); // 12h BRT
    expect(hojeBrt(endOfMonth)).toBe('2026-10-31');
    expect(hojeMaisDiasBrt(1, endOfMonth)).toBe('2026-11-01');
    expect(hojeMaisDiasBrt(-1, endOfMonth)).toBe('2026-10-30');
    expect(hojeMaisDiasBrt(0, endOfMonth)).toBe('2026-10-31');
  });

  it('funciona com valores default (now omitido)', () => {
    expect(hojeBrt()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mesAtualBrt()).toMatch(/^\d{4}-\d{2}$/);
    expect(hojeMaisDiasBrt(3)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
