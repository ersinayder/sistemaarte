const PAGAMENTOS_CANONICOS = [
  'Pix',
  'Dinheiro',
  'Credito',
  'Debito',
  'Transferencia',
  'Link',
  'Boleto',
  'Outros',
];

const LABELS = {
  Pix: 'Pix',
  Dinheiro: 'Dinheiro',
  Credito: 'Cartao de Credito',
  Debito: 'Cartao de Debito',
  Transferencia: 'Transferencia',
  Link: 'Link de Pagamento',
  Boleto: 'Boleto',
  Outros: 'Outros',
};

function chave(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizarPagamento(value) {
  const s = chave(value);
  if (!s) return 'Outros';
  if (s === 'pix') return 'Pix';
  if (s === 'dinheiro' || s === 'especie') return 'Dinheiro';
  if (['credito', 'cartaocredito', 'cartaodecredito', 'cardcredito'].includes(s)) return 'Credito';
  if (['debito', 'cartaodebito', 'cartaodedebito', 'carddebito'].includes(s)) return 'Debito';
  if (['transferencia', 'ted', 'doc'].includes(s)) return 'Transferencia';
  if (s === 'boleto') return 'Boleto';
  if (
    s === 'link' ||
    s.startsWith('linkpagamento') ||
    s.startsWith('linkdepagamento') ||
    s.startsWith('linkcredito') ||
    s.startsWith('linkdecobranca') ||
    s.startsWith('linkcobranca') ||
    s.startsWith('linkcobran')
  ) return 'Link';
  if (s === 'outros' || s === 'outro') return 'Outros';
  return 'Outros';
}

function labelPagamento(value) {
  const normalizado = normalizarPagamento(value);
  return LABELS[normalizado] || LABELS.Outros;
}

function agruparPorPagamento(rows = []) {
  const grupos = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const pagamento = normalizarPagamento(row?.pagamento);
    if (!grupos.has(pagamento)) {
      grupos.set(pagamento, {
        pagamento,
        label: labelPagamento(pagamento),
        total: 0,
        itens: [],
      });
    }
    const grupo = grupos.get(pagamento);
    const valor = Number(row?.valor || 0);
    grupo.total = Math.round((grupo.total + valor) * 100) / 100;
    grupo.itens.push(row);
  }
  return Array.from(grupos.values());
}

module.exports = {
  PAGAMENTOS_CANONICOS,
  agruparPorPagamento,
  labelPagamento,
  normalizarPagamento,
};
