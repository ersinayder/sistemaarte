const fmt = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ');

function fmtDate(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split('-');
  if (!year || !month || !day) return null;
  return `${day}/${month}/${year}`;
}

export function formatarTelefoneWhatsapp(tel) {
  if (!tel) return null;
  const digits = String(tel).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return `55${digits}`;
}

export function buildPropostaWhatsappUrl(proposta = {}) {
  const phone = formatarTelefoneWhatsapp(proposta.clientetelefone || proposta.clientecontato || proposta.telefone);
  if (!phone) return null;

  const numero = proposta.numero || `#${proposta.id || ''}`.trim();
  const cliente = proposta.clientenome || 'cliente';
  const total = fmt(proposta.valortotal);
  const prazo = fmtDate(proposta.prazoentrega);
  const descricao = proposta.descricao ? String(proposta.descricao).trim() : '';
  const itens = Array.isArray(proposta.itens) ? proposta.itens : [];

  const lines = [
    `Ola, ${cliente}!`,
    '',
    `Segue a Proposta ${numero} da Arte e Molduras.`,
  ];

  if (descricao) lines.push(`Resumo: ${descricao}`);

  if (itens.length) {
    lines.push('', 'Itens principais:');
    itens.slice(0, 5).forEach(item => {
      const qtd = Number(item.quantidade || 1).toLocaleString('pt-BR');
      lines.push(`- ${qtd}x ${item.nome}`);
    });
    if (itens.length > 5) lines.push(`- mais ${itens.length - 5} item(ns) no PDF`);
  }

  lines.push(`Total: ${total}`);

  if (prazo) lines.push(`Prazo previsto: ${prazo}`);

  lines.push('', 'Vou enviar o PDF da proposta em anexo por aqui.');

  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
}
