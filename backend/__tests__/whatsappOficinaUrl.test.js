import { describe, expect, it, vi } from 'vitest';

const helper = await import('../../frontend/src/utils/whatsappOficina.js');

describe('whatsappOficina frontend helper', () => {
  it('builds a fixed WhatsApp Web URL and never uses api.whatsapp.com or wa.me', () => {
    const url = helper.buildWhatsappWebUrl({
      phone: '5531999990000',
      text: 'Ola Maria\nOS-0001',
    });

    expect(url).toMatch(/^https:\/\/web\.whatsapp\.com\/send\?/);
    expect(url).toContain('phone=5531999990000');
    expect(url).toContain('text=Ola%20Maria%0AOS-0001');
    expect(url).not.toContain('api.whatsapp.com');
    expect(url).not.toContain('wa.me');
  });

  it('builds a WhatsApp app URL for Oficina messages', () => {
    const url = helper.buildWhatsappAppUrl({
      phone: '(31) 99999-0000',
      text: 'Mensagem pronta',
    });

    expect(url).toBe('whatsapp://send?phone=31999990000&text=Mensagem%20pronta');
  });

  it('launches the WhatsApp app protocol instead of opening a Web tab', () => {
    const launcher = vi.fn(() => true);

    const ok = helper.openWhatsappConversation({
      phone: '5531999990000',
      text: 'Mensagem',
    }, launcher);

    expect(ok).toBe(true);
    expect(launcher).toHaveBeenCalledWith('whatsapp://send?phone=5531999990000&text=Mensagem');
  });

  it('returns false when phone is missing or the app launcher fails', () => {
    expect(helper.openWhatsappConversation({ phone: '', text: 'Mensagem' }, vi.fn())).toBe(false);
    expect(helper.openWhatsappConversation({ phone: '5531999990000', text: 'Mensagem' }, vi.fn(() => null))).toBe(false);
  });
});
