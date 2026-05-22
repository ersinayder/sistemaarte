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

  it('navigates the Oficina tab to WhatsApp Web instead of opening another tab', () => {
    const launcher = vi.fn(() => true);

    const ok = helper.openWhatsappConversation({
      phone: '5531999990000',
      text: 'Mensagem',
    }, launcher);

    expect(ok).toBe(true);
    expect(launcher).toHaveBeenCalledWith(
      'https://web.whatsapp.com/send?phone=5531999990000&text=Mensagem'
    );
  });

  it('returns false when phone is missing or the WhatsApp Web navigation fails', () => {
    expect(helper.openWhatsappConversation({ phone: '', text: 'Mensagem' }, vi.fn())).toBe(false);
    expect(helper.openWhatsappConversation({ phone: '5531999990000', text: 'Mensagem' }, vi.fn(() => null))).toBe(false);
  });
});
