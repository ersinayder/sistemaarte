import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { Calculator, CalendarDays, ClipboardList, FileText, PackagePlus, Printer, Save, Search, Send, Trash2, UserRound } from 'lucide-react'
import api from '../services/api'

const moeda = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = value => Number(String(value ?? '').replace(',', '.')) || 0
const selectInputValue = event => event.target.select()

function rows(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.clientes)) return payload.clientes
  return []
}

function mergeClientes(current, incoming) {
  const byId = new Map(current.map(c => [c.id, c]))
  for (const cliente of incoming) {
    if (!cliente?.id) continue
    byId.set(cliente.id, { ...(byId.get(cliente.id) || {}), ...cliente })
  }
  return Array.from(byId.values())
}

function hojeMaisDias(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function Campo({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      {children}
    </label>
  )
}

function ClientePicker({ value, onChange, clientes, setClientes }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value.nome || '')
  const ref = useRef(null)
  const seq = useRef(0)

  useEffect(() => setQuery(value.nome || ''), [value.nome])

  useEffect(() => {
    const h = event => { if (ref.current && !ref.current.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (!open || q.length < 2) return
    const current = ++seq.current
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/clientes?q=${encodeURIComponent(q)}`)
        if (current === seq.current) setClientes(prev => mergeClientes(prev, rows(data)))
      } catch {}
    }, 180)
    return () => clearTimeout(timer)
  }, [open, query, setClientes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clientes.slice(0, 8)
    return clientes
      .filter(c => String(c.name || c.nome || '').toLowerCase().includes(q))
      .slice(0, 10)
  }, [clientes, query])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <UserRound size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-faint)', pointerEvents: 'none' }} />
        <input
          className="form-input"
          value={query}
          onChange={event => {
            const nome = event.target.value
            setQuery(nome)
            setOpen(true)
            onChange({ id: null, nome, telefone: '', cpf: '' })
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar cliente ou digitar nome"
          autoComplete="off"
          style={{ paddingLeft: 32 }}
        />
      </div>

      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 300,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)', maxHeight: 240, overflowY: 'auto',
        }}>
          {filtered.map(cliente => (
            <button
              key={cliente.id}
              type="button"
              onMouseDown={event => {
                event.preventDefault()
                const nome = cliente.name || cliente.nome || ''
                onChange({
                  id: cliente.id,
                  nome,
                  telefone: cliente.phone || cliente.telefone || cliente.contato || '',
                  cpf: cliente.cpf || cliente.cnpj || '',
                })
                setQuery(nome)
                setOpen(false)
              }}
              style={{
                width: '100%', display: 'grid', gap: 2, textAlign: 'left', padding: '9px 12px',
                background: 'transparent', border: 'none', borderBottom: '1px solid var(--color-divider)',
                color: 'var(--color-text)', cursor: 'pointer',
              }}
            >
              <strong style={{ fontSize: 'var(--text-sm)' }}>{cliente.name || cliente.nome}</strong>
              {(cliente.phone || cliente.telefone || cliente.cpf) && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  {[cliente.phone || cliente.telefone, cliente.cpf].filter(Boolean).join(' - ')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ProdutoPicker({ produtos, onAdd }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const h = event => { if (ref.current && !ref.current.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const sugestoes = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return produtos.slice(0, 8)
    return produtos.filter(produto => String(produto.nome || '').toLowerCase().includes(q)).slice(0, 8)
  }, [produtos, query])

  const addAvulso = () => {
    const nome = query.trim()
    if (!nome) return
    onAdd({ produto_id: null, nome, detalhes: '', quantidade: 1, preco_unitario: 0, avulso: true })
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-faint)', pointerEvents: 'none' }} />
          <input
            className="form-input"
            value={query}
            onChange={event => { setQuery(event.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                if (sugestoes.length === 1) {
                  const p = sugestoes[0]
                  onAdd({ produto_id: p.id, nome: p.nome, detalhes: '', quantidade: 1, preco_unitario: p.preco || 0, avulso: false })
                  setQuery('')
                  setOpen(false)
                } else {
                  addAvulso()
                }
              }
            }}
            placeholder="Produto cadastrado ou item avulso"
            style={{ paddingLeft: 32 }}
          />
        </div>
        <button type="button" className="btn btn-secondary" onClick={addAvulso}>
          <PackagePlus size={15} />
          Avulso
        </button>
      </div>

      {open && (sugestoes.length > 0 || query.trim()) && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 250,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)', maxHeight: 250, overflowY: 'auto',
        }}>
          {sugestoes.map(produto => (
            <button
              type="button"
              key={produto.id}
              onMouseDown={event => {
                event.preventDefault()
                onAdd({ produto_id: produto.id, nome: produto.nome, detalhes: '', quantidade: 1, preco_unitario: produto.preco || 0, avulso: false })
                setQuery('')
                setOpen(false)
              }}
              style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center',
                padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--color-divider)',
                background: 'transparent', color: 'var(--color-text)', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <strong style={{ fontSize: 'var(--text-sm)' }}>{produto.nome}</strong>
              <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontVariantNumeric: 'tabular-nums' }}>{moeda(produto.preco)}</span>
            </button>
          ))}
          {query.trim() && (
            <button
              type="button"
              onMouseDown={event => { event.preventDefault(); addAvulso() }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                background: 'transparent', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <PackagePlus size={15} />
              Adicionar "{query.trim()}" como item avulso
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ItensPropostaEditor({ itens, onChange, produtos, onAdd, total }) {
  const update = (index, field, value) => onChange(itens.map((item, i) => i === index ? { ...item, [field]: value } : item))
  const remove = index => onChange(itens.filter((_, i) => i !== index))

  return (
    <section className="card card-pad" style={{ display: 'grid', gap: 'var(--space-4)', padding: 'var(--space-4)', minWidth: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'start', gap: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--text-base)' }}>Itens da proposta</h2>
          <p style={{ margin: '2px 0 0', color: 'var(--color-text-faint)', fontSize: 'var(--text-xs)' }}>Produtos cadastrados ou servicos personalizados.</p>
        </div>
        <div style={{ textAlign: 'right', minWidth: 156 }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-faint)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{moeda(total)}</div>
          <div style={{ marginTop: 4, color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 800 }}>{itens.length} item{itens.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      <ProdutoPicker produtos={produtos} onAdd={onAdd} />

      {!itens.length ? (
        <div style={{
          border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-5)',
          color: 'var(--color-text-faint)', fontSize: 'var(--text-sm)', textAlign: 'center',
        }}>
          Adicione trofeus personalizados, restauracoes, molduras, impressao, instalacao ou qualquer servico avulso.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          {itens.map((item, index) => {
            const subtotal = numero(item.quantidade || 1) * numero(item.preco_unitario)
            return (
              <div key={item.localId || index} style={{
                display: 'grid', gap: 8, padding: 'var(--space-3)',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                background: 'var(--color-surface-offset)',
              }}>
                <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                  <input
                    className="form-input"
                    value={item.nome}
                    onChange={event => update(index, 'nome', event.target.value)}
                    placeholder="Descricao do item ou servico"
                    style={{ height: 34, fontWeight: 800 }}
                  />
                  <textarea
                    className="form-input"
                    value={item.detalhes || ''}
                    onChange={event => update(index, 'detalhes', event.target.value)}
                    placeholder="Detalhes tecnicos, materiais, medidas, personalizacao..."
                    rows={2}
                    style={{ resize: 'vertical', minHeight: 52, fontSize: 'var(--text-xs)' }}
                  />
                  <span style={{ fontSize: 10, color: item.avulso ? 'var(--color-warning)' : 'var(--color-text-faint)', fontWeight: 800 }}>
                    {item.avulso ? 'Item avulso' : 'Produto cadastrado'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '86px 120px minmax(110px, 1fr) 34px', gap: 8, alignItems: 'end' }}>
                  <Campo label="Qtd.">
                    <input className="form-input" type="number" min="0.01" step="0.01" value={item.quantidade}
                      onFocus={selectInputValue}
                      onChange={event => update(index, 'quantidade', event.target.value)}
                      style={{ height: 34, textAlign: 'center', fontWeight: 800 }} />
                  </Campo>
                  <Campo label="Unitario">
                    <input className="form-input" type="number" min="0" step="0.01" value={item.preco_unitario}
                      onFocus={selectInputValue}
                      onChange={event => update(index, 'preco_unitario', event.target.value)}
                      style={{ height: 34, textAlign: 'right', fontWeight: 800 }} />
                  </Campo>
                  <Campo label="Subtotal">
                    <div style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontWeight: 900, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {moeda(subtotal)}
                    </div>
                  </Campo>
                  <button type="button" className="btn btn-icon btn-ghost" onClick={() => remove(index)} title="Remover item" style={{ width: 32, height: 32, color: 'var(--color-error)' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default function NovaProposta() {
  const navigate = useNavigate()
  const [clientes, setClientes] = useState([])
  const [produtos, setProdutos] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveMode, setSaveMode] = useState(null)
  const [cliente, setCliente] = useState({ id: null, nome: '', telefone: '', cpf: '' })
  const [form, setForm] = useState({
    titulo: '',
    prazoentrega: '',
    validade: hojeMaisDias(7),
    condicoes: 'Valores sujeitos a confirmacao de medidas, materiais e disponibilidade. Producao inicia apos aprovacao da proposta.',
    observacoes: '',
  })
  const [itens, setItens] = useState([])

  useEffect(() => {
    api.get('/clientes').then(r => setClientes(rows(r.data))).catch(() => {})
    api.get('/produtos').then(r => setProdutos(rows(r.data))).catch(() => {})
  }, [])

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }))

  const addItem = useCallback(item => {
    setItens(current => [
      ...current,
      {
        localId: `${Date.now()}-${Math.random()}`,
        produto_id: item.produto_id || null,
        nome: item.nome || item.name || '',
        detalhes: item.detalhes || item.sub || '',
        quantidade: item.quantidade || 1,
        preco_unitario: item.preco_unitario ?? item.preco ?? item.price ?? 0,
        avulso: item.avulso !== false,
      },
    ])
  }, [])

  const total = useMemo(
    () => itens.reduce((acc, item) => acc + numero(item.quantidade || 1) * numero(item.preco_unitario), 0),
    [itens]
  )

  const itensPayload = useMemo(() => itens.map(item => {
    const nome = String(item.nome || '').trim()
    const detalhes = String(item.detalhes || '').trim()
    return {
      produto_id: item.produto_id || null,
      nome: detalhes ? `${nome} - ${detalhes}` : nome,
      quantidade: numero(item.quantidade || 1),
      preco_unitario: Number(numero(item.preco_unitario).toFixed(2)),
      avulso: item.avulso !== false,
    }
  }), [itens])

  const observacoesPayload = useMemo(() => [
    form.validade ? `Validade da proposta: ${form.validade.split('-').reverse().join('/')}.` : '',
    form.condicoes.trim() ? `Condicoes comerciais: ${form.condicoes.trim()}` : '',
    form.observacoes.trim(),
  ].filter(Boolean).join('\n\n'), [form.validade, form.condicoes, form.observacoes])

  const salvar = async mode => {
    if (!cliente.nome.trim()) return toast.error('Informe o cliente da proposta.')
    if (!itensPayload.length) return toast.error('Adicione ao menos um item.')
    if (itensPayload.some(item => !item.nome.trim())) return toast.error('Todos os itens precisam de descricao.')
    if (itensPayload.some(item => !(item.quantidade > 0))) return toast.error('Quantidade dos itens precisa ser maior que zero.')
    if (itensPayload.some(item => item.preco_unitario < 0)) return toast.error('Valor dos itens nao pode ser negativo.')
    if (!(total > 0)) return toast.error('Informe valores para a proposta.')

    setSaving(true)
    setSaveMode(mode)
    try {
      const { data } = await api.post('/propostas', {
        cliente_id: cliente.id || null,
        clientenome: cliente.nome.trim(),
        clientetelefone: cliente.telefone || null,
        clientecpf: cliente.cpf || null,
        status: mode === 'send' ? 'Orcamento enviado' : 'Novo lead',
        origem: 'proposta',
        descricao: form.titulo.trim() || itensPayload[0]?.nome || 'Proposta personalizada',
        valortotal: Number(total.toFixed(2)),
        prazoentrega: form.prazoentrega || null,
        observacoes: observacoesPayload || null,
        produtos: itensPayload,
      })

      toast.success(mode === 'print' ? 'Proposta salva. Abrindo PDF...' : 'Proposta salva.')
      if (mode === 'print') window.open(`/api/propostas/${data.id}/pdf`, '_blank', 'noopener,noreferrer')
      navigate('/propostas')
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erro ao salvar proposta')
    } finally {
      setSaving(false)
      setSaveMode(null)
    }
  }

  return (
    <div className="page-content" style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div className="page-header" style={{ alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <div>
          <div className="page-title">Nova proposta</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)', marginTop: 2 }}>
            Monte uma proposta formal com itens avulsos, produtos, prazo e condicoes comerciais.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/orcamento/calculadora')}>
            <Calculator size={14} />
            Calculadora
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/propostas')}>
            Ver funil
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 'var(--space-4)', alignItems: 'start' }}>
        <section className="card card-pad" style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={17} color="var(--color-primary)" />
            <h2 style={{ margin: 0, fontSize: 'var(--text-base)' }}>Dados comerciais</h2>
          </div>

          <Campo label="Cliente">
            <ClientePicker value={cliente} onChange={setCliente} clientes={clientes} setClientes={setClientes} />
          </Campo>

          <Campo label="Titulo da proposta">
            <input className="form-input" value={form.titulo} onChange={event => set('titulo', event.target.value)} placeholder="Ex: Trofeus personalizados para evento" />
          </Campo>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Campo label="Prazo de producao">
              <input className="form-input" value={form.prazoentrega} onChange={event => set('prazoentrega', event.target.value)} placeholder="Ex: 10 dias uteis, 7 dias ou 15/06/2026" />
            </Campo>
            <Campo label="Validade">
              <input className="form-input" type="date" value={form.validade} onChange={event => set('validade', event.target.value)} />
            </Campo>
          </div>

          <Campo label="Condicoes comerciais">
            <textarea className="form-input" rows={4} value={form.condicoes} onChange={event => set('condicoes', event.target.value)} />
          </Campo>

          <Campo label="Observacoes para o cliente">
            <textarea className="form-input" rows={3} value={form.observacoes} onChange={event => set('observacoes', event.target.value)} placeholder="Detalhes adicionais que devem aparecer na proposta formal" />
          </Campo>
        </section>

        <div style={{ display: 'grid', gap: 'var(--space-4)', minWidth: 0 }}>
          <ItensPropostaEditor itens={itens} onChange={setItens} produtos={produtos} onAdd={addItem} total={total} />
          <section className="card card-pad" style={{ padding: 'var(--space-4)', display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 'var(--space-3)', alignItems: 'center' }}>
            <ClipboardList size={18} color="var(--color-primary)" />
            <div>
              <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)' }}>Resumo operacional</div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
                {itens.length} item{itens.length === 1 ? '' : 's'} - {itens.reduce((acc, item) => acc + numero(item.quantidade || 1), 0).toLocaleString('pt-BR')} unidades
              </div>
            </div>
            <strong style={{ fontSize: 'var(--text-lg)', color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' }}>{moeda(total)}</strong>
          </section>
        </div>
      </div>

      <div style={{
        position: 'sticky', bottom: 0, zIndex: 50,
        background: 'var(--color-surface)', borderTop: '1px solid var(--color-divider)',
        margin: '0 calc(-1 * var(--space-6)) calc(-1 * var(--space-5))',
        padding: '10px var(--space-5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <CalendarDays size={17} color="var(--color-text-muted)" />
          <div>
            <div style={{ fontSize: 10, color: 'var(--color-text-faint)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Proposta formal</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {cliente.nome || 'Sem cliente'} - {itens.length} item{itens.length === 1 ? '' : 's'} - {moeda(total)}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={() => salvar('draft')} disabled={saving}>
            <Save size={15} />
            {saving && saveMode === 'draft' ? 'Salvando...' : 'Salvar'}
          </button>
          <button className="btn btn-secondary" onClick={() => salvar('print')} disabled={saving}>
            <Printer size={15} />
            {saving && saveMode === 'print' ? 'Salvando...' : 'Salvar e imprimir'}
          </button>
          <button className="btn btn-primary" onClick={() => salvar('send')} disabled={saving}>
            <Send size={15} />
            {saving && saveMode === 'send' ? 'Salvando...' : 'Salvar como enviada'}
          </button>
        </div>
      </div>
    </div>
  )
}
