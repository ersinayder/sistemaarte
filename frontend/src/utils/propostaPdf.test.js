import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'react-hot-toast';
import { baixarPropostaPdf } from './propostaPdf';

vi.mock('react-hot-toast', () => {
  const fn = vi.fn();
  fn.error = vi.fn();
  fn.success = vi.fn();
  return { toast: fn };
});

describe('baixarPropostaPdf', () => {
  let api;
  let openSpy;

  beforeEach(() => {
    api = {
      get: vi.fn(),
      post: vi.fn(),
    };
    toast.mockReset();
    toast.error.mockReset();
    toast.success.mockReset();
    global.URL.createObjectURL = vi.fn(() => 'blob:proposta-test');
    global.URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  it('baixa o PDF da proposta diretamente sem acionar impressao na rede', async () => {
    const pdfBlob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    api.get.mockResolvedValueOnce({ data: pdfBlob });

    const ok = await baixarPropostaPdf(api, { id: 12, numero: 'PROP-0012' });

    expect(ok).toBe(true);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.get).toHaveBeenCalledWith('/propostas/12/pdf?formato=pdf', {
      responseType: 'blob',
      timeout: 45000,
      skipGlobalErrorToast: true,
    });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('abre o HTML da proposta em nova aba se o motor de PDF nao estiver disponivel', async () => {
    const errBlob = new Blob(
      [JSON.stringify({ error: 'Chrome/Edge nao encontrado para gerar DANFE PDF.' })],
      { type: 'application/json' },
    );
    api.get.mockRejectedValueOnce({
      response: { status: 500, data: errBlob },
    });

    const ok = await baixarPropostaPdf(api, { id: 12, numero: 'PROP-0012' });

    expect(ok).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith('/api/propostas/12/pdf', '_blank', 'noopener,noreferrer');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('exibe toast de erro quando o servidor retorna 404', async () => {
    const errBlob = new Blob(
      [JSON.stringify({ error: 'Proposta nao encontrada' })],
      { type: 'application/json' },
    );
    api.get.mockRejectedValueOnce({
      response: { status: 404, data: errBlob },
    });

    const ok = await baixarPropostaPdf(api, { id: 99, numero: 'PROP-0099' });

    expect(ok).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Proposta nao encontrada');
  });
});
