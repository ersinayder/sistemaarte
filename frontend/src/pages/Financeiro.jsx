import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../services/api';

const TABS = [
  { id: 'resumo', label: 'Resumo mensal' },
  { id: 'pagar', label: 'Contas a pagar' },
  { id: 'receber', label: 'Contas a receber' },
  { id: 'dre', label: 'DRE gerencial' },
];

const CATEGORIAS = ['Fornecedor', 'Aluguel', 'Energia', 'Internet', 'Impostos', 'Salarios', 'Marketing', 'Manutencao', 'Materiais', 'Taxas', 'Outros'];
const PAGAMENTOS = ['Pix', 'Dinheiro', 'Cartao de Debito', 'Cartao de Credito', 'Transferencia', 'Boleto', 'Outros'];

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => new Date().toISOString().slice(0, 10);
const mesAtual = () => today().slice(0, 7);
const fmtD = (d) => d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '-';

function StatCard({ label, value, color = 'var(--color-primary)' }) {
  return (
    <div className="card card-pad" style={{ minWidth: 0 }}>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 4 }}>{label}</div>
      <div className="tabnum" style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const color = status === 'Pago' ? 'var(--color-success)' : status === 'Cancelado' ? 'var(--color-text-faint)' : 'var(--color-gold)';
  return (
    <span style={{ fontSize: 10, fontWeight: 800, color, border: `1px solid ${color}55`, borderRadius: 'var(--radius-full)', padding: '2px 7px', whiteSpace: 'nowrap' }}>
      {status || 'Pendente'}
    </span>
  );
}

function IntegridadeFinanceiraPanel({ integridade, onAudit }) {
  const itens = integridade?.itens || [];
  const criticos = Number(integridade?.criticos || 0);
  const badgeColor = criticos > 0 ? 'var(--color-error)' : 'var(--color-success)';

  return (
    <section className="card card-pad" style={{ marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--text-base)' }}>Integridade das OS</h2>
          <p className="text-muted" style={{ margin: '4px 0 0' }}>{Number(integridade?.total || 0)} apontamento(s) financeiro(s)</p>
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, color: badgeColor, border: `1px solid ${badgeColor}55`, borderRadius: 'var(--radius-full)', padding: '2px 7px', whiteSpace: 'nowrap' }}>
          {criticos > 0 ? `${criticos} critico(s)` : 'Sem criticos'}
        </span>
      </div>
      {itens.length > 0 ? (
        <div className="table-wrap" style={{ marginTop: 'var(--space-3)' }}>
          <table>
            <thead><tr><th>OS</th><th>Cliente</th><th>Tipo</th><th>Saldo oficial</th><th></th></tr></thead>
            <tbody>
              {itens.slice(0, 5).map((item) => (
                <tr key={`${item.tipo}-${item.ordemId}`}>
                  <td>{item.numero || item.ordemId}</td>
                  <td>{item.clienteNome || '-'}</td>
                  <td>{item.mensagem}</td>
                  <td className="tabnum" style={{ fontWeight: 800 }}>{fmt(item.saldoOficial)}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => onAudit(item)}>Auditar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state" style={{ marginTop: 'var(--space-3)' }}>Nenhum apontamento financeiro nas OS.</div>
      )}
    </section>
  );
}

function ModalAuditoriaFinanceiraOS({ apontamento, onClose }) {
  const [detalhe, setDetalhe] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!apontamento?.ordemId) return;
    let alive = true;
    setLoading(true);
    api.get(`/financeiro/integridade-os/${apontamento.ordemId}`, { skipGlobalErrorToast: true })
      .then((r) => { if (alive) setDetalhe(r.data || null); })
      .catch((e) => toast.error(e?.response?.data?.error || 'Erro ao carregar auditoria financeira da OS'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [apontamento?.ordemId]);

  const resumo = detalhe?.resumo || {};
  const lancamentos = detalhe?.lancamentos || [];
  const apontamentos = detalhe?.apontamentos || [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 800 }}>Auditoria financeira da OS</h2>
            <p className="text-muted" style={{ margin: '4px 0 0' }}>{detalhe?.ordem?.numero || apontamento?.numero || apontamento?.ordemId}</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Fechar</button>
        </div>
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 'var(--space-3)' }}>
              <StatCard label="Total da OS" value={fmt(resumo.valorTotal)} />
              <StatCard label="Recebido oficial" value={fmt(resumo.recebidoOficial)} color="var(--color-success)" />
              <StatCard label="Saldo oficial" value={fmt(resumo.saldoOficial)} color="var(--color-gold)" />
              <StatCard label="Excedente" value={fmt(resumo.excedente)} color={Number(resumo.excedente || 0) > 0 ? 'var(--color-error)' : 'var(--color-text-muted)'} />
            </div>
            <div className="card card-pad">
              <h3 style={{ margin: 0, fontSize: 'var(--text-sm)' }}>Apontamentos</h3>
              <div className="settings-list" style={{ marginTop: 'var(--space-3)' }}>
                {apontamentos.length === 0 ? <div className="empty-state">Nenhum apontamento recalculado para esta OS.</div> : apontamentos.map((item) => (
                  <div className="settings-list-item" key={item.tipo}>
                    <strong>{item.mensagem}</strong>
                    <span>{item.severidade}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
                <strong>Lancamentos da OS</strong>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Data</th><th>Descricao</th><th>Pagamento</th><th>Valor</th><th>Status</th></tr></thead>
                  <tbody>
                    {lancamentos.length === 0 ? (
                      <tr><td colSpan={5}><div className="empty-state">Nenhum lancamento vinculado a esta OS.</div></td></tr>
                    ) : lancamentos.map((item) => (
                      <tr key={item.id}>
                        <td>{fmtD(item.data)}</td>
                        <td>{item.descricao || item.categoria || '-'}</td>
                        <td>{item.pagamento || '-'}</td>
                        <td className="tabnum" style={{ fontWeight: 800 }}>{fmt(item.valor)}</td>
                        <td>{item.consideradoNoSaldo ? 'Considerado' : 'Ignorado'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ContaForm({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(() => ({
    fornecedor: initial?.fornecedor || '',
    descricao: initial?.descricao || '',
    categoria: initial?.categoria || 'Fornecedor',
    valor: initial?.valor || '',
    vencimento: initial?.vencimento || today(),
    pagamento: initial?.pagamento || 'Pix',
    observacoes: initial?.observacoes || '',
  }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = (e) => {
    e.preventDefault();
    onSave({ ...form, valor: Number(form.valor || 0) });
  };

  return (
    <form onSubmit={submit} className="card card-pad" style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <div>
          <label className="form-label">Fornecedor</label>
          <input className="form-input" value={form.fornecedor} onChange={(e) => set('fornecedor', e.target.value)} required />
        </div>
        <div>
          <label className="form-label">Categoria</label>
          <select className="form-input" value={form.categoria} onChange={(e) => set('categoria', e.target.value)}>
            {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="form-label">Descricao</label>
        <input className="form-input" value={form.descricao} onChange={(e) => set('descricao', e.target.value)} required />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
        <div>
          <label className="form-label">Vencimento</label>
          <input className="form-input" type="date" value={form.vencimento} onChange={(e) => set('vencimento', e.target.value)} required />
        </div>
        <div>
          <label className="form-label">Valor</label>
          <input className="form-input" type="number" step="0.01" min="0.01" value={form.valor} onChange={(e) => set('valor', e.target.value)} required />
        </div>
        <div>
          <label className="form-label">Pagamento previsto</label>
          <select className="form-input" value={form.pagamento} onChange={(e) => set('pagamento', e.target.value)}>
            {PAGAMENTOS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="form-label">Observacoes</label>
        <textarea className="form-input" rows={2} value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn-primary">Salvar conta</button>
      </div>
    </form>
  );
}

export default function Financeiro() {
  const [tab, setTab] = useState('resumo');
  const [mes, setMes] = useState(mesAtual());
  const [loading, setLoading] = useState(false);
  const [resumo, setResumo] = useState(null);
  const [contas, setContas] = useState([]);
  const [receber, setReceber] = useState([]);
  const [dre, setDre] = useState(null);
  const [integridade, setIntegridade] = useState(null);
  const [auditoriaOS, setAuditoriaOS] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { document.title = 'Financeiro - Arte & Molduras'; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resumoRes, contasRes, receberRes, dreRes, integridadeRes] = await Promise.all([
        api.get(`/financeiro/resumo?mes=${mes}`),
        api.get(`/financeiro/contas-pagar?mes=${mes}`),
        api.get('/financeiro/contas-receber'),
        api.get(`/financeiro/dre?mes=${mes}`),
        api.get('/financeiro/integridade-os', { skipGlobalErrorToast: true }).catch(() => ({ data: null })),
      ]);
      setResumo(resumoRes.data || null);
      setContas(contasRes.data || []);
      setReceber(receberRes.data || []);
      setDre(dreRes.data || null);
      setIntegridade(integridadeRes.data || null);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Erro ao carregar financeiro');
    } finally {
      setLoading(false);
    }
  }, [mes]);

  useEffect(() => { load(); }, [load]);

  const totaisPagar = useMemo(() => {
    const pendentes = contas.filter((c) => c.status === 'Pendente');
    const pagas = contas.filter((c) => c.status === 'Pago');
    const vencidas = pendentes.filter((c) => c.vencimento < today());
    return {
      pendentes: pendentes.reduce((s, c) => s + Number(c.valor || 0), 0),
      pagas: pagas.reduce((s, c) => s + Number(c.valor || 0), 0),
      vencidas: vencidas.reduce((s, c) => s + Number(c.valor || 0), 0),
    };
  }, [contas]);

  const totalReceber = receber.reduce((s, c) => s + Number(c.saldo || 0), 0);

  const saveConta = async (payload) => {
    try {
      if (editing) await api.put(`/financeiro/contas-pagar/${editing.id}`, payload);
      else await api.post('/financeiro/contas-pagar', payload);
      toast.success(editing ? 'Conta atualizada' : 'Conta cadastrada');
      setShowForm(false);
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Erro ao salvar conta');
    }
  };

  const pagarConta = async (conta) => {
    if (!window.confirm(`Marcar "${conta.descricao}" como paga e lançar saída no caixa?`)) return;
    try {
      await api.patch(`/financeiro/contas-pagar/${conta.id}/pagar`, { pagoem: today(), pagamento: conta.pagamento || 'Pix' });
      toast.success('Conta paga e saída lançada no caixa');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Erro ao pagar conta');
    }
  };

  const cancelarConta = async (conta) => {
    if (!window.confirm(`Cancelar "${conta.descricao}"?`)) return;
    try {
      await api.patch(`/financeiro/contas-pagar/${conta.id}/cancelar`);
      toast.success('Conta cancelada');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Erro ao cancelar conta');
    }
  };

  const abrirImpressao = () => {
    const urls = {
      resumo: `/api/financeiro/resumo/pdf?mes=${encodeURIComponent(mes)}`,
      pagar: `/api/financeiro/contas-pagar/pdf?mes=${encodeURIComponent(mes)}`,
      receber: '/api/financeiro/contas-receber/pdf',
      dre: `/api/financeiro/dre/pdf?mes=${encodeURIComponent(mes)}`,
    };
    window.open(urls[tab] || urls.resumo, '_blank', 'noopener,noreferrer');
  };

  const renderResumo = () => (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 'var(--space-3)' }}>
        <StatCard label="Receita realizada" value={fmt(resumo?.receitaRealizada)} color="var(--color-success)" />
        <StatCard label="Despesas pagas" value={fmt(resumo?.despesasPagas)} color="var(--color-error)" />
        <StatCard label="A pagar no mes" value={fmt(resumo?.contasPendentes)} color="var(--color-gold)" />
        <StatCard label="Contas vencidas" value={fmt(resumo?.contasVencidas)} color="var(--color-error)" />
        <StatCard label="Saldo realizado" value={fmt(resumo?.saldoRealizado)} />
        <StatCard label="Saldo previsto" value={fmt(resumo?.saldoPrevisto)} color={Number(resumo?.saldoPrevisto || 0) >= 0 ? 'var(--color-primary)' : 'var(--color-error)'} />
      </div>
      <div className="card card-pad">
        <h2 style={{ margin: 0, fontSize: 'var(--text-base)' }}>Despesas pagas por categoria</h2>
        <List rows={resumo?.despesasPorCategoria || []} empty="Nenhuma despesa paga neste mes." />
      </div>
    </div>
  );

  const renderPagar = () => (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 'var(--space-3)' }}>
        <StatCard label="Pendentes" value={fmt(totaisPagar.pendentes)} color="var(--color-gold)" />
        <StatCard label="Pagas no mes" value={fmt(totaisPagar.pagas)} color="var(--color-success)" />
        <StatCard label="Vencidas" value={fmt(totaisPagar.vencidas)} color="var(--color-error)" />
      </div>
      {showForm && <ContaForm initial={editing} onCancel={() => { setShowForm(false); setEditing(null); }} onSave={saveConta} />}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
          <strong>Contas do mes</strong>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>Nova conta</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Vencimento</th><th>Fornecedor</th><th>Descricao</th><th>Categoria</th><th>Status</th><th>Valor</th><th></th></tr></thead>
            <tbody>
              {contas.length === 0 ? (
                <tr><td colSpan={7}><div className="empty-state">Nenhuma conta cadastrada neste mes.</div></td></tr>
              ) : contas.map((conta) => (
                <tr key={conta.id}>
                  <td>{fmtD(conta.vencimento)}</td>
                  <td>{conta.fornecedor}</td>
                  <td>{conta.descricao}</td>
                  <td>{conta.categoria}</td>
                  <td><StatusBadge status={conta.status} /></td>
                  <td className="tabnum" style={{ fontWeight: 800 }}>{fmt(conta.valor)}</td>
                  <td><Actions conta={conta} onPay={pagarConta} onEdit={(c) => { setEditing(c); setShowForm(true); }} onCancel={cancelarConta} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderReceber = () => (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <StatCard label="Saldo a receber em OS abertas" value={fmt(totalReceber)} color="var(--color-gold)" />
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Prazo</th><th>OS</th><th>Cliente</th><th>Status</th><th>Total</th><th>Recebido</th><th>Saldo</th></tr></thead>
            <tbody>
              {receber.length === 0 ? (
                <tr><td colSpan={7}><div className="empty-state">Nenhuma OS com saldo aberto.</div></td></tr>
              ) : receber.map((item) => (
                <tr key={item.id}>
                  <td>{fmtD(item.prazoentrega)}</td><td>{item.numero}</td><td>{item.clientenome}</td><td>{item.status}</td>
                  <td>{fmt(item.valortotal)}</td><td>{fmt(item.recebido)}</td>
                  <td className="tabnum" style={{ fontWeight: 800, color: 'var(--color-gold)' }}>{fmt(item.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderDre = () => (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 'var(--space-3)' }}>
        <StatCard label="Receita bruta" value={fmt(dre?.receitaBruta)} color="var(--color-success)" />
        <StatCard label="Devolucoes / estornos" value={fmt(dre?.devolucoes)} color="var(--color-gold)" />
        <StatCard label="Receita liquida" value={fmt(dre?.receitaLiquida)} />
        <StatCard label="Despesas" value={fmt(dre?.totalDespesas)} color="var(--color-error)" />
        <StatCard label="Resultado" value={fmt(dre?.resultado)} color={Number(dre?.resultado || 0) >= 0 ? 'var(--color-success)' : 'var(--color-error)'} />
      </div>
      <div className="card card-pad">
        <h2 style={{ margin: 0, fontSize: 'var(--text-base)' }}>Despesas operacionais</h2>
        <List rows={dre?.despesas || []} empty="Nenhuma despesa operacional no periodo." />
      </div>
    </div>
  );

  return (
    <div className="page-content-wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Financeiro</h1>
          <p className="text-muted">Administracao financeira mensal da empresa.</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <input className="form-input" type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={{ width: 160 }} />
          <button className="btn btn-secondary" onClick={abrirImpressao}>Imprimir</button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}>Atualizar</button>
        </div>
      </div>
      <IntegridadeFinanceiraPanel integridade={integridade} onAudit={setAuditoriaOS} />
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        {TABS.map((item) => <button key={item.id} className={tab === item.id ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>
      {loading ? <div className="loading-center"><div className="spinner" /></div>
        : tab === 'resumo' ? renderResumo()
        : tab === 'pagar' ? renderPagar()
        : tab === 'receber' ? renderReceber()
        : renderDre()}
      {auditoriaOS && <ModalAuditoriaFinanceiraOS apontamento={auditoriaOS} onClose={() => setAuditoriaOS(null)} />}
    </div>
  );
}

function Actions({ conta, onPay, onEdit, onCancel }) {
  if (conta.status !== 'Pendente') return <span style={{ color: 'var(--color-text-faint)' }}>-</span>;
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <button className="btn btn-primary btn-sm" onClick={() => onPay(conta)}>Pagar</button>
      <button className="btn btn-secondary btn-sm" onClick={() => onEdit(conta)}>Editar</button>
      <button className="btn btn-ghost btn-sm" onClick={() => onCancel(conta)}>Cancelar</button>
    </div>
  );
}

function List({ rows, empty }) {
  return (
    <div className="settings-list" style={{ marginTop: 'var(--space-3)' }}>
      {rows.length === 0 ? <div className="empty-state">{empty}</div> : rows.map((item) => (
        <div className="settings-list-item" key={item.categoria}>
          <strong>{item.categoria}</strong>
          <span className="tabnum">{fmt(item.valor)}</span>
        </div>
      ))}
    </div>
  );
}
