import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import toast from 'react-hot-toast'
import { Download, FileWarning, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { buscarEnderecoPorCep, maskCep } from '../utils/cep'
import { hojeBrt } from '../utils/dates'
import { useAuth } from '../context/AuthContext'
import InutilizacaoModal from '../components/nfe/InutilizacaoModal'

const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)

const fmtDate = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d) ? s : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const BADGE = {
  autorizado: { bg: 'var(--color-success)', text: '#fff', label: 'Autorizado' },
  rejeitado:  { bg: 'var(--color-error)',   text: '#fff', label: 'Rejeitado'  },
  rejeitada:  { bg: 'var(--color-error)',   text: '#fff', label: 'Rejeitado'  },
  emitindo:   { bg: 'var(--color-gold)',    text: '#fff', label: 'Emitindo…'  },
  cancelado:  { bg: 'var(--color-text-muted)', text: '#fff', label: 'Cancelado' },
  cancelada:  { bg: 'var(--color-text-muted)', text: '#fff', label: 'Cancelado' },
}

const EVENTO_LABEL = {
  autorizacao: 'Autorizacao',
  rejeicao: 'Rejeicao',
  cce: 'Carta de Correcao',
  cancelamento: 'Cancelamento',
  emissao: 'Emissao',
}

const PENDENCIA_STATUS_LABEL = {
  processando: 'Processando',
  incerto: 'Incerto',
}

const statusColor = s => ({
  'Aguardando': 'aguardando',
  'Em Produção': 'emproducao',
  'Pronto': 'pronto',
  'Entregue': 'entregue',
  'Cancelado': 'cancelado',
}[s] || 'secondary')

const tipoBadge = t => ({
  'Quadro': 'primary',
  'Corte a Laser': 'blue',
  'Sublimacao': 'warning',
  'Diversos': 'secondary',
}[t] || 'secondary')

const HOMOLOGACAO_ALVO = 10
const STATUS_NFE_EMISSAO = ['Aguardando', 'Em Produção', 'Pronto', 'Entregue']
const STATUS_NFE_EMISSAO_LABEL = 'Aguardando, Em Produção, Pronto ou Entregue'
const MAX_INFORMACOES_COMPLEMENTARES_NFE = 5000
const NCM_SUGESTOES_NFE = [
  { label: 'MDF', value: '44151000' },
  { label: 'Acrilico', value: '39269090' },
  { label: 'Molduras', value: '44151000' },
]
const CSOSN_VALIDOS_NFE = new Set(['101', '102', '103', '300', '400', '500', '900'])

function normalizarNcm(value) {
  return String(value || '44151000').replace(/\D/g, '').padStart(8, '0').slice(-8)
}

function normalizarCfop(value) {
  return String(value || '5102').replace(/\D/g, '').slice(0, 4) || '5102'
}

function normalizarCsosn(value) {
  return String(value || '400').replace(/\D/g, '').padStart(3, '0').slice(-3)
}

function normalizarOrigemFiscal(value) {
  return String(value ?? '0').replace(/\D/g, '').slice(0, 1) || '0'
}

function normalizarUnidade(value) {
  return String(value || 'UN').trim().toUpperCase().slice(0, 6) || 'UN'
}

function produtoParaItemNfe(produto) {
  return {
    id: `produto-${produto.id}-${Date.now()}`,
    produto_id: produto.id,
    nome: produto.nome || produto.name || 'Produto',
    quantidade: 1,
    preco_unitario: Number(produto.preco || produto.valor || produto.preco_unitario || 0),
    avulso: false,
    ncm: normalizarNcm(produto.ncm),
    cfop: normalizarCfop(produto.cfop),
    csosn: normalizarCsosn(produto.csosn),
    origem_fiscal: normalizarOrigemFiscal(produto.origem_fiscal),
    unidade: normalizarUnidade(produto.unidade),
  }
}

function itemAvulsoParaNfe(data = {}) {
  return {
    id: `avulso-${Date.now()}`,
    produto_id: null,
    nome: String(data.nome || '').trim() || 'Item avulso',
    quantidade: Math.max(1, Number(data.quantidade || 1)),
    preco_unitario: Math.max(0, Number(data.preco_unitario || 0)),
    avulso: true,
    ncm: normalizarNcm(data.ncm),
    cfop: normalizarCfop(data.cfop),
    csosn: normalizarCsosn(data.csosn),
    origem_fiscal: normalizarOrigemFiscal(data.origem_fiscal),
    unidade: normalizarUnidade(data.unidade),
  }
}

async function mensagemErroBlob(e, fallback) {
  const data = e?.response?.data
  if (data?.erro) return data.erro
  if (data instanceof Blob && data.type?.includes('application/json')) {
    try {
      const parsed = JSON.parse(await data.text())
      if (parsed?.erro) return parsed.erro
      if (parsed?.error) return parsed.error
    } catch (_) {}
  }
  return fallback
}

async function baixarArquivo(url, nomeArquivo, config = {}) {
  const r = await api.get(url, { responseType: 'blob', timeout: 45000, ...config })
  const href = URL.createObjectURL(r.data)
  const a = document.createElement('a')
  a.href = href
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}

async function baixarDanfe(chave) {
  if (!chave) {
    toast.error('Chave da NF-e indisponivel')
    return
  }
  try {
    await baixarArquivo(`/nfe/${chave}/danfe`, `danfe-${chave}.pdf`)
  } catch (e) {
    const msg = await mensagemErroBlob(e, 'DANFE indisponivel')
    if (msg.includes('Chrome') || msg.includes('DANFE_PDF_CHROME_PATH') || e?.response?.status === 500) {
      toast('Motor de PDF indisponivel no servidor. Abrindo DANFE para impressao...', { icon: '🖨️' })
      window.open(`/api/nfe/${chave}/danfe?formato=html`, '_blank', 'noopener,noreferrer')
      return
    }
    toast.error(msg)
  }
}

function mensagemErroNfe(e, fallback = 'Erro ao emitir NF-e') {
  const data = e?.response?.data
  if (data?.erro) return data.erro
  if (e?.response?.status === 504) {
    return 'SEFAZ demorou demais para responder. Aguarde alguns instantes, atualize a tela e tente reemitir.'
  }
  if (typeof data === 'string' && data.toLowerCase().includes('gateway timeout')) {
    return 'SEFAZ demorou demais para responder. Aguarde alguns instantes, atualize a tela e tente reemitir.'
  }
  return fallback
}

function StatusBadge({ status }) {
  const cfg = BADGE[status] || { bg: 'var(--color-surface-offset)', text: 'var(--color-text-muted)', label: status || '—' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 'var(--radius-full)',
      fontSize: 'var(--text-xs)', fontWeight: 700,
      background: cfg.bg, color: cfg.text,
    }}>{cfg.label}</span>
  )
}

function PendenciasFiscaisPanel({ pendencias, onRefresh, onAudit }) {
  const primeiras = pendencias.slice(0, 4)
  const restantes = Math.max(0, pendencias.length - primeiras.length)

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-gold)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-3) var(--space-4)',
      display: 'grid',
      gap: 'var(--space-3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
          <FileWarning size={18} style={{ color: 'var(--color-gold)', flex: '0 0 auto' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800 }}>Pendencias fiscais em acompanhamento</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {pendencias.length} tentativa{pendencias.length !== 1 ? 's' : ''} aguardando conclusao ou conciliacao
            </div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh} title="Atualizar pendencias fiscais">
          Atualizar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-2)' }}>
        {primeiras.map((p) => (
          <div key={`${p.origem}-${p.id}`} style={{
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--color-surface-offset)',
            minWidth: 0,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--color-text)' }}>
                {EVENTO_LABEL[p.tipo] || p.tipo}
                {p.tipo === 'cce' && p.nseqevento ? ` #${p.nseqevento}` : ''}
              </span>
              <span style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 800,
                color: p.status === 'incerto' ? 'var(--color-error)' : 'var(--color-gold)',
                whiteSpace: 'nowrap',
              }}>
                {PENDENCIA_STATUS_LABEL[p.status] || p.status}
              </span>
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.numero_os || 'OS nao vinculada'} {p.cliente ? `- ${p.cliente}` : ''}
            </div>
            <div title={p.motivo || p.chave || ''} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.motivo || p.chave || 'Sem motivo informado'}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)', marginTop: 4 }}>
              Atualizado em {fmtDate(p.updatedat)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => onAudit(p)} title="Auditar transicoes da pendencia fiscal">
                Auditar
              </button>
            </div>
          </div>
        ))}
      </div>

      {restantes > 0 && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 700 }}>
          Mais {restantes} pendencia{restantes !== 1 ? 's' : ''} fiscal{restantes !== 1 ? 'is' : ''} fora da visualizacao compacta.
        </div>
      )}
    </div>
  )
}

function IntegridadeFiscalFinanceiraPanel({ itens, onRefresh, onAudit }) {
  const primeiros = itens.slice(0, 4)
  const restantes = Math.max(0, itens.length - primeiros.length)
  const criticos = itens.filter(item => item.severidade === 'critico').length

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-error)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-3) var(--space-4)',
      display: 'grid',
      gap: 'var(--space-3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
          <FileWarning size={18} style={{ color: 'var(--color-error)', flex: '0 0 auto' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800 }}>Integridade fiscal-financeira</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {itens.length} apontamento{itens.length !== 1 ? 's' : ''} local{itens.length !== 1 ? 'is' : ''} - {criticos} critico{criticos !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh} title="Atualizar integridade fiscal-financeira">
          Atualizar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-2)' }}>
        {primeiros.map((item) => (
          <div key={`${item.tipo}-${item.ordemId}`} style={{
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--color-surface-offset)',
            minWidth: 0,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--color-text)' }}>
                {item.numero || `OS ${item.ordemId}`}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: item.severidade === 'critico' ? 'var(--color-error)' : 'var(--color-gold)' }}>
                {item.nfeStatus || item.severidade}
              </span>
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.clienteNome || 'Cliente nao informado'}
            </div>
            <div title={item.mensagem} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.mensagem}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {item.valorOS !== undefined && <span>OS {fmt(item.valorOS)}</span>}
              {item.valorNFe !== undefined && <span>NF-e {fmt(item.valorNFe)}</span>}
              {item.diferenca !== undefined && <span>Dif. {fmt(item.diferenca)}</span>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => onAudit(item)} title="Auditar integridade fiscal-financeira">
                Auditar
              </button>
            </div>
          </div>
        ))}
      </div>

      {restantes > 0 && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 700 }}>
          Mais {restantes} apontamento{restantes !== 1 ? 's' : ''} fora da visualizacao compacta.
        </div>
      )}
    </div>
  )
}

function ModalAuditoriaIntegridadeFiscalFinanceira({ apontamento, onClose, canConciliar, onConciliado }) {
  const [detalhe, setDetalhe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [motivoConciliacao, setMotivoConciliacao] = useState('NF-e emitida sem impacto no caixa da OS.')
  const [conciliando, setConciliando] = useState(false)

  const carregarAuditoria = useCallback(async () => {
    if (!apontamento?.ordemId) return
    setLoading(true)
    try {
      const r = await api.get(`/nfe/integridade-financeira/${apontamento.ordemId}`, { skipGlobalErrorToast: true })
      setDetalhe(r.data)
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Erro ao carregar auditoria fiscal-financeira')
      setDetalhe(null)
    } finally {
      setLoading(false)
    }
  }, [apontamento?.ordemId])

  useEffect(() => { carregarAuditoria() }, [carregarAuditoria])

  const ordem = detalhe?.ordem || {}
  const fiscal = detalhe?.fiscal || {}
  const apontamentos = detalhe?.apontamentos || []
  const podeConciliar = canConciliar && apontamentos.some(item => item.tipo === 'nfe_total_divergente')

  const handleConciliar = async () => {
    if (!podeConciliar) return
    setConciliando(true)
    try {
      await api.post(`/nfe/integridade-financeira/${ordem.id || apontamento?.ordemId}/conciliar`, { motivo: motivoConciliacao }, { skipGlobalErrorToast: true })
      toast.success('Apontamento conciliado localmente')
      onConciliado?.()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Nao foi possivel conciliar o apontamento')
    } finally {
      setConciliando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 800 }}>Auditoria fiscal-financeira</h2>
            <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {ordem.numero || apontamento?.numero || `OS ${apontamento?.ordemId}`}
            </p>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body modal-body-dense">
          {loading ? (
            <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto var(--space-3)' }} />Carregando auditoria...
            </div>
          ) : (
            <>
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)', background: 'var(--color-surface-offset)', display: 'grid', gap: 'var(--space-2)' }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800 }}>{ordem.clienteNome || 'Cliente nao informado'}</div>
                <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  <span>Status OS: {ordem.status || 'nao informado'}</span>
                  <span>Status NF-e: {fiscal.status || 'nao informado'}</span>
                  <span>XML local: {fiscal.xmlLocal || 'nao informado'}</span>
                </div>
                <div style={{ overflowWrap: 'anywhere', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  Chave: {fiscal.chave || 'nao informada'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-2)' }}>
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)', background: 'var(--color-surface-offset)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 700 }}>Total OS</div>
                  <strong>{fmt(ordem.valorTotal)}</strong>
                </div>
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)', background: 'var(--color-surface-offset)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 700 }}>Total NF-e</div>
                  <strong>{fiscal.valorNFe === undefined ? 'Indisponivel' : fmt(fiscal.valorNFe)}</strong>
                </div>
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)', background: 'var(--color-surface-offset)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 700 }}>Apontamentos</div>
                  <strong>{apontamentos.length}</strong>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                {apontamentos.map((item, index) => (
                  <div key={`${item.tipo}-${index}`} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)' }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: item.severidade === 'critico' ? 'var(--color-error)' : 'var(--color-gold)' }}>
                      {item.tipo}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 'var(--text-sm)' }}>{item.mensagem}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 700 }}>
                {detalhe?.orientacao || 'Conferencia manual necessaria. Esta auditoria nao altera OS, caixa ou NF-e.'}
              </div>

              {podeConciliar && (
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)', background: 'var(--color-surface-offset)', display: 'grid', gap: 'var(--space-2)' }}>
                  <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)' }}>Motivo da conciliacao local</label>
                  <textarea
                    value={motivoConciliacao}
                    onChange={e => setMotivoConciliacao(e.target.value)}
                    rows={2}
                    style={{ width: '100%', resize: 'vertical', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', color: 'var(--color-text)', padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)', minHeight: 48 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary btn-sm" onClick={handleConciliar} disabled={conciliando || motivoConciliacao.trim().length < 10}>
                      {conciliando ? 'Conciliando...' : 'Conciliar localmente'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ModalAuditoriaPendenciaFiscal({ pendencia, onClose, onLiberada }) {
  const [detalhe, setDetalhe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [motivoLiberacao, setMotivoLiberacao] = useState('')
  const [liberando, setLiberando] = useState(false)

  const carregarAuditoria = useCallback(async () => {
    if (!pendencia?.origem || !pendencia?.id) return
    setLoading(true)
    try {
      const r = await api.get(`/nfe/pendencias/${pendencia.origem}/${pendencia.id}/transicoes`, { skipGlobalErrorToast: true })
      setDetalhe(r.data)
      const motivoPadrao = r.data?.pendencia?.motivo?.includes('Isento')
        ? 'Rejeicao SEFAZ conferida pelo operador. Destinatario ajustado para nao contribuinte.'
        : 'Rejeicao SEFAZ conferida pelo operador. Liberado para correcao e reemissao.'
      setMotivoLiberacao(prev => prev || motivoPadrao)
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Erro ao carregar auditoria da pendencia fiscal')
      setDetalhe(null)
    } finally {
      setLoading(false)
    }
  }, [pendencia?.id, pendencia?.origem])

  useEffect(() => { carregarAuditoria() }, [carregarAuditoria])

  const p = detalhe?.pendencia || pendencia
  const transicoes = detalhe?.transicoes || []
  const pendente = ['incerto', 'processando'].includes(p?.status)

  const handleLiberar = async () => {
    if (!p?.origem || !p?.id) return
    const texto = (motivoLiberacao || '').trim()
    if (texto.length < 5) {
      toast.error('Informe um motivo para a liberacao (pelo menos 5 caracteres)')
      return
    }
    setLiberando(true)
    try {
      const r = await api.post(`/nfe/pendencias/${p.origem}/${p.id}/liberar`, { motivo: texto }, { skipGlobalErrorToast: true })
      toast.success(r.data?.mensagem || 'Pendencia fiscal liberada com sucesso! A OS esta pronta para reemissao.')
      if (typeof onLiberada === 'function') onLiberada()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Erro ao liberar pendencia fiscal')
    } finally {
      setLiberando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 800 }}>Auditoria da pendencia fiscal</h2>
            <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {EVENTO_LABEL[p?.tipo] || p?.tipo || 'Pendencia'} - {p?.numero_os || 'OS nao vinculada'}
            </p>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="modal-body modal-body-dense">
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)', background: 'var(--color-surface-offset)', display: 'grid', gap: 'var(--space-2)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: p?.status === 'incerto' ? 'var(--color-error)' : 'var(--color-gold)' }}>
                {PENDENCIA_STATUS_LABEL[p?.status] || p?.status || 'Status pendente'}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                Atualizado em {fmtDate(p?.updatedat)}
              </span>
            </div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>
              {p?.cliente || 'Cliente nao informado'} {p?.numero_nfe ? `- NF-e ${p.numero_nfe}/${p.serie}` : ''}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', overflowWrap: 'anywhere' }}>
              {p?.motivo || p?.chave || 'Sem motivo fiscal registrado.'}
            </div>
            {p?.status === 'incerto' && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)', fontWeight: 700 }}>
                Nao reenviar cegamente. Use esta trilha para conferir o ultimo estado antes da conciliacao fiscal.
              </div>
            )}
          </div>

          {pendente && (
            <div style={{ border: '1px solid var(--color-gold)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)', background: 'var(--color-surface-offset)', display: 'grid', gap: 'var(--space-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--color-gold)' }}>
                  Liberar para Reemissao
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  Desbloqueia a OS
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                Confira na SEFAZ se a nota nao foi autorizada. Ao liberar, a tentativa e encerrada como rejeicao e a OS e desbloqueada para edicao e nova emissao segura.
              </p>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                  Motivo da liberacao
                </label>
                <textarea
                  className="form-input"
                  value={motivoLiberacao}
                  onChange={e => setMotivoLiberacao(e.target.value)}
                  rows={2}
                  style={{ width: '100%', resize: 'vertical', fontSize: 'var(--text-xs)', minHeight: 46 }}
                  placeholder="Informe o motivo da liberacao operacional..."
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleLiberar}
                  disabled={liberando || (motivoLiberacao || '').trim().length < 5}
                >
                  {liberando ? 'Liberando...' : 'Liberar para Reemissao'}
                </button>
              </div>
            </div>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800 }}>Linha do tempo</div>
              <button className="btn btn-ghost btn-sm" onClick={carregarAuditoria} disabled={loading}>
                Atualizar
              </button>
            </div>
            {loading ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                <div className="spinner" style={{ margin: '0 auto var(--space-3)' }} />Carregando auditoria...
              </div>
            ) : transicoes.length === 0 ? (
              <div style={{ padding: 'var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                Nenhuma transicao registrada para esta tentativa.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                {transicoes.map((t) => (
                  <div key={t.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', display: 'grid', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 800 }}>{PENDENCIA_STATUS_LABEL[t.status] || t.status}</span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{fmtDate(t.createdat)}</span>
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      {t.estado_anterior || 'inicio'} {'->'} {t.estado_novo || t.status}
                      {t.cstat ? ` - cStat ${t.cstat}` : ''}
                    </div>
                    {t.motivo && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text)', overflowWrap: 'anywhere' }}>{t.motivo}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

function CampoFiscal({ item, index, field, width, onChange }) {
  return (
    <td style={{ padding: 'var(--space-1) var(--space-2)' }}>
      <input
        className="form-input"
        value={item[field] || ''}
        onChange={e => onChange(index, field, e.target.value)}
        style={{ width: width || 64, height: 30, padding: '3px 6px', fontSize: 'var(--text-xs)', fontVariantNumeric: 'tabular-nums' }}
      />
    </td>
  )
}

function CampoNCM({ item, index, onChange }) {
  return (
    <td style={{ padding: 'var(--space-1) var(--space-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          className="form-input"
          value={item.ncm || ''}
          onChange={e => onChange(index, 'ncm', e.target.value)}
          placeholder="NCM"
          style={{ width: 80, height: 30, padding: '3px 6px', fontSize: 'var(--text-xs)', fontVariantNumeric: 'tabular-nums' }}
        />
        <select
          className="form-input"
          value=""
          aria-label="Selecionar NCM comum"
          title="Selecionar NCM comum"
          onChange={e => {
            if (e.target.value) onChange(index, 'ncm', e.target.value)
          }}
          style={{ width: 28, height: 30, padding: '2px', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
        >
          <option value=""></option>
          {NCM_SUGESTOES_NFE.map(opcao => (
            <option key={`${opcao.label}-${opcao.value}`} value={opcao.value}>
              {opcao.label} - {opcao.value}
            </option>
          ))}
        </select>
      </div>
    </td>
  )
}

function CampoClienteEmissao({ label, field, value, onChange }) {
  return (
    <label style={{ display: 'grid', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700 }}>{label}</span>
      <input
        className="form-input"
        value={value || ''}
        onChange={e => onChange(field, e.target.value)}
        style={{ width: '100%', height: 30, padding: '4px 8px', fontSize: 'var(--text-xs)' }}
      />
    </label>
  )
}

function mensagemCamposFiscaisCliente(campos) {
  if (campos.length === 1) return `Preencha os dados fiscais do cliente: ${campos[0]}.`
  return `Preencha os dados fiscais do cliente: ${campos.slice(0, -1).join(', ')} e ${campos[campos.length - 1]}.`
}

function erroItemFiscal(item) {
  const nome = item?.nome || 'item da NF-e'
  const ncm = String(item?.ncm ?? '').replace(/\D/g, '')
  const cfop = String(item?.cfop ?? '').replace(/\D/g, '')
  const csosn = String(item?.csosn ?? '').replace(/\D/g, '')
  const origem = String(item?.origem_fiscal ?? '').replace(/\D/g, '')
  const unidade = String(item?.unidade ?? '').trim()
  if (!(Number(item?.quantidade) > 0)) return `Item "${nome}": quantidade deve ser maior que zero.`
  if (!(Number(item?.preco_unitario) > 0)) return `Item "${nome}": preco unitario deve ser maior que zero.`
  if (ncm.length !== 8) return `Item "${nome}": NCM deve ter 8 digitos.`
  if (cfop.length !== 4) return `Item "${nome}": CFOP deve ter 4 digitos.`
  if (!CSOSN_VALIDOS_NFE.has(csosn)) return `Item "${nome}": CSOSN invalido. Use 101, 102, 103, 300, 400, 500 ou 900.`
  if (!/^[0-8]$/.test(origem)) return `Item "${nome}": origem fiscal deve ser um digito de 0 a 8.`
  if (!unidade) return `Item "${nome}": unidade fiscal e obrigatoria.`
  return ''
}

export function ModalEmitir({ ordemInicial, onClose, onSuccess }) {
  const ordemInicialResolvida = useMemo(() => {
    if (!ordemInicial) return null
    const targetId = ordemInicial.ordemid || ordemInicial.id
    return {
      ...ordemInicial,
      id: targetId,
      numero: ordemInicial.numero_os || ordemInicial.numero,
    }
  }, [ordemInicial])

  const [modo, setModo]                       = useState(ordemInicial ? 'ordem' : 'ordem')
  const [ordens, setOrdens]               = useState([])
  const [loadingOS, setLoadingOS]         = useState(true)
  const [q, setQ]                         = useState('')
  const [ordemSel, setOrdemSel]           = useState(ordemInicialResolvida || null)
  const [etapa, setEtapa]                 = useState(ordemInicialResolvida ? 'revisar' : 'selecionar')
  const [previa, setPrevia]               = useState(null)
  const [loadingPrevia, setLoadingPrevia] = useState(Boolean(ordemInicialResolvida))
  const [produtos, setProdutos]             = useState([])
  const [clientes, setClientes]             = useState([])
  const [produtoBusca, setProdutoBusca]     = useState('')
  const [itemManual, setItemManual]         = useState({ nome: '', quantidade: 1, preco_unitario: '' })
  const [loadingCatalogo, setLoadingCatalogo] = useState(false)
  const [emitindo, setEmitindo]           = useState(false)
  const [erroFiscal, setErroFiscal]       = useState('')
  const [cepLoading, setCepLoading]       = useState(false)
  const inputRef = useRef(null)

  const carregarPrevia = useCallback(async (ordem) => {
    const targetId = ordem?.ordemid || ordem?.id
    if (!targetId) return
    setLoadingPrevia(true)
    setErroFiscal('')
    try {
      const r = await api.get(`/nfe/emitir/${targetId}/preview`, { skipGlobalErrorToast: true })
      setPrevia(r.data)
      setOrdemSel(r.data?.ordem || { ...ordem, id: targetId, numero: ordem.numero_os || ordem.numero })
      setEtapa('revisar')
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Erro ao montar previa da NF-e')
      if (!ordemInicial) setEtapa('selecionar')
    } finally {
      setLoadingPrevia(false)
    }
  }, [ordemInicial])

  const carregarCatalogoAvulso = useCallback(async () => {
    setLoadingCatalogo(true)
    try {
      const [produtosResp, clientesResp, previaResp] = await Promise.all([
        api.get('/produtos', { skipGlobalErrorToast: true }),
        api.get('/clientes', { skipGlobalErrorToast: true }),
        api.get('/nfe/avulsa/preview', { skipGlobalErrorToast: true }),
      ])
      setProdutos(produtosResp.data?.produtos || produtosResp.data?.data || produtosResp.data || [])
      setClientes(clientesResp.data?.clientes || clientesResp.data?.data || clientesResp.data || [])
      setPrevia(previaResp.data)
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Erro ao carregar dados para NF-e avulsa')
    } finally {
      setLoadingCatalogo(false)
      setLoadingPrevia(false)
    }
  }, [])

  const entrarModoAvulsa = useCallback(() => {
    setModo('avulsa')
    setEtapa('avulsa')
    setOrdemSel(null)
    setErroFiscal('')
    setLoadingPrevia(true)
    carregarCatalogoAvulso()
  }, [carregarCatalogoAvulso])

  const entrarModoOrdem = useCallback(() => {
    setModo('ordem')
    setEtapa('selecionar')
    setPrevia(null)
    setErroFiscal('')
    setLoadingPrevia(false)
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
    api.get('/ordens').then(r => {
      const lista = (r.data?.ordens || r.data || []).filter(
        o => STATUS_NFE_EMISSAO.includes(o.status) && o.nfe_status !== 'autorizado'
      )
      setOrdens(lista)
    }).catch(() => toast.error('Erro ao carregar ordens'))
      .finally(() => setLoadingOS(false))
  }, [])

  useEffect(() => {
    if (ordemInicialResolvida?.id) carregarPrevia(ordemInicialResolvida)
  }, [carregarPrevia, ordemInicialResolvida])

  const filtradas = q.trim()
    ? ordens.filter(o =>
        o.numero?.toLowerCase().includes(q.toLowerCase()) ||
        o.clientenome?.toLowerCase().includes(q.toLowerCase()) ||
        o.servico?.toLowerCase().includes(q.toLowerCase())
      )
    : ordens

  const produtosFiltrados = produtoBusca.trim()
    ? produtos.filter(p => (p.nome || p.name || '').toLowerCase().includes(produtoBusca.toLowerCase()))
    : produtos.slice(0, 8)

  const atualizarItensAvulsos = (updater) => {
    setPrevia(prev => {
      if (!prev) return prev
      const itens = updater(prev.itens || [])
      const total = itens.reduce((acc, item) => acc + Number(item.quantidade || 1) * Number(item.preco_unitario || 0), 0)
      return {
        ...prev,
        ordem: {
          ...prev.ordem,
          valortotal: Math.round(total * 100) / 100,
        },
        itens,
      }
    })
  }

  const selecionarClienteAvulsa = (clienteId) => {
    const cliente = clientes.find(c => String(c.id) === String(clienteId))
    setPrevia(prev => {
      if (!prev) return prev
      return {
        ...prev,
        cliente: cliente
          ? {
              id: cliente.id,
              nome: cliente.name || cliente.nome || '',
              documento: cliente.cpf || '',
              ie: cliente.ie || '',
              ind_ie_dest: cliente.ind_ie_dest || '',
              logradouro: cliente.logradouro || '',
              numero: cliente.numero || '',
              bairro: cliente.bairro || '',
              cidade: cliente.cidade || '',
              uf: cliente.uf || '',
              cep: cliente.cep || '',
            }
          : { nome: '', documento: '', ie: '', ind_ie_dest: '', logradouro: '', numero: '', bairro: '', cidade: '', uf: '', cep: '' },
      }
    })
  }

  const adicionarProdutoAvulsa = (produto) => {
    atualizarItensAvulsos(itens => [...itens, produtoParaItemNfe(produto)])
    setProdutoBusca('')
    setErroFiscal('')
  }

  const adicionarItemManual = () => {
    if (!String(itemManual.nome || '').trim()) {
      setErroFiscal('Informe o nome do item avulso.')
      return
    }
    const item = itemAvulsoParaNfe(itemManual)
    atualizarItensAvulsos(itens => [...itens, item])
    setItemManual({ nome: '', quantidade: 1, preco_unitario: '' })
    setErroFiscal('')
  }

  const atualizarItemAvulso = (index, field, value) => {
    atualizarItensAvulsos(itens => itens.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      if (field === 'quantidade') return { ...item, quantidade: Math.max(1, Number(value || 1)) }
      if (field === 'preco_unitario') return { ...item, preco_unitario: Math.max(0, Number(value || 0)) }
      return { ...item, [field]: value }
    }))
  }

  const removerItemAvulso = (index) => {
    atualizarItensAvulsos(itens => itens.filter((_, itemIndex) => itemIndex !== index))
  }

  const criarPreviaAvulsa = async () => {
    if (!previa?.itens?.length) {
      setErroFiscal('Adicione ao menos um item para revisar a NF-e avulsa.')
      return
    }
    const erroItem = previa.itens.map(erroItemFiscal).find(Boolean)
    if (erroItem) {
      setErroFiscal(erroItem)
      return
    }
    setLoadingPrevia(true)
    setErroFiscal('')
    try {
      const r = await api.post('/nfe/avulsa/preview', {
        cliente: previa.cliente,
        itens: previa.itens,
        pagamento: previa.ordem?.pagamento || 'Pix',
        informacoes_complementares: previa.informacoes_complementares || '',
      }, { skipGlobalErrorToast: true })
      setPrevia(r.data)
      setEtapa('revisar')
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Erro ao montar previa da NF-e avulsa')
    } finally {
      setLoadingPrevia(false)
    }
  }

  const atualizarItemFiscal = (index, field, value) => {
    setPrevia(prev => {
      if (!prev) return prev
      const itens = [...prev.itens]
      const normalizado = field === 'unidade'
        ? value.toUpperCase().slice(0, 6)
        : value.replace(/\D/g, '').slice(0, field === 'ncm' ? 8 : field === 'cfop' ? 4 : field === 'origem_fiscal' ? 1 : 3)
      itens[index] = { ...itens[index], [field]: normalizado }
      return { ...prev, itens }
    })
  }

  const buscarCepCliente = async (value) => {
    if (String(value || '').replace(/\D/g, '').length !== 8) return
    setCepLoading(true)
    try {
      const endereco = await buscarEnderecoPorCep(value)
      if (endereco) {
        setPrevia(prev => {
          if (!prev) return prev
          return {
            ...prev,
            cliente: {
              ...prev.cliente,
              cep: endereco.cep,
              logradouro: endereco.logradouro || prev.cliente?.logradouro || '',
              bairro: endereco.bairro || prev.cliente?.bairro || '',
              cidade: endereco.cidade || prev.cliente?.cidade || '',
              uf: endereco.uf || prev.cliente?.uf || '',
            },
          }
        })
      }
    } catch {
      toast.error('Nao foi possivel buscar o CEP')
    } finally {
      setCepLoading(false)
    }
  }

  const atualizarCliente = (field, value) => {
    const normalizado =
      field === 'documento'
        ? value.replace(/\D/g, '').slice(0, 14)
        : field === 'cep'
          ? maskCep(value)
          : field === 'uf'
            ? value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)
            : value
    setPrevia(prev => {
      if (!prev) return prev
      return {
        ...prev,
        cliente: {
          ...prev.cliente,
          [field]: normalizado,
        },
      }
    })
    if (field === 'cep') buscarCepCliente(normalizado)
  }

  const atualizarInformacoesComplementares = (value) => {
    setPrevia(prev => {
      if (!prev) return prev
      return {
        ...prev,
        informacoes_complementares: String(value || '').slice(0, MAX_INFORMACOES_COMPLEMENTARES_NFE),
      }
    })
  }

  const validarItens = () => {
    const cliente = previa?.cliente || {}
    const documento = String(cliente.documento || '').replace(/\D/g, '')
    const cep = String(cliente.cep || '').replace(/\D/g, '')
    if (modo !== 'avulsa') {
      if (!String(cliente.nome || '').trim()) {
        setErroFiscal('Informe o nome do cliente.')
        return false
      }
      const camposFaltando = []
      if (!documento) camposFaltando.push('CPF/CNPJ')
      if (!String(cliente.logradouro || '').trim()) camposFaltando.push('logradouro')
      if (!String(cliente.numero || '').trim()) camposFaltando.push('numero')
      if (!String(cliente.bairro || '').trim()) camposFaltando.push('bairro')
      if (!String(cliente.cidade || '').trim()) camposFaltando.push('cidade')
      if (!String(cliente.uf || '').trim()) camposFaltando.push('UF')
      if (!cep) camposFaltando.push('CEP')
      if (camposFaltando.length) {
        setErroFiscal(mensagemCamposFiscaisCliente(camposFaltando))
        return false
      }
      if (documento.length !== 11 && documento.length !== 14) {
        setErroFiscal('CPF/CNPJ do cliente deve ter 11 ou 14 digitos.')
        return false
      }
      if (cep.length !== 8) {
        setErroFiscal('CEP do cliente deve ter 8 digitos.')
        return false
      }
      if (!/^[A-Z]{2}$/.test(String(cliente.uf))) {
        setErroFiscal('UF do cliente deve ter 2 letras.')
        return false
      }
    } else if (documento && documento.length !== 11 && documento.length !== 14) {
      setErroFiscal('CPF/CNPJ do cliente deve ter 11 ou 14 digitos.')
      return false
    } else if (cep && cep.length !== 8) {
      setErroFiscal('CEP do cliente deve ter 8 digitos.')
      return false
    } else if (cliente.uf && !/^[A-Z]{2}$/.test(String(cliente.uf))) {
      setErroFiscal('UF do cliente deve ter 2 letras.')
      return false
    }

    if (!(previa?.itens || []).length) {
      setErroFiscal('Adicione ao menos um item para emitir a NF-e.')
      return false
    }
    const erroItem = (previa?.itens || []).map(erroItemFiscal).find(Boolean)
    if (erroItem) {
      setErroFiscal(erroItem)
      return false
    }
    setErroFiscal('')
    return true
  }

  const handleEmitir = async () => {
    if ((!ordemSel && modo !== 'avulsa') || !previa || !validarItens()) return
    setEmitindo(true)
    try {
      if (modo === 'avulsa') {
        await api.post('/nfe/avulsa', {
          cliente: previa.cliente,
          itens: previa.itens,
          pagamento: previa.ordem?.pagamento || 'Pix',
          informacoes_complementares: previa.informacoes_complementares || '',
        }, { timeout: 80000, skipGlobalErrorToast: true })
        toast.success('NF-e avulsa emitida com sucesso!')
      } else {
        const itens = previa.itens.map(item => ({
          id: item.id,
          produto_id: item.produto_id,
          ncm: item.ncm,
          cfop: item.cfop,
          csosn: item.csosn,
          origem_fiscal: item.origem_fiscal,
          unidade: item.unidade,
        }))
        await api.post(`/nfe/emitir/${ordemSel.id}`, {
          cliente: previa.cliente,
          itens,
          informacoes_complementares: previa.informacoes_complementares || '',
        }, { timeout: 80000, skipGlobalErrorToast: true })
        toast.success(`NF-e emitida com sucesso para ${ordemSel.numero || previa.ordem?.numero}!`)
      }
      onSuccess()
      onClose()
    } catch (e) {
      toast.error(mensagemErroNfe(e))
    } finally {
      setEmitindo(false)
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal modal-2xl">
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0 }}>Emitir NF-e</h2>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {etapa === 'selecionar'
                ? `Selecione uma OS com status ${STATUS_NFE_EMISSAO_LABEL}`
                : etapa === 'avulsa'
                  ? 'Monte uma NF-e avulsa sem OS e sem lancamento no caixa'
                  : 'Confira cliente, emitente e itens antes de enviar para a SEFAZ'}
            </p>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {!ordemInicial && etapa !== 'revisar' && (
          <div style={{ padding: 'var(--space-2) var(--space-4)', borderBottom: '1px solid var(--color-divider)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', background: 'var(--color-surface-offset)' }}>
            <button
              type="button"
              className={`btn btn-sm ${modo === 'ordem' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={entrarModoOrdem}
              disabled={emitindo || loadingPrevia}
            >
              Por OS
            </button>
            <button
              type="button"
              className={`btn btn-sm ${modo === 'avulsa' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={entrarModoAvulsa}
              disabled={emitindo || loadingCatalogo}
            >
              Avulsa
            </button>
          </div>
        )}

        {etapa === 'selecionar' && (
          <>
            <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-divider)' }}>
              <div style={{ position: 'relative' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                </svg>
                <input ref={inputRef} type="text" value={q} onChange={e => setQ(e.target.value)}
                  placeholder="Buscar por OS, cliente ou servico..."
                  style={{ width: '100%', padding: '6px 12px 6px 32px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-offset)', fontSize: 'var(--text-xs)', color: 'var(--color-text)' }}
                />
              </div>
            </div>

            <div className="modal-body" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-3)' }}>
              {loadingOS ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-muted)' }}>
                  <div className="spinner" style={{ margin: '0 auto var(--space-3)' }}/>Carregando ordens...
                </div>
              ) : filtradas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-muted)' }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" style={{ margin: '0 auto var(--space-2)', display: 'block', opacity: 0.4 }}>
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>
                  </svg>
                  <div style={{ fontSize: 'var(--text-sm)' }}>{q ? 'Nenhuma OS encontrada' : 'Nenhuma OS elegivel para emissao'}</div>
                </div>
              ) : (
                filtradas.map(o => {
                  const sel = ordemSel?.id === o.id
                  return (
                    <button key={o.id} onClick={() => setOrdemSel(sel ? null : o)}
                      style={{
                        width: '100%', textAlign: 'left',
                        padding: 'var(--space-2) var(--space-3)', marginBottom: 'var(--space-2)',
                        borderRadius: 'var(--radius-md)',
                        border: `1.5px solid ${sel ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        background: sel ? 'var(--color-primary-highlight)' : 'var(--color-surface-offset)',
                        cursor: 'pointer', transition: 'all var(--transition-interactive)',
                        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 'var(--space-2)', alignItems: 'start',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 2 }}>
                          <span style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>OS {o.numero}</span>
                          <span className={`badge badge-${tipoBadge(o.servico)}`}>{o.servico}</span>
                          <span className={`badge badge-${statusColor(o.status)}`}>{o.status}</span>
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                          Cliente: <b>{o.clientenome}</b> · Criada em {fmtDate(o.createdat)}
                        </div>
                        {o.itens_resumo && (
                          <div style={{ fontSize: '11px', color: 'var(--color-text-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {o.itens_resumo}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>{fmt(o.valortotal)}</div>
                        <div style={{ fontSize: '10px', color: 'var(--color-text-faint)' }}>{o.formapagamento || '—'}</div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </>
        )}

        {etapa === 'avulsa' && (
          <div className="modal-body modal-body-dense" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {loadingCatalogo ? (
              <div style={{ minHeight: 220, display: 'grid', placeItems: 'center', color: 'var(--color-text-muted)' }}>
                <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-3)' }}><div className="spinner"/>Carregando catalogo...</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 'var(--space-3)' }}>
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)', background: 'var(--color-surface)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>NF-e avulsa</div>
                    <label style={{ display: 'grid', gap: 4 }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 700 }}>Selecionar cliente</span>
                      <select className="form-input" style={{ fontSize: 'var(--text-xs)', height: 32 }} value={previa?.cliente?.id || ''} onChange={e => selecionarClienteAvulso(e.target.value)}>
                        <option value="">Selecione um cliente cadastrado ou preencha abaixo</option>
                        {clientes.map(c => (
                          <option key={c.id} value={c.id}>{c.name || c.nome} {c.cpf || c.cnpj ? `(${c.cpf || c.cnpj})` : ''}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)', background: 'var(--color-surface)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Adicionar do catalogo</div>
                    <input
                      className="form-input"
                      placeholder="Buscar produto cadastrado..."
                      value={produtoBusca}
                      onChange={e => setProdutoBusca(e.target.value)}
                      style={{ fontSize: 'var(--text-xs)', height: 32 }}
                    />
                    <div style={{ display: 'grid', gap: 'var(--space-1)', maxHeight: 130, overflowY: 'auto' }}>
                      {produtosFiltrados.length === 0 ? (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', padding: 'var(--space-2)' }}>Nenhum produto encontrado</div>
                      ) : produtosFiltrados.map(produto => (
                        <button
                          key={produto.id}
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => adicionarProdutoAvulsa(produto)}
                          style={{ justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}
                        >
                          <span>{produto.nome || produto.name}</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(produto.preco || produto.valor || produto.preco_unitario)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)', background: 'var(--color-surface)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Item avulso</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr)) auto', gap: 'var(--space-2)', alignItems: 'end' }}>
                    <label style={{ display: 'grid', gap: 2, gridColumn: 'span 2' }}>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700 }}>Descricao</span>
                      <input className="form-input" value={itemManual.nome} onChange={e => setItemManual(prev => ({ ...prev, nome: e.target.value }))} style={{ height: 30, fontSize: 'var(--text-xs)' }} />
                    </label>
                    <label style={{ display: 'grid', gap: 2 }}>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700 }}>Qtd.</span>
                      <input className="form-input" type="number" min="1" value={itemManual.quantidade} onChange={e => setItemManual(prev => ({ ...prev, quantidade: e.target.value }))} style={{ height: 30, fontSize: 'var(--text-xs)' }} />
                    </label>
                    <label style={{ display: 'grid', gap: 2 }}>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700 }}>Unit.</span>
                      <input className="form-input" type="number" min="0" step="0.01" value={itemManual.preco_unitario} onChange={e => setItemManual(prev => ({ ...prev, preco_unitario: e.target.value }))} style={{ height: 30, fontSize: 'var(--text-xs)' }} />
                    </label>
                    <button type="button" className="btn btn-primary btn-sm" onClick={adicionarItemManual} style={{ height: 30 }}>Adicionar</button>
                  </div>
                </div>

                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--color-surface)' }}>
                  <div style={{ padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid var(--color-divider)', background: 'var(--color-surface-offset)', display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Itens selecionados</div>
                    {erroFiscal && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)', fontWeight: 700 }}>{erroFiscal}</div>}
                  </div>
                  {(previa?.itens || []).length === 0 ? (
                    <div style={{ padding: 'var(--space-4)', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>Nenhum item adicionado.</div>
                  ) : (
                    <div style={{ overflowX: 'auto', maxHeight: 180, overflowY: 'auto' }}>
                      <table style={{ width: '100%', minWidth: 540, borderCollapse: 'collapse' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--color-surface-offset)' }}>
                          <tr style={{ borderBottom: '1px solid var(--color-divider)' }}>
                            {['Produto', 'Qtd.', 'Unit.', 'Total', ''].map(h => (
                              <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 800 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previa.itens.map((item, index) => (
                            <tr key={item.id || index} style={{ borderBottom: '1px solid var(--color-divider)' }}>
                              <td style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', fontWeight: 700 }}>{item.nome}</td>
                              <td style={{ padding: '4px 8px' }}>
                                <input className="form-input" type="number" min="1" value={item.quantidade} onChange={e => atualizarItemAvulso(index, 'quantidade', e.target.value)} style={{ width: 64, height: 28, padding: '2px 6px', fontSize: 'var(--text-xs)' }} />
                              </td>
                              <td style={{ padding: '4px 8px' }}>
                                <input className="form-input" type="number" min="0" step="0.01" value={item.preco_unitario} onChange={e => atualizarItemAvulso(index, 'preco_unitario', e.target.value)} style={{ width: 88, height: 28, padding: '2px 6px', fontSize: 'var(--text-xs)' }} />
                              </td>
                              <td style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', fontWeight: 800, whiteSpace: 'nowrap' }}>{fmt(Number(item.quantidade || 1) * Number(item.preco_unitario || 0))}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removerItemAvulso(index)} style={{ padding: '2px 6px', height: 24, fontSize: '11px' }}>Remover</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {etapa === 'revisar' && (
          <div className="modal-body modal-body-dense" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {loadingPrevia ? (
              <div style={{ minHeight: 220, display: 'grid', placeItems: 'center', color: 'var(--color-text-muted)' }}>
                <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-3)' }}><div className="spinner"/>Montando previa...</div>
              </div>
            ) : previa && (
              <>
                {/* 1. Resumo Rápido */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'var(--space-2)' }}>
                  {[
                    ['OS', previa.ordem?.numero, previa.ordem?.servico],
                    ['Cliente', previa.cliente?.nome, previa.cliente?.documento || 'Sem documento'],
                    ['Emitente', previa.emitente?.xNome, `Serie ${previa.fiscal?.serie || '1'} - ${previa.fiscal?.ambiente === 1 ? 'Producao' : 'Homologacao'}`],
                    ['Total', fmt(previa.ordem?.valortotal), previa.ordem?.pagamento || 'Pagamento nao informado'],
                  ].map(([label, value, detail]) => (
                    <div key={label} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-offset)', padding: '4px var(--space-2)', minWidth: 0 }}>
                      <div style={{ fontSize: '9px', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '-'}</div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail || '-'}</div>
                    </div>
                  ))}
                </div>

                {/* 2. ITENS DA NF-E (PRODUTOS) - Diretamente no topo para visibilidade imediata */}
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--color-surface)' }}>
                  <div style={{ padding: '4px var(--space-3)', borderBottom: '1px solid var(--color-divider)', background: 'var(--color-surface-offset)', display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text)', letterSpacing: '0.04em' }}>Itens da NF-e</span>
                      <span style={{ fontSize: '10px', color: 'var(--color-text-faint)', marginLeft: 8 }}>Edicao fiscal por item</span>
                    </div>
                    {erroFiscal && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)', fontWeight: 700 }}>{erroFiscal}</div>}
                  </div>
                  <div style={{ overflowX: 'auto', maxHeight: 220, overflowY: 'auto' }}>
                    <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--color-surface-offset)' }}>
                        <tr style={{ borderBottom: '1px solid var(--color-divider)' }}>
                          {['Produto', 'Qtd.', 'Unit.', 'Total', 'NCM', 'CFOP', 'CSOSN', 'Origem', 'Un.'].map(h => (
                            <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 800, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previa.itens.map((item, index) => (
                          <tr key={item.id || index} style={{ borderBottom: index === previa.itens.length - 1 ? 'none' : '1px solid var(--color-divider)' }}>
                            <td style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', fontWeight: 700, minWidth: 160 }}>{item.nome}</td>
                            <td style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>{item.quantidade}</td>
                            <td style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>{fmt(item.preco_unitario)}</td>
                            <td style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(item.subtotal)}</td>
                            <CampoNCM item={item} index={index} onChange={atualizarItemFiscal} />
                            <CampoFiscal item={item} index={index} field="cfop" width={64} onChange={atualizarItemFiscal} />
                            <CampoFiscal item={item} index={index} field="csosn" width={64} onChange={atualizarItemFiscal} />
                            <CampoFiscal item={item} index={index} field="origem_fiscal" width={52} onChange={atualizarItemFiscal} />
                            <CampoFiscal item={item} index={index} field="unidade" width={56} onChange={atualizarItemFiscal} />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3. Dados do Cliente e Emitente */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 'var(--space-2)' }}>
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2)', display: 'grid', gap: 'var(--space-1)', background: 'var(--color-surface)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.04em' }}>Dados do cliente</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'var(--space-1)' }}>
                      <div style={{ gridColumn: 'span 2' }}>
                        <CampoClienteEmissao label="Nome" field="nome" value={previa.cliente?.nome} onChange={atualizarCliente} />
                      </div>
                      <CampoClienteEmissao label="CPF/CNPJ" field="documento" value={previa.cliente?.documento} onChange={atualizarCliente} />
                      <CampoClienteEmissao label="IE" field="ie" value={previa.cliente?.ie} onChange={atualizarCliente} />
                      {(previa.cliente?.documento || '').replace(/\D/g, '').length >= 14 && (
                        <div>
                          <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 1, display: 'block' }}>Tipo Contribuinte</label>
                          <select className="form-input" style={{ fontSize: '11px', padding: '2px 4px', height: 26 }} value={previa.cliente?.ind_ie_dest || ''} onChange={e => atualizarCliente('ind_ie_dest', e.target.value)}>
                            <option value="">Auto</option>
                            <option value="1">Contribuinte com IE</option>
                            <option value="2">Contribuinte Isento</option>
                            <option value="9">Nao Contribuinte</option>
                          </select>
                        </div>
                      )}
                      <CampoClienteEmissao label={cepLoading ? 'Buscando...' : 'CEP'} field="cep" value={previa.cliente?.cep} onChange={atualizarCliente} />
                      <div style={{ gridColumn: 'span 2' }}>
                        <CampoClienteEmissao label="Logradouro" field="logradouro" value={previa.cliente?.logradouro} onChange={atualizarCliente} />
                      </div>
                      <CampoClienteEmissao label="Numero" field="numero" value={previa.cliente?.numero} onChange={atualizarCliente} />
                      <CampoClienteEmissao label="Bairro" field="bairro" value={previa.cliente?.bairro} onChange={atualizarCliente} />
                      <div style={{ gridColumn: 'span 2' }}>
                        <CampoClienteEmissao label="Cidade" field="cidade" value={previa.cliente?.cidade} onChange={atualizarCliente} />
                      </div>
                      <CampoClienteEmissao label="UF" field="uf" value={previa.cliente?.uf} onChange={atualizarCliente} />
                    </div>
                  </div>

                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2)', display: 'grid', gap: 2, background: 'var(--color-surface)', alignContent: 'start' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.04em' }}>Dados do emitente</div>
                    {[
                      ['Razao', previa.emitente?.xNome],
                      ['Fantasia', previa.emitente?.xFant],
                      ['CNPJ', previa.emitente?.CNPJ],
                      ['IE', previa.emitente?.IE],
                      ['Endereco', [previa.emitente?.enderEmit?.xLgr, previa.emitente?.enderEmit?.nro, previa.emitente?.enderEmit?.xBairro].filter(Boolean).join(', ')],
                    ].map(([label, value]) => (
                      <div key={label} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)', gap: 'var(--space-1)', fontSize: '11px', padding: '1px 0', borderBottom: '1px solid var(--color-divider)' }}>
                        <span style={{ color: 'var(--color-text-muted)', fontWeight: 700 }}>{label}</span>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '-'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Informações complementares */}
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2)', display: 'grid', gap: 2, background: 'var(--color-surface)' }}>
                  <label style={{ display: 'grid', gap: 2 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'center', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                      <span>Informacoes complementares</span>
                      <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {String(previa.informacoes_complementares || '').length}/{MAX_INFORMACOES_COMPLEMENTARES_NFE}
                      </span>
                    </span>
                    <textarea
                      className="form-input"
                      aria-label="Informacoes complementares"
                      value={previa.informacoes_complementares || ''}
                      onChange={e => atualizarInformacoesComplementares(e.target.value)}
                      maxLength={MAX_INFORMACOES_COMPLEMENTARES_NFE}
                      rows={2}
                      style={{ width: '100%', minHeight: 52, maxHeight: 100, resize: 'vertical', padding: '4px 8px', fontSize: '11px', lineHeight: 1.3 }}
                    />
                  </label>
                </div>
              </>
            )}
          </div>
        )}

        <div className="modal-footer">
          <button
            className="btn btn-ghost"
            onClick={etapa === 'revisar' && !ordemInicial ? () => setEtapa(modo === 'avulsa' ? 'avulsa' : 'selecionar') : onClose}
            disabled={emitindo || loadingPrevia}
          >
            {etapa === 'revisar' && !ordemInicial ? 'Voltar' : 'Cancelar'}
          </button>
          {etapa === 'selecionar' ? (
            <button className="btn btn-primary" onClick={() => carregarPrevia(ordemSel)} disabled={!ordemSel || loadingPrevia} style={{ minWidth: 150 }}>
              {loadingPrevia ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}/> Carregando...</> : 'Revisar dados'}
            </button>
          ) : etapa === 'avulsa' ? (
            <button className="btn btn-primary" onClick={criarPreviaAvulsa} disabled={!previa?.itens?.length || loadingPrevia || loadingCatalogo} style={{ minWidth: 150 }}>
              {loadingPrevia ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}/> Carregando...</> : 'Revisar dados'}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleEmitir} disabled={!previa || emitindo || loadingPrevia} style={{ minWidth: 150 }}>
              {emitindo
                ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}/> Emitindo...</>
                : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg> Emitir NF-e</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ModalEmitirLegacy({ onClose, onSuccess }) {
  const [ordens, setOrdens]       = useState([])
  const [loadingOS, setLoadingOS] = useState(true)
  const [q, setQ]                 = useState('')
  const [ordemSel, setOrdemSel]   = useState(null)
  const [emitindo, setEmitindo]   = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    api.get('/ordens').then(r => {
      const lista = (r.data?.ordens || r.data || []).filter(
        o => STATUS_NFE_EMISSAO.includes(o.status) && o.nfe_status !== 'autorizado'
      )
      setOrdens(lista)
    }).catch(() => toast.error('Erro ao carregar ordens'))
      .finally(() => setLoadingOS(false))
  }, [])

  const filtradas = q.trim()
    ? ordens.filter(o =>
        o.numero?.toLowerCase().includes(q.toLowerCase()) ||
        o.clientenome?.toLowerCase().includes(q.toLowerCase()) ||
        o.servico?.toLowerCase().includes(q.toLowerCase())
      )
    : ordens

  const handleEmitir = async () => {
    if (!ordemSel) return
    setEmitindo(true)
    try {
      await api.post(`/nfe/emitir/${ordemSel.id}`, null, { timeout: 80000, skipGlobalErrorToast: true })
      toast.success(`NF-e emitida com sucesso para ${ordemSel.numero}!`)
      onSuccess()
      onClose()
    } catch (e) {
      toast.error(mensagemErroNfe(e))
    } finally {
      setEmitindo(false)
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal modal-lg">
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0 }}>Emitir NF-e</h2>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Selecione uma OS com status {STATUS_NFE_EMISSAO_LABEL}</p>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-divider)' }}>
          <div style={{ position: 'relative' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input ref={inputRef} type="text" value={q} onChange={e => setQ(e.target.value)}
              placeholder="Buscar por OS, cliente ou serviço…"
              style={{ width: '100%', padding: '6px 12px 6px 32px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-offset)', fontSize: 'var(--text-xs)', color: 'var(--color-text)' }}
            />
          </div>
        </div>

        <div className="modal-body" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-3)' }}>
          {loadingOS ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto var(--space-3)' }}/>Carregando ordens...
            </div>
          ) : filtradas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-muted)' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" style={{ margin: '0 auto var(--space-2)', display: 'block', opacity: 0.4 }}>
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>
              </svg>
              <div style={{ fontSize: 'var(--text-sm)' }}>{q ? 'Nenhuma OS encontrada' : 'Nenhuma OS elegivel para emissao'}</div>
            </div>
          ) : (
            filtradas.map(o => {
              const sel = ordemSel?.id === o.id
              return (
                <button key={o.id} onClick={() => setOrdemSel(sel ? null : o)}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: 'var(--space-2) var(--space-3)', marginBottom: 'var(--space-2)',
                    borderRadius: 'var(--radius-md)',
                    border: `1.5px solid ${sel ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: sel ? 'var(--color-primary-highlight)' : 'var(--color-surface-offset)',
                    cursor: 'pointer', transition: 'all var(--transition-interactive)',
                    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 'var(--space-2)', alignItems: 'start',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{o.numero} - {o.clientenome}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>{o.servico} - {fmt(o.valortotal)}</div>
                    {o.itens_resumo && <div style={{ fontSize: '11px', color: 'var(--color-text-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.itens_resumo}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 86 }}>
                    <span className={`badge badge-${statusColor(o.status)}`}>{o.status}</span>
                    {sel && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>}
                  </div>
                </button>
              )
            })
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={emitindo}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleEmitir} disabled={!ordemSel || emitindo} style={{ minWidth: 140 }}>
            {emitindo
              ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}/> Emitindo…</>
              : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg> Emitir NF-e</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalDetalhe({ nfe, onClose, canXml, canDanfe, onAudit, pendenciasFiscais = [] }) {
  const [eventos, setEventos] = useState([])
  const [loadingEventos, setLoadingEventos] = useState(false)

  useEffect(() => {
    if (!nfe?.nfe_chave && !nfe?.id) {
      setEventos([])
      return
    }

    let alive = true
    setLoadingEventos(true)
    const eventosUrl = nfe.nfe_chave ? `/nfe/${nfe.nfe_chave}/eventos` : `/nfe/ordem/${nfe.id}/eventos`
    api.get(eventosUrl)
      .then(r => { if (alive) setEventos(r.data?.eventos || []) })
      .catch(() => { if (alive) toast.error('Erro ao carregar eventos da NF-e') })
      .finally(() => { if (alive) setLoadingEventos(false) })
    return () => { alive = false }
  }, [nfe?.id, nfe?.nfe_chave])

  if (!nfe) return null

  const baixarXmlAutorizacao = async () => {
    try {
      await baixarArquivo(`/nfe/${nfe.nfe_chave}/xml/autorizacao`, `${nfe.nfe_chave}.xml`)
    } catch (e) {
      toast.error(e.response?.data?.erro || 'XML de autorizacao indisponivel')
    }
  }

  const baixarXmlEvento = async (evento) => {
    try {
      const sufixo = evento.tipo === 'cce'
        ? `cce-${String(evento.nseqevento || 1).padStart(2, '0')}`
        : evento.tipo
      await baixarArquivo(`/nfe/eventos/${evento.id}/xml`, `${evento.chave}-${sufixo}.xml`)
    } catch (e) {
      toast.error(e.response?.data?.erro || 'XML do evento indisponivel')
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal modal-lg">
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0 }}>NF-e Nº {nfe.nfe_numero || '—'}</h2>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Série {nfe.nfe_serie || '—'}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <StatusBadge status={nfe.nfe_status} />
            <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Fechar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div className="modal-body modal-body-dense">
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {[
              ['OS',          nfe.numero || '—'],
              ['Cliente',     nfe.clientenome || '—'],
              ['Serviço',     nfe.servico || '—'],
              ['Valor Total', fmt(nfe.valortotal)],
              ['Emitida em',  fmtDate(nfe.nfe_emitida_em)],
              ['Protocolo',   nfe.nfe_protocolo || '—'],
              ['Motivo rejeicao', nfe.nfe_rejeicao_motivo || '—'],
              ['CC-e emitidas', nfe.nfe_cce_count || 0],
              ['Ultima CC-e', fmtDate(nfe.nfe_cce_ultima_em)],
              ['Cancelada em', fmtDate(nfe.nfe_cancelado_em)],
              ['Protocolo cancelamento', nfe.nfe_cancel_protocolo || '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: 'var(--space-1) 0', borderBottom: '1px solid var(--color-divider)', gap: 'var(--space-4)' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 600, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 'var(--text-sm)', textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
              </div>
            ))}
            {nfe.nfe_chave && (
              <div style={{ paddingTop: 'var(--space-1)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }}>Chave de Acesso</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', background: 'var(--color-surface-offset)', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', wordBreak: 'break-all', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{nfe.nfe_chave}</div>
              </div>
            )}
            <div style={{ paddingTop: 'var(--space-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Eventos fiscais</div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {canXml && nfe.nfe_chave && nfe.nfe_status !== 'rejeitado' && (
                    <button className="btn btn-ghost btn-sm" onClick={baixarXmlAutorizacao}>XML autorizacao</button>
                  )}
                  {canDanfe && ['autorizado', 'cancelado'].includes(nfe.nfe_status) && nfe.nfe_chave && (
                    <button className="btn btn-ghost btn-sm" onClick={() => baixarDanfe(nfe.nfe_chave)} title="Baixar DANFE em PDF">DANFE</button>
                  )}
                </div>
              </div>
              {loadingEventos ? (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', padding: 'var(--space-3)', background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-md)' }}>Carregando eventos...</div>
              ) : eventos.length === 0 ? (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', padding: 'var(--space-3)', background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-md)' }}>Nenhum evento fiscal registrado.</div>
              ) : (
                <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                  {eventos.map(ev => (
                    <div key={ev.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)', background: 'var(--color-surface-offset)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800 }}>{EVENTO_LABEL[ev.tipo] || ev.tipo} {ev.tipo === 'cce' ? `#${ev.nseqevento}` : ''}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: 2 }}>{fmtDate(ev.createdat)} · cStat {ev.cstat || '—'} · protocolo {ev.protocolo || '—'}</div>
                        </div>
                        {canXml && ev.tem_xml ? (
                          <button className="btn btn-ghost btn-sm" onClick={() => baixarXmlEvento(ev)}>XML</button>
                        ) : null}
                      </div>
                      {(ev.texto || ev.motivo) && (
                        <div style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--color-text)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                          {ev.texto || ev.motivo}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {nfe.nfe_status === 'incerto' && typeof onAudit === 'function' && (
              <button
                className="btn btn-warning btn-sm"
                onClick={() => {
                  onClose()
                  const pMatch = (pendenciasFiscais || []).find(p => p.origem === 'emissao' && p.ordemid === nfe.ordemid)
                  onAudit(pMatch || {
                    origem: 'emissao',
                    id: nfe.id,
                    numero_os: nfe.numero,
                    cliente: nfe.clientenome,
                    status: 'incerto',
                    motivo: nfe.nfe_rejeicao_motivo,
                    numero_nfe: nfe.nfe_numero,
                    serie: nfe.nfe_serie,
                  })
                }}
              >
                Auditar / Liberar Pendencia
              </button>
            )}
          </div>
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

function ModalCancelamento({ nfe, onClose, onSuccess }) {
  const [motivo, setMotivo] = useState('')
  const [confirmado, setConfirmado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  if (!nfe) return null

  const handleSubmit = async () => {
    const texto = motivo.trim()
    if (texto.length < 30) {
      toast.error('Informe um motivo mais detalhado, com pelo menos 30 caracteres')
      return
    }
    if (!confirmado) {
      toast.error('Confirme que entende que o cancelamento sera registrado na SEFAZ')
      return
    }
    setEnviando(true)
    try {
      const r = await api.post(`/nfe/${nfe.nfe_chave}/cancelar`, { motivo: texto }, { timeout: 45000, skipGlobalErrorToast: true })
      toast.success(`NF-e cancelada. Protocolo ${r.data?.protocolo || ''}`.trim())
      onSuccess()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Erro ao cancelar NF-e')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm">
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0 }}>Cancelar NF-e</h2>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>NF-e {nfe.nfe_numero}/{nfe.nfe_serie}</p>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="modal-body modal-body-dense">
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-offset)', padding: 'var(--space-2) var(--space-3)', display: 'grid', gap: 2, fontSize: 'var(--text-xs)' }}>
            <div><b>OS:</b> {nfe.numero || '---'} · <b>Cliente:</b> {nfe.clientenome || '---'}</div>
            <div><b>Valor:</b> {fmt(nfe.valortotal)}</div>
            <div style={{ color: 'var(--color-error)', fontWeight: 700, marginTop: 2 }}>Cancelamento e um evento fiscal enviado a SEFAZ.</div>
          </div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)' }}>Motivo do cancelamento</label>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3}
            placeholder="Ex.: Nota emitida com dados incorretos, sera substituida por nova emissao."
            className="form-input"
            style={{ width: '100%', resize: 'vertical', minHeight: 48, maxHeight: 100, fontSize: 'var(--text-xs)' }}
          />
          <div style={{ fontSize: '11px', color: motivo.trim().length < 30 ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>{motivo.trim().length}/30 caracteres minimos</div>
          <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
            <input type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} style={{ marginTop: 2 }} />
            Confirmo que esta NF-e deve ser cancelada na SEFAZ.
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={enviando}>Voltar</button>
          <button className="btn btn-danger" onClick={handleSubmit} disabled={enviando || motivo.trim().length < 30 || !confirmado}>
            {enviando ? 'Cancelando...' : 'Confirmar cancelamento'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalCCE({ nfe, onClose, onSuccess }) {
  const [correcao, setCorrecao] = useState('')
  const [enviando, setEnviando] = useState(false)
  if (!nfe) return null

  const handleSubmit = async () => {
    const texto = correcao.trim()
    if (texto.length < 15 || texto.length > 1000) {
      toast.error('A correcao deve ter entre 15 e 1000 caracteres')
      return
    }
    setEnviando(true)
    try {
      const r = await api.post(`/nfe/${nfe.nfe_chave}/cce`, { correcao: texto }, { timeout: 45000, skipGlobalErrorToast: true })
      toast.success(`CC-e emitida. Seq. ${r.data?.sequencia || ''}`.trim())
      onSuccess()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Erro ao emitir CC-e')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0 }}>Carta de Correcao</h2>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>NF-e {nfe.nfe_numero}/{nfe.nfe_serie}</p>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="modal-body modal-body-dense">
          <div style={{ border: '1px solid var(--color-warning)', borderRadius: 'var(--radius-md)', background: 'var(--color-warning-highlight, var(--color-surface-offset))', padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>
            <div style={{ fontWeight: 800, marginBottom: 2 }}>Antes de emitir a CC-e</div>
            <div>A CC-e nao pode corrigir valor, imposto, quantidade, destinatario ou datas. Use apenas para ajustes descritivos.</div>
          </div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)' }}>Texto da correcao</label>
          <textarea value={correcao} onChange={e => setCorrecao(e.target.value)} rows={4}
            placeholder="Ex.: Corrige-se a descricao do item para Moldura em madeira..."
            className="form-input"
            style={{ width: '100%', resize: 'vertical', minHeight: 60, maxHeight: 140, fontSize: 'var(--text-xs)' }}
          />
          <div style={{ fontSize: '11px', color: correcao.trim().length > 1000 ? 'var(--color-error)' : 'var(--color-text-muted)' }}>{correcao.trim().length}/1000 caracteres</div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={enviando}>Voltar</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={enviando || correcao.trim().length < 15 || correcao.trim().length > 1000}>
            {enviando ? 'Enviando...' : 'Emitir CC-e'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalExportacaoNFe({ onClose }) {
  const hoje = hojeBrt()
  const primeiroDiaMes = `${hoje.slice(0, 8)}01`
  const [tipo, setTipo] = useState('xml')
  const [inicio, setInicio] = useState(primeiroDiaMes)
  const [fim, setFim] = useState(hoje)
  const [baixando, setBaixando] = useState(false)

  const handleSubmit = async () => {
    if (!inicio || !fim) {
      toast.error('Informe data inicial e data final')
      return
    }
    if (inicio > fim) {
      toast.error('Data inicial nao pode ser maior que data final')
      return
    }

    setBaixando(true)
    try {
      await baixarArquivo('/nfe/exportar', `nfe-${tipo}-${inicio}-a-${fim}.zip`, {
        params: { tipo, inicio, fim },
        responseType: 'blob',
        timeout: 120000,
        skipGlobalErrorToast: true,
      })
      toast.success('Exportacao gerada')
      onClose()
    } catch (e) {
      toast.error(await mensagemErroBlob(e, 'Nao foi possivel exportar NF-e'))
    } finally {
      setBaixando(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exportar-nfe-title"
      className="modal-overlay"
      onClick={e => e.target === e.currentTarget && !baixando && onClose()}
    >
      <div className="modal modal-sm">
        <div className="modal-header">
          <div>
            <h2 id="exportar-nfe-title" style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0 }}>Exportar NF-e</h2>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Baixe XML ou DANFE PDF por periodo de emissao.</p>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose} disabled={baixando} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body modal-body-dense">
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)' }}>Tipo</span>
            <select className="form-input" value={tipo} onChange={e => setTipo(e.target.value)} disabled={baixando} style={{ height: 32, fontSize: 'var(--text-xs)' }}>
              <option value="xml">XML</option>
              <option value="danfe">DANFE PDF</option>
            </select>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)' }}>Data inicial</span>
              <input className="form-input" type="date" value={inicio} onChange={e => setInicio(e.target.value)} disabled={baixando} style={{ height: 32, fontSize: 'var(--text-xs)' }} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)' }}>Data final</span>
              <input className="form-input" type="date" value={fim} onChange={e => setFim(e.target.value)} disabled={baixando} style={{ height: 32, fontSize: 'var(--text-xs)' }} />
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={baixando}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={baixando}>{baixando ? 'Exportando...' : 'Exportar'}</button>
        </div>
      </div>
    </div>
  )
}

export default function NotasFiscais({ lixeira = false }) {
  const navigate = useNavigate()
  const { can } = useAuth() || {}
  const canEmitir = typeof can === 'function' && can('nfe.emitir')
  const canCancelar = typeof can === 'function' && can('nfe.cancelar')
  const canCce = typeof can === 'function' && can('nfe.cce')
  const canXml = typeof can === 'function' && can('nfe.xml')
  const canDanfe = typeof can === 'function' && can('nfe.danfe')
  const canLixeira = typeof can === 'function' && can('nfe.lixeira')
  const canInutilizar = typeof can === 'function' && can('nfe.inutilizar')
  const canIntegridade = typeof can === 'function' && can('nfe.integridade')
  const canExportar = typeof can === 'function' && can('nfe.exportar')
  const canConciliar = typeof can === 'function' && can('nfe.conciliar')
  const [notas, setNotas]             = useState([])
  const [nfeMeta, setNfeMeta]         = useState({ ambiente: null, autorizadas_homologacao: 0, alvo_homologacao: HOMOLOGACAO_ALVO })
  const [loading, setLoading]         = useState(true)
  const [modalEmitir, setModalEmitir] = useState(null)
  const [detalhe, setDetalhe]         = useState(null)
  const [cancelarNota, setCancelarNota] = useState(null)
  const [cceNota, setCceNota]         = useState(null)
  const [modalInutilizacao, setModalInutilizacao] = useState(false)
  const [modalExportacao, setModalExportacao] = useState(false)
  const [pendenciasFiscais, setPendenciasFiscais] = useState([])
  const [integridadeFiscalFinanceira, setIntegridadeFiscalFinanceira] = useState([])
  const [auditoriaPendencia, setAuditoriaPendencia] = useState(null)
  const [auditoriaIntegridadeFiscalFinanceira, setAuditoriaIntegridadeFiscalFinanceira] = useState(null)
  const [q, setQ]                     = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')

  const carregarPendenciasFiscais = useCallback(async () => {
    if (!canIntegridade) {
      setPendenciasFiscais([])
      return
    }
    try {
      const r = await api.get('/nfe/pendencias', { skipGlobalErrorToast: true })
      setPendenciasFiscais(r.data?.pendencias || [])
    } catch {
      setPendenciasFiscais([])
    }
  }, [canIntegridade])

  const carregarIntegridadeFiscalFinanceira = useCallback(async () => {
    if (!canIntegridade) {
      setIntegridadeFiscalFinanceira([])
      return
    }
    try {
      const r = await api.get('/nfe/integridade-financeira', { skipGlobalErrorToast: true })
      setIntegridadeFiscalFinanceira(r.data?.itens || [])
    } catch {
      setIntegridadeFiscalFinanceira([])
    }
  }, [canIntegridade])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get(lixeira ? '/nfe/lixeira' : '/nfe')
      setNotas(r.data?.notas || [])
      setNfeMeta(r.data?.meta || { ambiente: null, autorizadas_homologacao: 0, alvo_homologacao: HOMOLOGACAO_ALVO })
      if (lixeira) {
        setPendenciasFiscais([])
        setIntegridadeFiscalFinanceira([])
      } else {
        if (canIntegridade) {
          await carregarPendenciasFiscais()
          await carregarIntegridadeFiscalFinanceira()
        }
      }
    } catch {
      toast.error(lixeira ? 'Erro ao carregar lixeira de NF-e' : 'Erro ao carregar notas fiscais')
    } finally {
      setLoading(false)
    }
  }, [canIntegridade, carregarIntegridadeFiscalFinanceira, carregarPendenciasFiscais, lixeira])

  useEffect(() => { carregar() }, [carregar])

  const emitirNota = (nota) => {
    if (!canEmitir) return toast.error('Sem permissao para emitir NF-e')
    const ordemId = nota.ordemid || nota.id
    setModalEmitir({
      ordemInicial: {
        ...nota,
        id: ordemId,
        numero: nota.numero_os || nota.numero,
      },
    })
  }

  const moverParaLixeira = async (nota) => {
    if (!canLixeira) return toast.error('Sem permissao para mover NF-e para lixeira')
    if (nota.nfe_status !== 'rejeitado') {
      toast.error('Somente NF-e rejeitada pode ir para a lixeira')
      return
    }
    if (!window.confirm(`Mover a NF-e rejeitada da ${nota.numero} para a lixeira?`)) return
    try {
      await api.delete(`/nfe/${nota.id}`, { data: { motivo: 'Ocultada pela tela fiscal' } })
      toast.success('NF-e movida para a lixeira')
      carregar()
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Nao foi possivel mover para a lixeira')
    }
  }

  const restaurarNota = async (nota) => {
    if (!canLixeira) return toast.error('Sem permissao para restaurar NF-e')
    try {
      await api.post(`/nfe/${nota.id}/restore`)
      toast.success('NF-e restaurada')
      carregar()
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Nao foi possivel restaurar a NF-e')
    }
  }

  const baixarXmlAutorizacao = async (nota) => {
    if (!canXml) return toast.error('Sem permissao para baixar XML')
    try {
      await baixarArquivo(`/nfe/${nota.nfe_chave}/xml/autorizacao`, `${nota.nfe_chave}.xml`)
    } catch (e) {
      toast.error(e.response?.data?.erro || 'XML de autorizacao indisponivel')
    }
  }

  const filtradas = notas.filter(n => {
    const matchQ = !q.trim() ||
      n.numero?.toLowerCase().includes(q.toLowerCase()) ||
      n.clientenome?.toLowerCase().includes(q.toLowerCase()) ||
      n.nfe_numero?.toLowerCase().includes(q.toLowerCase()) ||
      n.nfe_chave?.toLowerCase().includes(q.toLowerCase())
    return matchQ && (filtroStatus === 'todos' || n.nfe_status === filtroStatus)
  })

  const totais = {
    total:      notas.length,
    autorizado: notas.filter(n => n.nfe_status === 'autorizado').length,
    rejeitado:  notas.filter(n => n.nfe_status === 'rejeitado').length,
    emitindo:   notas.filter(n => n.nfe_status === 'emitindo').length,
    cancelado:  notas.filter(n => n.nfe_status === 'cancelado').length,
  }
  const alvoHomologacao = nfeMeta.alvo_homologacao || HOMOLOGACAO_ALVO
  const autorizadasHomologacao = nfeMeta.autorizadas_homologacao ?? totais.autorizado
  const progressoHomologacao = Math.min(100, Math.round((autorizadasHomologacao / alvoHomologacao) * 100))
  const mostraHomologacao = Number(nfeMeta.ambiente) === 2

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 'var(--space-4)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 800 }}>{lixeira ? 'Lixeira de NF-e' : 'Notas Fiscais'}</h1>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', display: lixeira ? 'none' : undefined }}>
            {totais.total} nota{totais.total !== 1 ? 's' : ''} - {totais.autorizado} autorizada{totais.autorizado !== 1 ? 's' : ''}
          </p>
          {lixeira && (
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              {totais.total} registro{totais.total !== 1 ? 's' : ''} oculto{totais.total !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {lixeira ? (
            <button className="btn btn-ghost" onClick={() => navigate('/nfe')} style={{ gap: 'var(--space-2)' }}>
              <RotateCcw size={16} /> Voltar para NF-e
            </button>
          ) : (
            <>
              {canExportar && <button className="btn btn-ghost" onClick={() => setModalExportacao(true)} style={{ gap: 'var(--space-2)' }}>
                <Download size={16} /> Exportar
              </button>}
              {canLixeira && (
                <button className="btn btn-ghost" onClick={() => navigate('/nfe/lixeira')} style={{ gap: 'var(--space-2)' }}>
                  <Trash2 size={16} /> Lixeira
                </button>
              )}
              {canInutilizar && (
                <button className="btn btn-ghost" onClick={() => setModalInutilizacao(true)} style={{ gap: 'var(--space-2)' }}>
                  <FileWarning size={16} /> Inutilizar numeração
                </button>
              )}
              {canEmitir && <button className="btn btn-primary" onClick={() => setModalEmitir({})} style={{ gap: 'var(--space-2)' }}>
                <Plus size={16} /> Emitir NF-e
              </button>}
            </>
          )}
        </div>
      </div>

      {/* KPIs */}
      {!lixeira && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)', flexShrink: 0 }}>
        {[
          { label: 'Total emitidas', value: totais.total,      color: 'var(--color-text)' },
          { label: 'Autorizadas',    value: totais.autorizado, color: 'var(--color-success)' },
          { label: 'Rejeitadas',     value: totais.rejeitado,  color: 'var(--color-error)' },
          { label: 'Em andamento',   value: totais.emitindo,   color: 'var(--color-gold)' },
          { label: 'Canceladas',     value: totais.cancelado,  color: 'var(--color-text-muted)' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>}

      {mostraHomologacao && !lixeira && <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-2)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Homologacao NF-e</div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800 }}>{autorizadasHomologacao}/{alvoHomologacao} notas autorizadas em homologacao</div>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Ambiente atual: homologacao
          </div>
        </div>
        <div style={{ height: 8, borderRadius: 'var(--radius-full)', background: 'var(--color-surface-offset)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progressoHomologacao}%`, background: progressoHomologacao >= 100 ? 'var(--color-success)' : 'var(--color-primary)', transition: 'width var(--transition-interactive)' }} />
        </div>
      </div>}

      {canIntegridade && !lixeira && pendenciasFiscais.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <PendenciasFiscaisPanel pendencias={pendenciasFiscais} onRefresh={carregarPendenciasFiscais} onAudit={setAuditoriaPendencia} />
        </div>
      )}

      {canIntegridade && !lixeira && integridadeFiscalFinanceira.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <IntegridadeFiscalFinanceiraPanel itens={integridadeFiscalFinanceira} onRefresh={carregarIntegridadeFiscalFinanceira} onAudit={setAuditoriaIntegridadeFiscalFinanceira} />
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar OS, cliente, NF-e…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}
          />
        </div>
        {['todos', 'autorizado', 'rejeitado', 'emitindo', 'cancelado'].map(s => (
          <button key={s} onClick={() => setFiltroStatus(s)}
            style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', border: `1px solid ${filtroStatus === s ? 'var(--color-primary)' : 'var(--color-border)'}`, background: filtroStatus === s ? 'var(--color-primary)' : 'var(--color-surface)', color: filtroStatus === s ? '#fff' : 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', transition: 'all var(--transition-interactive)' }}
          >
            {{ todos: 'Todos', autorizado: 'Autorizadas', rejeitado: 'Rejeitadas', emitindo: 'Em andamento', cancelado: 'Canceladas' }[s]}
          </button>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={carregar} title="Atualizar" style={{ marginLeft: 'auto' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          Atualizar
        </button>
      </div>

      {/* Tabela / Lista responsiva */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 200, gap: 'var(--space-3)', color: 'var(--color-text-muted)' }}>
            <div className="spinner"/>Carregando notas fiscais…
          </div>
        ) : filtradas.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 200, gap: 'var(--space-3)', color: 'var(--color-text-muted)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ opacity: 0.35 }}>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, marginBottom: 2, fontSize: 'var(--text-sm)' }}>{notas.length === 0 ? 'Nenhuma NF-e emitida ainda' : 'Nenhum resultado'}</div>
              <div style={{ fontSize: 'var(--text-xs)' }}>{notas.length === 0 ? (lixeira ? 'Registros movidos para a lixeira aparecem aqui.' : 'Clique em "Emitir NF-e" para emitir a primeira nota.') : 'Tente ajustar os filtros.'}</div>
            </div>
          </div>
        ) : (
          <div className="table-wrap" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--color-surface-offset)' }}>
                <tr style={{ borderBottom: '1px solid var(--color-divider)', background: 'var(--color-surface-offset)' }}>
                  {['NF-e', 'Origem', 'Cliente', 'Serviço', 'Valor', 'Emitida em', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.map((n, i) => (
                  <tr key={n.id || n.nfe_chave || n.chave || `${n.origem}-${n.ordemid || n.nfe_numero || i}`}
                    style={{ borderBottom: '1px solid var(--color-divider)', background: i % 2 === 0 ? 'transparent' : 'oklch(from var(--color-surface-offset) l c h / 0.3)', transition: 'background var(--transition-interactive)' }}
                  >
                    <td style={{ padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{n.nfe_numero ? `${n.nfe_numero}/${n.nfe_serie}` : '—'}</td>
                    <td style={{ padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-primary)' }}>{n.origem === 'avulsa' ? 'Avulsa' : (n.numero || n.numero_os || '-')}</td>
                    <td style={{ padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>{n.clientenome}</td>
                    <td style={{ padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.servico}</td>
                    <td style={{ padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(n.valortotal)}</td>
                    <td style={{ padding: 'var(--space-2) var(--space-3)', fontSize: '11px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(n.nfe_emitida_em)}</td>
                    <td style={{ padding: 'var(--space-2) var(--space-3)' }}>
                      <StatusBadge status={n.nfe_status} />
                      {n.nfe_status === 'rejeitado' && n.nfe_rejeicao_motivo && (
                        <div title={n.nfe_rejeicao_motivo} style={{ marginTop: 2, fontSize: '11px', color: 'var(--color-error)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {n.nfe_rejeicao_motivo}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: 'var(--space-2) var(--space-3)' }}>
                      <div style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'nowrap' }}>
                        {lixeira && canLixeira ? (
                          <button className="btn btn-ghost btn-sm" onClick={() => restaurarNota(n)} title="Restaurar NF-e" style={{ padding: '3px 8px', fontSize: '11px' }}>
                            <RotateCcw size={13} /> Restaurar
                          </button>
                        ) : n.nfe_status === 'autorizado' && (
                          <>
                            {canCce && <button className="btn btn-ghost btn-sm" onClick={() => setCceNota(n)} title="Emitir CC-e" style={{ padding: '3px 6px', fontSize: '11px' }}>CC-e</button>}
                            {canXml && <button className="btn btn-ghost btn-sm" onClick={() => baixarXmlAutorizacao(n)} title="Baixar XML autorizado" style={{ padding: '3px 6px', fontSize: '11px' }}>XML</button>}
                            {canDanfe && <button className="btn btn-ghost btn-sm" onClick={() => baixarDanfe(n.nfe_chave)} title="Baixar DANFE em PDF" style={{ padding: '3px 6px', fontSize: '11px' }}>DANFE</button>}
                            {canCancelar && <button className="btn btn-ghost btn-sm" onClick={() => setCancelarNota(n)} title="Cancelar NF-e" style={{ padding: '3px 6px', fontSize: '11px' }}>Cancelar</button>}
                          </>
                        )}
                        {!lixeira && n.nfe_status === 'cancelado' && n.nfe_chave && (
                          <>
                            {canXml && <button className="btn btn-ghost btn-sm" onClick={() => baixarXmlAutorizacao(n)} title="Baixar XML autorizado" style={{ padding: '3px 6px', fontSize: '11px' }}>XML</button>}
                            {canDanfe && <button className="btn btn-ghost btn-sm" onClick={() => baixarDanfe(n.nfe_chave)} title="Baixar DANFE em PDF" style={{ padding: '3px 6px', fontSize: '11px' }}>DANFE</button>}
                          </>
                        )}
                        {!lixeira && canEmitir && ['rejeitado', 'rejeitada', 'cancelado', 'cancelada'].includes(n.nfe_status) && STATUS_NFE_EMISSAO.includes(n.status) && (
                          <button className="btn btn-ghost btn-sm" onClick={() => emitirNota(n)} title="Emitir novamente" style={{ padding: '3px 6px', fontSize: '11px' }}>Reemitir</button>
                        )}
                        {!lixeira && canLixeira && ['rejeitado', 'rejeitada'].includes(n.nfe_status) && (
                          <button className="btn btn-ghost btn-sm" onClick={() => moverParaLixeira(n)} title="Mover rejeicao para a lixeira" style={{ padding: '3px 6px', fontSize: '11px' }}>
                            <Trash2 size={13} />
                          </button>
                        )}
                        {!lixeira && n.nfe_status === 'emitindo' && (
                          <button className="btn btn-ghost btn-sm" onClick={carregar} title="Atualizar andamento" style={{ padding: '3px 6px', fontSize: '11px' }}>Atualizar</button>
                        )}
                        {!lixeira && n.nfe_status === 'incerto' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              const pMatch = pendenciasFiscais.find(p => p.origem === 'emissao' && p.ordemid === n.ordemid)
                              setAuditoriaPendencia(pMatch || {
                                origem: 'emissao',
                                id: n.id,
                                numero_os: n.numero,
                                cliente: n.clientenome,
                                status: 'incerto',
                                motivo: n.nfe_rejeicao_motivo,
                                numero_nfe: n.nfe_numero,
                                serie: n.nfe_serie,
                              })
                            }}
                            title="Auditar e liberar OS para reemissao"
                            style={{ padding: '3px 6px', fontSize: '11px', color: 'var(--color-gold)' }}
                          >
                            Auditar
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => setDetalhe(n)} title="Ver detalhes" style={{ padding: '3px 6px' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canEmitir && modalEmitir && <ModalEmitir ordemInicial={modalEmitir.ordemInicial} onClose={() => setModalEmitir(null)} onSuccess={carregar} />}
      {detalhe && <ModalDetalhe nfe={detalhe} onClose={() => setDetalhe(null)} canXml={canXml} canDanfe={canDanfe} onAudit={setAuditoriaPendencia} pendenciasFiscais={pendenciasFiscais} />}
      {canCancelar && cancelarNota && <ModalCancelamento nfe={cancelarNota} onClose={() => setCancelarNota(null)} onSuccess={carregar} />}
      {canCce && cceNota && <ModalCCE nfe={cceNota} onClose={() => setCceNota(null)} onSuccess={carregar} />}
      {auditoriaPendencia && <ModalAuditoriaPendenciaFiscal pendencia={auditoriaPendencia} onClose={() => setAuditoriaPendencia(null)} onLiberada={carregar} />}
      {auditoriaIntegridadeFiscalFinanceira && <ModalAuditoriaIntegridadeFiscalFinanceira apontamento={auditoriaIntegridadeFiscalFinanceira} onClose={() => setAuditoriaIntegridadeFiscalFinanceira(null)} canConciliar={canConciliar} onConciliado={() => carregarIntegridadeFiscalFinanceira()} />}
      {canExportar && modalExportacao && <ModalExportacaoNFe onClose={() => setModalExportacao(false)} />}
      {canInutilizar && <InutilizacaoModal open={modalInutilizacao} onClose={() => setModalInutilizacao(false)} onSuccess={carregar} />}
    </div>
  )
}
