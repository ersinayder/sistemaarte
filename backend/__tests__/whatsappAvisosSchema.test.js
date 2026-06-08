import { describe, expect, it } from 'vitest';
import fs from 'fs';

describe('whatsapp avisos schema', () => {
  it('creates a persisted notice table with idempotent OS/type tracking', () => {
    const source = fs.readFileSync(new URL('../database.js', import.meta.url), 'utf8');

    expect(source).toMatch(/CREATE TABLE IF NOT EXISTS whatsapp_avisos/);
    expect(source).toMatch(/ordemid\s+INTEGER NOT NULL/);
    expect(source).toMatch(/tipo\s+TEXT NOT NULL/);
    expect(source).toMatch(/status\s+TEXT NOT NULL DEFAULT 'pendente'/);
    expect(source).toMatch(/telefone_snapshot\s+TEXT/);
    expect(source).toMatch(/mensagem_snapshot\s+TEXT/);
    expect(source).toMatch(/aberto_por\s+INTEGER/);
    expect(source).toMatch(/enviado_por\s+INTEGER/);
    expect(source).toMatch(/ignorado_por\s+INTEGER/);
    expect(source).toMatch(/aberto_em\s+TEXT/);
    expect(source).toMatch(/enviado_em\s+TEXT/);
    expect(source).toMatch(/ignorado_em\s+TEXT/);
    expect(source).toMatch(/createdat\s+TEXT DEFAULT \(datetime\('now','localtime'\)\)/);
    expect(source).toMatch(/updatedat\s+TEXT DEFAULT \(datetime\('now','localtime'\)\)/);
    expect(source).toMatch(/UNIQUE\s*\(\s*ordemid\s*,\s*tipo\s*\)/);
    expect(source).toMatch(/idx_whatsapp_avisos_ordemid/);
    expect(source).toMatch(/idx_whatsapp_avisos_status/);
  });

  it('includes automatic queue fields for whatsapp avisos', () => {
    const source = fs.readFileSync(new URL('../database.js', import.meta.url), 'utf8');

    expect(source).toMatch(/canal\s+TEXT/);
    expect(source).toMatch(/auto_status\s+TEXT/);
    expect(source).toMatch(/tentativas\s+INTEGER/);
    expect(source).toMatch(/next_attempt_at\s+TEXT/);
    expect(source).toMatch(/last_error\s+TEXT/);
    expect(source).toMatch(/provider_message_id\s+TEXT/);
    expect(source).toMatch(/idx_whatsapp_avisos_auto_status/);
  });
});
