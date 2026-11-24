import { toast } from 'react-hot-toast';

/**
 * Extrai mensagem de erro legível quando a requisição de download usa responseType: 'blob'.
 */
async function mensagemErroBlob(error, fallback) {
  const data = error?.response?.data;
  if (data?.error) return data.error;
  if (data?.erro) return data.erro;
  if (typeof Blob !== 'undefined' && data instanceof Blob && data.type?.includes('application/json')) {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.error) return parsed.error;
      if (parsed?.erro) return parsed.erro;
    } catch (_) {}
  }
  return fallback;
}

/**
 * Baixa o PDF da proposta diretamente sem enviar para fila de impressão em rede.
 * Caso o motor headless de PDF não esteja disponível no servidor, abre o HTML imprimível em nova aba.
 */
export async function baixarPropostaPdf(api, proposta) {
  if (!proposta?.id) return false;
  const identificador = String(proposta.numero || proposta.id).replace(/[^a-zA-Z0-9._-]/g, '_');
  const nomeArquivo = `proposta-${identificador}.pdf`;

  try {
    const response = await api.get(`/propostas/${proposta.id}/pdf?formato=pdf`, {
      responseType: 'blob',
      timeout: 45000,
      skipGlobalErrorToast: true,
    });
    const href = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = href;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
    return true;
  } catch (error) {
    const msg = await mensagemErroBlob(error, 'Erro ao baixar PDF da proposta');
    if (msg.includes('Chrome') || msg.includes('DANFE_PDF_CHROME_PATH') || error?.response?.status === 500) {
      toast('Motor de PDF indisponivel no servidor. Abrindo proposta para salvar em PDF...', { icon: '📄' });
      window.open(`/api/propostas/${proposta.id}/pdf`, '_blank', 'noopener,noreferrer');
      return false;
    }
    toast.error(msg);
    return false;
  }
}
