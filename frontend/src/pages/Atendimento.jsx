import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { toast } from 'react-hot-toast'
import {
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Package,
  Plus,
  Search,
  UserPlus,
  X,
} from 'lucide-react'
import api from '../services/api'
import { emit } from '../services/eventBus'

const PAGAMENTOS = ['Pix', 'Dinheiro', 'Cartão de Débito', 'Cartão de Crédito', 'Transferência', 'Outros']
const SERVICOS = ['Quadro', 'Caixas', 'Corte a Laser', 'Sublimacao', 'Diversos']
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

const onlyDigits = v => String(v || '').replace(/\D/g, '')
const maskCPF  = v => onlyDigits(v)
  .replace(/(\d{3})(\d)/,'$1.$2')
  .replace(/(\d{3})(\d)/,'$1.$2')
  .replace(/(\d{3})(\d{1,2})$/,'$1-$2')
  .slice(0,14)
const maskCNPJ = v => onlyDigits(v)
  .replace(/(\d{2})(\d)/,'$1.$2')
  .replace(/(\d{3})(\d)/,'$1.$2')
  .replace(/(\d{3})(\d)/,'$1/$2')
  .replace(/(\d{4})(\d{1,2})$/,'$1-$2')
  .slice(0,18)

const validaCPF = cpf => {
  const n = onlyDigits(cpf)
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false
  let s = 0
  for (let i = 0; i < 9; i++) s += parseInt(n[i]) * (10 - i)
  let r = (s * 10) % 11
  if (r === 10 || r === 11) r = 0
  if (r !== parseInt(n[9])) return false
  s = 0
  for (let i = 0; i < 10; i++) s += parseInt(n[i]) * (11 - i)
  r = (s * 10) % 11
  if (r === 10 || r === 11) r = 0
  return r === parseInt(n[10])
}

const validaCNPJ = cnpj => {
  const n = onlyDigits(cnpj)
  if (n.length !== 14 || /^(\d)\1{13}$/.test(n)) return false
  const calc = s => {
    let sum = 0
    let pos = s - 7
    for (let i = s; i >= 1; i--) {
      sum += parseInt(n[s - i]) * pos--
      if (pos < 2) pos = 9
    }
    return sum % 11 < 2 ? 0 : 11 - (sum % 11)
  }
  return calc(12) === parseInt(n[12]) && calc(13) === parseInt(n[13])
}

function documentoTipo(documento, ie = '') {
  const digits = onlyDigits(documento)
  if (digits.length > 11 || (!digits && ie)) return 'PJ'
  return 'PF'
}

function clienteFiscalCompleto(cliente) {
  if (!cliente) return false
  return Boolean(
    cliente.name &&
    onlyDigits(cliente.cpf).length >= 11 &&
    cliente.cep &&
    cliente.logradouro &&
    cliente.numero &&
    cliente.bairro &&
    cliente.cidade &&
    cliente.uf
  )
}

function blankClienteFiscal(nome = '') {
  return {
    tipo: 'PF',
    nome,
    cpf: '',
    cnpj: '',
    ie: '',
    contato: '',
    email: '',
    cep: '',
    logradouro: '',
    numero: '',
    bairro: '',
    cidade: '',
    uf: '',
    obs: '',
  }
}

function clienteParaFiscalForm(cliente, fallbackName = '') {
  if (!cliente) return blankClienteFiscal(fallbackName)
  const tipo = documentoTipo(cliente.cpf, cliente.ie)
  const documento = tipo === 'PJ' ? maskCNPJ(cliente.cpf || '') : maskCPF(cliente.cpf || '')
  return {
    tipo,
    nome: cliente.name || fallbackName,
    cpf: tipo === 'PF' ? documento : '',
    cnpj: tipo === 'PJ' ? documento : '',
    ie: cliente.ie || '',
    contato: cliente.phone || '',
    email: cliente.email || '',
    cep: cliente.cep || '',
    logradouro: cliente.logradouro || '',
    numero: cliente.numero || '',
    bairro: cliente.bairro || '',
    cidade: cliente.cidade || '',
    uf: cliente.uf || '',
    obs: cliente.notes || '',
  }
}

function hoje() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function moeda(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function numero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const text = String(v || '').trim()
  const clean = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text
  const n = Number(clean)
  return Number.isFinite(n) ? n : 0
}

function rows(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.ordens)) return payload.ordens
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

function formInicialOS() {
  return {
    clienteid: '',
    clientenome: '',
    clientetelefone: '',
    clientecpf: '',
    servico: 'Quadro',
    prioridade: 'Normal',
    prazoentrega: '',
    observacoes: '',
    valortotal: '',
    valorentrada: '',
    pagamento: 'Pix',
    produtos: [],
  }
}

function totalItens(itens) {
  return itens.reduce((total, item) => total + numero(item.quantidade || 1) * numero(item.preco_unitario), 0)
}

function saldoOS(os) {
  return Number(os?.saldoaberto ?? os?.saldo ?? 0)
}

function MiniIconButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="btn btn-secondary atendimento-mode-button"
      style={{
        height: 34,
        padding: '0 10px',
        gap: 7,
        fontSize: 'var(--text-xs)',
        fontWeight: 800,
        borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
        background: active ? 'color-mix(in oklab, var(--color-primary) 16%, var(--color-surface))' : 'var(--color-surface-offset)',
        color: active ? 'var(--color-primary)' : 'var(--color-text)',
      }}
    >
      <Icon size={15} strokeWidth={2.4} />
      <span>{label}</span>
    </button>
  )
}

function Kpi({ icon: Icon, label, value, color }) {
  return (
    <div className="card" style={{
      padding: 'var(--space-3) var(--space-4)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      minHeight: 62,
    }}>
      <div style={{
        width: 34,
        height: 34,
        borderRadius: 'var(--radius-md)',
        background: `color-mix(in oklab, ${color} 18%, var(--color-surface-offset))`,
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={17} strokeWidth={2.3} />
      </div>
      <div>
        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 900, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      </div>
    </div>
  )
}

function ItemPicker({ produtos, onAdd, placeholder }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const sugestoes = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? produtos.filter(p => String(p.nome || '').toLowerCase().includes(q))
      : produtos.slice(0, 8)
    return list.slice(0, 10)
  }, [produtos, query])

  const addProduto = p => {
    onAdd({
      produto_id: p.id,
      nome: p.nome,
      quantidade: 1,
      preco_unitario: Number(p.preco || 0),
      avulso: false,
    })
    setQuery('')
    setOpen(false)
  }

  const addAvulso = () => {
    const nome = query.trim()
    if (!nome) return
    onAdd({ produto_id: null, nome, quantidade: 1, preco_unitario: 0, avulso: true })
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <input
          className="form-input"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          style={{ height: 38, fontSize: 'var(--text-sm)' }}
        />
        <button type="button" className="btn btn-secondary" onClick={addAvulso} disabled={!query.trim()} style={{ height: 38, whiteSpace: 'nowrap' }}>
          Avulso
        </button>
      </div>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 5px)',
          left: 0,
          right: 0,
          zIndex: 40,
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          maxHeight: 260,
          overflowY: 'auto',
        }}>
          {sugestoes.length === 0 ? (
            <div style={{ padding: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Nenhum produto encontrado
            </div>
          ) : sugestoes.map(p => (
            <button
              type="button"
              key={p.id}
              onClick={() => addProduto(p)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
                padding: 'var(--space-2) var(--space-3)',
                border: 'none',
                borderBottom: '1px solid var(--color-divider)',
                background: 'transparent',
                color: 'var(--color-text)',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>{p.nome}</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{moeda(p.preco)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ItensEditor({ itens, onChange, emptyText }) {
  const update = (index, field, value) => {
    const next = itens.map((item, i) => i === index ? { ...item, [field]: value } : item)
    onChange(next)
  }
  const remove = index => onChange(itens.filter((_, i) => i !== index))

  if (!itens.length) {
    return (
      <div style={{
        border: '1px dashed var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        color: 'var(--color-text-faint)',
        fontSize: 'var(--text-sm)',
        textAlign: 'center',
      }}>
        {emptyText}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      {itens.map((item, index) => (
        <div key={`${item.nome}-${index}`} className="atendimento-item-row">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nome}</div>
            <div style={{ fontSize: 10, color: item.avulso ? 'var(--color-warning)' : 'var(--color-text-faint)', fontWeight: 700 }}>
              {item.avulso ? 'Avulso' : 'Produto'}
            </div>
          </div>
          <input className="form-input" type="number" min="1" step="1" value={item.quantidade}
            onChange={e => update(index, 'quantidade', e.target.value)}
            style={{ height: 34, textAlign: 'center', fontWeight: 800 }} />
          <input className="form-input" type="number" min="0" step="0.01" value={item.preco_unitario}
            onChange={e => update(index, 'preco_unitario', e.target.value)}
            style={{ height: 34, textAlign: 'right', fontWeight: 800 }} />
          <div style={{ textAlign: 'right', fontWeight: 900, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {moeda(numero(item.quantidade || 1) * numero(item.preco_unitario))}
          </div>
          <button type="button" className="btn btn-icon btn-ghost" onClick={() => remove(index)} title="Remover item" style={{ width: 30, height: 30, color: 'var(--color-error)' }}>
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}

function Campo({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      {children}
    </label>
  )
}

function QuickClientModal({ open, cliente, initialName, onClose, onSaved }) {
  const [form, setForm] = useState(blankClienteFiscal(initialName))
  const [saving, setSaving] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [cnpjLoading, setCnpjLoading] = useState(false)
  const [cpfError, setCpfError] = useState('')
  const [cnpjError, setCnpjError] = useState('')
  const overlayDownRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setForm(clienteParaFiscalForm(cliente, initialName))
    setCpfError('')
    setCnpjError('')
  }, [open, cliente, initialName])

  if (!open) return null

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))

  const buscarCNPJ = async raw => {
    const n = onlyDigits(raw)
    if (n.length !== 14) return
    if (!validaCNPJ(n)) {
      setCnpjError('CNPJ inválido')
      return
    }
    setCnpjError('')
    setCnpjLoading(true)
    try {
      const { data: d } = await api.get(`/clientes/cnpj/${n}`)
      setForm(f => ({
        ...f,
        nome: f.nome.trim() ? f.nome : (d.razao_social || d.nome_fantasia || f.nome),
        email: f.email.trim() ? f.email : (d.email?.toLowerCase() || f.email),
        contato: f.contato.trim() ? f.contato : (d.ddd_telefone_1 ? d.ddd_telefone_1.replace(/[^\d]/g,'').replace(/(\d{2})(\d+)/,'($1) $2') : f.contato),
        cep: f.cep.trim() ? f.cep : (d.cep?.replace(/\D/g,'').replace(/(\d{5})(\d{3})/,'$1-$2') || f.cep),
        logradouro: f.logradouro.trim() ? f.logradouro : (d.logradouro || f.logradouro),
        numero: f.numero.trim() ? f.numero : (d.numero || f.numero),
        bairro: f.bairro.trim() ? f.bairro : (d.bairro || f.bairro),
        cidade: f.cidade.trim() ? f.cidade : (d.municipio || f.cidade),
        uf: f.uf.trim() ? f.uf : (d.uf || f.uf),
      }))
      toast.success('Dados do CNPJ carregados')
    } catch {
      setCnpjError('CNPJ não encontrado')
    } finally {
      setCnpjLoading(false)
    }
  }

  const buscarCep = async raw => {
    const cep = onlyDigits(raw)
    if (cep.length !== 8) return
    setCepLoading(true)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const d = await r.json()
      if (!d.erro) {
        setForm(f => ({
          ...f,
          logradouro: f.logradouro.trim() ? f.logradouro : (d.logradouro || ''),
          bairro: f.bairro.trim() ? f.bairro : (d.bairro || ''),
          cidade: f.cidade.trim() ? f.cidade : (d.localidade || ''),
          uf: f.uf.trim() ? f.uf : (d.uf || ''),
        }))
      }
    } catch {}
    finally {
      setCepLoading(false)
    }
  }

  const handleDocumento = value => {
    const digits = onlyDigits(value).slice(0, 14)
    const tipo = digits.length > 11 ? 'PJ' : form.tipo
    const nextTipo = tipo === 'PJ' ? 'PJ' : 'PF'
    const masked = nextTipo === 'PJ' ? maskCNPJ(digits) : maskCPF(digits)

    setForm(f => ({
      ...f,
      tipo: nextTipo,
      cpf: nextTipo === 'PF' ? masked : '',
      cnpj: nextTipo === 'PJ' ? masked : '',
      ie: nextTipo === 'PF' ? '' : f.ie,
    }))

    setCpfError('')
    setCnpjError('')
    if (nextTipo === 'PF' && digits.length === 11) setCpfError(validaCPF(digits) ? '' : 'CPF inválido')
    if (nextTipo === 'PJ' && digits.length === 14) buscarCNPJ(masked)
  }

  const changeTipo = tipo => {
    setForm(f => ({ ...f, tipo, cpf: '', cnpj: '', ie: tipo === 'PF' ? '' : f.ie }))
    setCpfError('')
    setCnpjError('')
  }

  const handleSave = async () => {
    const documento = form.tipo === 'PJ' ? form.cnpj : form.cpf
    const documentoDigits = onlyDigits(documento)
    if (!form.nome.trim()) return toast.error('Nome é obrigatório.')
    if (documentoDigits) {
      if (form.tipo === 'PF' && (documentoDigits.length !== 11 || !validaCPF(documento))) return toast.error('CPF inválido')
      if (form.tipo === 'PJ' && (documentoDigits.length !== 14 || !validaCNPJ(documento))) return toast.error('CNPJ inválido')
    }

    const payload = {
      name: form.nome.trim(),
      phone: form.contato.trim(),
      email: form.email.trim(),
      cpf: documentoDigits ? documento : '',
      ie: form.ie.trim(),
      logradouro: form.logradouro.trim(),
      numero: form.numero.trim(),
      bairro: form.bairro.trim(),
      cidade: form.cidade.trim(),
      uf: form.uf.trim(),
      cep: form.cep.trim(),
      notes: form.obs.trim(),
    }

    setSaving(true)
    try {
      const { data } = cliente?.id
        ? await api.put(`/clientes/${cliente.id}`, payload)
        : await api.post('/clientes', payload)
      onSaved({
        ...payload,
        id: cliente?.id || data.id,
        name: payload.name,
      })
      toast.success(cliente?.id ? 'Cliente atualizado' : 'Cliente cadastrado')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar cliente')
    } finally {
      setSaving(false)
    }
  }

  return ReactDOM.createPortal(
    <div
      className="modal-overlay"
      onMouseDown={e => { overlayDownRef.current = e.target === e.currentTarget }}
      onClick={e => {
        if (overlayDownRef.current && e.target === e.currentTarget) onClose()
        overlayDownRef.current = false
      }}>
      <div className="modal" style={{ maxWidth: 660 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{cliente?.id ? 'Dados fiscais do cliente' : 'Cadastrar cliente'}</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-lg)', padding: 3, gap: 3 }}>
            {['PF', 'PJ'].map(tipo => (
              <button
                key={tipo}
                type="button"
                onClick={() => changeTipo(tipo)}
                style={{
                  flex: 1,
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-2) var(--space-3)',
                  background: form.tipo === tipo ? 'var(--color-primary)' : 'transparent',
                  color: form.tipo === tipo ? '#fff' : 'var(--color-text-muted)',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {tipo === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
              </button>
            ))}
          </div>

          <div className="atendimento-grid-2">
            <Campo label={form.tipo === 'PJ' ? 'CNPJ' : 'CPF'}>
              <input
                className="form-input"
                style={(cpfError || cnpjError) ? { borderColor: 'var(--color-error)' } : {}}
                value={form.tipo === 'PJ' ? form.cnpj : form.cpf}
                onChange={e => handleDocumento(e.target.value)}
                placeholder={form.tipo === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                inputMode="numeric"
              />
              {(cpfError || cnpjError) && <span className="form-error">{cpfError || cnpjError}</span>}
            </Campo>
            {form.tipo === 'PJ' ? (
              <Campo label="Inscrição Estadual">
                <input className="form-input" value={form.ie} onChange={e => set('ie', e.target.value)} placeholder="Opcional" />
              </Campo>
            ) : (
              <Campo label="Telefone / WhatsApp">
                <input className="form-input" value={form.contato} onChange={e => set('contato', e.target.value)} placeholder="(31) 99999-9999" />
              </Campo>
            )}
          </div>

          <Campo label="Nome / Razão social">
            <input className="form-input" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder={form.tipo === 'PJ' ? 'Razão social ou nome fantasia' : 'Nome completo'} />
          </Campo>

          <div className="atendimento-grid-2">
            {form.tipo === 'PJ' && (
              <Campo label="Telefone / WhatsApp">
                <input className="form-input" value={form.contato} onChange={e => set('contato', e.target.value)} placeholder="(31) 99999-9999" />
              </Campo>
            )}
            <Campo label="E-mail">
              <input className="form-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
            </Campo>
          </div>

          <div className="atendimento-grid-3">
            <Campo label="CEP">
              <input className="form-input" value={form.cep} onChange={e => { set('cep', e.target.value); buscarCep(e.target.value) }} placeholder="00000-000" inputMode="numeric" />
              {cepLoading && <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>buscando CEP...</span>}
            </Campo>
            <Campo label="Número">
              <input className="form-input" value={form.numero} onChange={e => set('numero', e.target.value)} placeholder="123 ou S/N" />
            </Campo>
            <Campo label="UF">
              <select className="form-input" value={form.uf} onChange={e => set('uf', e.target.value)}>
                <option value="" />
                {UFS.map(uf => <option key={uf}>{uf}</option>)}
              </select>
            </Campo>
          </div>

          <Campo label="Logradouro">
            <input className="form-input" value={form.logradouro} onChange={e => set('logradouro', e.target.value)} placeholder="Rua, avenida, travessa..." />
          </Campo>

          <div className="atendimento-grid-2">
            <Campo label="Bairro">
              <input className="form-input" value={form.bairro} onChange={e => set('bairro', e.target.value)} placeholder="Bairro" />
            </Campo>
            <Campo label="Cidade">
              <input className="form-input" value={form.cidade} onChange={e => set('cidade', e.target.value)} placeholder="Cidade" />
            </Campo>
          </div>

          <Campo label="Observações">
            <textarea className="form-input" rows={2} value={form.obs} onChange={e => set('obs', e.target.value)} placeholder="Referências, preferências ou observações do cliente..." />
          </Campo>

          {cnpjLoading && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Buscando dados do CNPJ...</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar e usar na OS'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function Atendimento() {
  const [mode, setMode] = useState('home')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clientes, setClientes] = useState([])
  const [produtos, setProdutos] = useState([])
  const [ordens, setOrdens] = useState([])
  const [caixaHoje, setCaixaHoje] = useState([])

  const [osForm, setOsForm] = useState(formInicialOS)
  const [clienteQuery, setClienteQuery] = useState('')
  const [clienteOpen, setClienteOpen] = useState(false)
  const [clienteSelecionado, setClienteSelecionado] = useState(null)
  const [clientModalOpen, setClientModalOpen] = useState(false)
  const [clientModalCliente, setClientModalCliente] = useState(null)
  const clienteRef = useRef(null)
  const clienteSearchSeq = useRef(0)

  const [receiveQuery, setReceiveQuery] = useState('')
  const [receiveResults, setReceiveResults] = useState([])
  const [selectedOs, setSelectedOs] = useState(null)
  const [paymentForm, setPaymentForm] = useState({ valor: '', pagamento: 'Pix' })
  const [deliveryPrompt, setDeliveryPrompt] = useState(null)

  const [saleItems, setSaleItems] = useState([])
  const [salePayment, setSalePayment] = useState('Pix')

  const loadBase = useCallback(async () => {
    setLoading(true)
    try {
      const [clientesResp, produtosResp, ordensResp, caixaResp] = await Promise.all([
        api.get('/clientes?limit=100'),
        api.get('/produtos'),
        api.get('/ordens?page=1&limit=80'),
        api.get(`/caixa?data=${hoje()}`),
      ])
      const nextClientes = rows(clientesResp.data)
      const nextProdutos = rows(produtosResp.data)
      const nextOrdens = rows(ordensResp.data)
      setClientes(nextClientes)
      setProdutos(nextProdutos)
      setOrdens(nextOrdens)
      setCaixaHoje(rows(caixaResp.data))
      setReceiveResults(nextOrdens.filter(o => saldoOS(o) > 0.009 && !['Entregue', 'Cancelado'].includes(o.status)).slice(0, 8))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadBase() }, [loadBase])

  useEffect(() => {
    const onDown = e => { if (clienteRef.current && !clienteRef.current.contains(e.target)) setClienteOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => {
    const q = clienteQuery.trim()
    if (!clienteOpen || q.length < 2) return
    const seq = ++clienteSearchSeq.current
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/clientes?q=${encodeURIComponent(q)}`)
        if (seq === clienteSearchSeq.current) {
          setClientes(prev => mergeClientes(prev, rows(data)))
        }
      } catch {}
    }, 180)
    return () => clearTimeout(timer)
  }, [clienteOpen, clienteQuery])

  const resumo = useMemo(() => {
    const ativas = ordens.filter(o => !['Entregue', 'Cancelado'].includes(o.status))
    const vencidas = ativas.filter(o => o.prazoentrega && o.prazoentrega.slice(0, 10) < hoje() && o.status !== 'Pronto')
    const prontas = ordens.filter(o => o.status === 'Pronto')
    const recebido = caixaHoje.filter(l => l.tipo === 'Entrada').reduce((s, l) => s + Number(l.valor || 0), 0)
    return { ativas: ativas.length, vencidas: vencidas.length, prontas: prontas.length, recebido }
  }, [ordens, caixaHoje])

  const modos = [
    { key: 'new-os', label: 'Nova OS', icon: Plus },
    { key: 'receive', label: 'Receber OS', icon: DollarSign },
    { key: 'sale', label: 'Venda avulsa', icon: Package },
  ]

  const clientesFiltrados = useMemo(() => {
    const q = clienteQuery.trim().toLowerCase()
    if (!q) return clientes.slice(0, 7)
    return clientes.filter(c =>
      String(c.name || '').toLowerCase().includes(q) ||
      String(c.phone || '').includes(q) ||
      String(c.cpf || '').includes(q)
    ).slice(0, 7)
  }, [clientes, clienteQuery])

  const clienteExiste = useMemo(() => {
    const nome = osForm.clientenome.trim().toLowerCase()
    return nome && clientes.some(c => String(c.name || '').trim().toLowerCase() === nome)
  }, [clientes, osForm.clientenome])

  const setOsItems = next => {
    setOsForm(f => ({ ...f, produtos: next, valortotal: next.length ? totalItens(next).toFixed(2) : f.valortotal }))
  }

  const selectCliente = c => {
    setClienteSelecionado(c)
    setClienteQuery(c.name || '')
    setOsForm(f => ({
      ...f,
      clienteid: c.id || '',
      clientenome: c.name || '',
      clientetelefone: c.phone || '',
      clientecpf: c.cpf || '',
    }))
    setClienteOpen(false)
  }

  const openClientModal = (cliente = null) => {
    setClientModalCliente(cliente)
    setClientModalOpen(true)
    setClienteOpen(false)
  }

  const handleClientSaved = cliente => {
    setClientes(prev => {
      const exists = prev.some(c => c.id === cliente.id)
      return exists ? prev.map(c => c.id === cliente.id ? { ...c, ...cliente } : c) : [cliente, ...prev]
    })
    setClienteSelecionado(cliente)
    setClienteQuery(cliente.name || '')
    setOsForm(f => ({
      ...f,
      clienteid: cliente.id || '',
      clientenome: cliente.name || '',
      clientetelefone: cliente.phone || '',
      clientecpf: cliente.cpf || '',
    }))
    setClientModalOpen(false)
    setClientModalCliente(null)
  }

  const createOS = async e => {
    e.preventDefault()
    const total = numero(osForm.valortotal) || totalItens(osForm.produtos)
    if (!osForm.clientenome.trim()) return toast.error('Informe o cliente.')
    if (!(total > 0)) return toast.error('Informe o valor da OS.')
    setSaving(true)
    try {
      const payload = {
        ...osForm,
        valortotal: total,
        valorentrada: numero(osForm.valorentrada),
        clienteid: osForm.clienteid || null,
        prazoentrega: osForm.prazoentrega || null,
        dataEntrada: hoje(),
        produtos: osForm.produtos.map(item => ({
          produto_id: item.produto_id || null,
          nome: item.nome,
          quantidade: numero(item.quantidade || 1) || 1,
          preco_unitario: numero(item.preco_unitario),
          avulso: item.avulso,
        })),
      }
      const { data } = await api.post('/ordens', payload)
      toast.success(`OS ${data.numero} criada`)
      if (numero(osForm.valorentrada) > 0) emit('caixaUpdated')
      setOsForm(formInicialOS())
      setClienteQuery('')
      setClienteSelecionado(null)
      await loadBase()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar OS')
    } finally {
      setSaving(false)
    }
  }

  const buscarOS = async e => {
    e?.preventDefault?.()
    setSaving(true)
    try {
      const q = receiveQuery.trim()
      const { data } = await api.get(`/ordens?page=1&limit=12${q ? `&q=${encodeURIComponent(q)}` : ''}`)
      const lista = rows(data).filter(o => saldoOS(o) > 0.009 && !['Entregue', 'Cancelado'].includes(o.status))
      setReceiveResults(lista)
    } finally {
      setSaving(false)
    }
  }

  const selectOS = os => {
    setSelectedOs(os)
    setPaymentForm(f => ({ ...f, valor: saldoOS(os).toFixed(2) }))
  }

  const receberOS = async e => {
    e.preventDefault()
    if (!selectedOs) return toast.error('Selecione uma OS.')
    const valor = numero(paymentForm.valor)
    const saldo = saldoOS(selectedOs)
    if (!(valor > 0)) return toast.error('Informe o valor recebido.')
    setSaving(true)
    try {
      await api.post('/caixa', {
        data: hoje(),
        pagamento: paymentForm.pagamento,
        valor,
        ordemid: selectedOs.id,
      })
      emit('caixaUpdated')
      toast.success('Pagamento registrado')
      const podePerguntarEntrega = selectedOs.status === 'Pronto' && valor + 0.0001 >= saldo
      if (podePerguntarEntrega) {
        setDeliveryPrompt(selectedOs)
      }
      setSelectedOs(null)
      setPaymentForm({ valor: '', pagamento: 'Pix' })
      await loadBase()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao receber OS')
    } finally {
      setSaving(false)
    }
  }

  const confirmarEntrega = async () => {
    if (!deliveryPrompt) return
    setSaving(true)
    try {
      await api.patch(`/ordens/${deliveryPrompt.id}/status`, {
        status: 'Entregue',
        obs: 'Entrega marcada no recebimento presencial',
      })
      toast.success(`${deliveryPrompt.numero} entregue`)
      setDeliveryPrompt(null)
      await loadBase()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao marcar entrega')
    } finally {
      setSaving(false)
    }
  }

  const venderAvulso = async e => {
    e.preventDefault()
    const total = totalItens(saleItems)
    if (!saleItems.length) return toast.error('Inclua ao menos um item.')
    if (!(total > 0)) return toast.error('Informe o valor dos itens.')
    setSaving(true)
    try {
      await api.post('/caixa', {
        data: hoje(),
        tipo: 'Entrada',
        categoria: 'Venda avulsa',
        pagamento: salePayment,
        valor: total,
        pago: 1,
        itens: saleItems.map(item => ({
          produto_id: item.produto_id || null,
          nome: item.nome,
          quantidade: numero(item.quantidade || 1) || 1,
          preco_unitario: numero(item.preco_unitario),
          avulso: item.avulso,
        })),
      })
      emit('caixaUpdated')
      toast.success('Venda avulsa registrada')
      setSaleItems([])
      setSalePayment('Pix')
      await loadBase()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar venda')
    } finally {
      setSaving(false)
    }
  }

  const renderHome = () => (
    <div className="atendimento-cards">
      {modos.map(m => {
        const Icon = m.icon
        const copy = {
          'new-os': ['Criar pedido', 'Cliente, serviço, itens e entrada no mesmo fluxo.'],
          receive: ['Quitar saldo', 'Busca a OS, lança o pagamento e confere retirada.'],
          sale: ['Produto direto', 'Itens entram no caixa sem depender da descrição.'],
        }[m.key]
        return (
          <button type="button" key={m.key} onClick={() => setMode(m.key)} className="card card-hover atendimento-action-card">
            <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'color-mix(in oklab, var(--color-primary) 18%, var(--color-surface-offset))', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={17} strokeWidth={2.5} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-base)', fontWeight: 900, marginBottom: 2 }}>{m.label}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', lineHeight: 1.35 }}>{copy[1]}</div>
            </div>
          </button>
        )
      })}
    </div>
  )

  const renderNovaOS = () => (
    <form onSubmit={createOS} className="atendimento-form atendimento-nova-grid">
      <div className="atendimento-flow-column">
        <section className="card atendimento-section">
          <div className="atendimento-section-title">
            <UserPlus size={16} /> Cliente
          </div>
          <div ref={clienteRef} style={{ position: 'relative' }}>
            <Campo label="Nome do cliente">
              <input
                className="form-input"
                value={clienteQuery}
                onFocus={() => setClienteOpen(true)}
                onChange={e => {
                  const value = e.target.value
                  setClienteQuery(value)
                  setClienteOpen(true)
                  setClienteSelecionado(null)
                  setOsForm(f => ({ ...f, clientenome: value, clienteid: '', clientetelefone: '', clientecpf: '' }))
                }}
                placeholder="Digite nome, telefone ou CPF/CNPJ"
                autoComplete="off"
                style={{ height: 40 }}
              />
            </Campo>
            {clienteOpen && (
              <div className="atendimento-popover">
                {clientesFiltrados.length ? clientesFiltrados.map(c => (
                  <button type="button" key={c.id} onClick={() => selectCliente(c)} className="atendimento-suggestion">
                    <span style={{ fontWeight: 800 }}>{c.name}</span>
                    <span>{c.phone || c.cpf || 'Cliente cadastrado'}</span>
                  </button>
                )) : (
                  <button type="button" className="atendimento-suggestion" onMouseDown={e => e.preventDefault()} onClick={() => openClientModal(null)}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Cliente ainda nao cadastrado</span>
                    <span style={{ color: 'var(--color-primary)', fontWeight: 900 }}>CADASTRAR CLIENTE</span>
                  </button>
                )}
              </div>
            )}
          </div>
          {clienteSelecionado && (
            <div className="atendimento-inline-callout" style={{
              borderColor: clienteFiscalCompleto(clienteSelecionado) ? 'var(--color-success)' : 'var(--color-warning)',
              background: clienteFiscalCompleto(clienteSelecionado)
                ? 'color-mix(in oklab, var(--color-success) 10%, var(--color-surface))'
                : 'color-mix(in oklab, var(--color-warning) 12%, var(--color-surface))',
            }}>
              <div>
                <strong>{clienteSelecionado.name}</strong>
                <span>
                  {clienteFiscalCompleto(clienteSelecionado)
                    ? 'Dados fiscais completos'
                    : 'Dados fiscais incompletos para NF-e'}
                </span>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => openClientModal(clienteSelecionado)}>
                {clienteFiscalCompleto(clienteSelecionado) ? 'Editar dados' : 'Completar'}
              </button>
            </div>
          )}
        </section>

        <section className="card atendimento-section">
          <div className="atendimento-section-title">
            <ClipboardList size={16} /> Serviço
          </div>
          <div className="atendimento-grid-3">
            <Campo label="Tipo">
              <select className="form-input" value={osForm.servico} onChange={e => setOsForm(f => ({ ...f, servico: e.target.value }))}>
                {SERVICOS.map(s => <option key={s}>{s}</option>)}
              </select>
            </Campo>
            <Campo label="Prioridade">
              <select className="form-input" value={osForm.prioridade} onChange={e => setOsForm(f => ({ ...f, prioridade: e.target.value }))}>
                <option>Normal</option>
                <option>Urgente</option>
              </select>
            </Campo>
            <Campo label="Entrega">
              <input className="form-input" type="date" value={osForm.prazoentrega} onChange={e => setOsForm(f => ({ ...f, prazoentrega: e.target.value }))} />
            </Campo>
          </div>
          <Campo label="Observações">
            <textarea className="form-input" value={osForm.observacoes} onChange={e => setOsForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Medidas, cores, detalhes do pedido..." />
          </Campo>
        </section>
      </div>

      <div className="atendimento-flow-column">
        <section className="card atendimento-section">
          <div className="atendimento-section-title">
            <Package size={16} /> Itens
          </div>
          <ItemPicker produtos={produtos} onAdd={item => setOsItems([...osForm.produtos, item])} placeholder="Buscar produto cadastrado ou digitar item avulso" />
          <ItensEditor itens={osForm.produtos} onChange={setOsItems} emptyText="Nenhum item adicionado" />
        </section>

        <section className="card atendimento-section">
          <div className="atendimento-section-title">
            <DollarSign size={16} /> Pagamento
          </div>
          <div className="atendimento-grid-3">
            <Campo label="Total">
              <input className="form-input" type="number" min="0" step="0.01" value={osForm.valortotal} onChange={e => setOsForm(f => ({ ...f, valortotal: e.target.value }))} placeholder="0,00" />
            </Campo>
            <Campo label="Entrada">
              <input className="form-input" type="number" min="0" step="0.01" value={osForm.valorentrada} onChange={e => setOsForm(f => ({ ...f, valorentrada: e.target.value }))} placeholder="0,00" />
            </Campo>
            <Campo label="Forma">
              <select className="form-input" value={osForm.pagamento} onChange={e => setOsForm(f => ({ ...f, pagamento: e.target.value }))}>
                {PAGAMENTOS.map(p => <option key={p}>{p}</option>)}
              </select>
            </Campo>
          </div>
        </section>

        <div className="atendimento-submit-row">
          <div>
            <span>Total</span>
            <strong>{moeda(numero(osForm.valortotal) || totalItens(osForm.produtos))}</strong>
          </div>
          <button className="btn btn-primary" disabled={saving} style={{ minWidth: 150 }}>
            Criar OS
          </button>
        </div>
      </div>
    </form>
  )

  const renderReceber = () => (
    <form onSubmit={receberOS} className="atendimento-form atendimento-receber-grid">
      <div className="atendimento-flow-column">
        <section className="card atendimento-section">
          <div className="atendimento-section-title">
            <Search size={16} /> Buscar OS
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input
              className="form-input"
              value={receiveQuery}
              onChange={e => setReceiveQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') buscarOS(e) }}
              placeholder="Número, cliente ou serviço"
              style={{ height: 40 }}
            />
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={buscarOS}>Buscar</button>
          </div>
          <div className="atendimento-results-list">
            {receiveResults.map(os => (
              <button type="button" key={os.id} onClick={() => selectOS(os)} className="atendimento-os-row" style={{
                borderColor: selectedOs?.id === os.id ? 'var(--color-primary)' : 'var(--color-border)',
                background: selectedOs?.id === os.id ? 'color-mix(in oklab, var(--color-primary) 12%, var(--color-surface))' : 'var(--color-surface-offset)',
              }}>
                <div>
                  <strong>{os.numero} · {os.clientenome}</strong>
                  <span>{os.servico} · {os.status}</span>
                </div>
                <strong>{moeda(saldoOS(os))}</strong>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="atendimento-flow-column">
        <section className="card atendimento-section">
          <div className="atendimento-section-title">
            <DollarSign size={16} /> Recebimento
          </div>
          {selectedOs ? (
            <div className="atendimento-selected-os">
              <div>
                <span>Selecionada</span>
                <strong>{selectedOs.numero} · {selectedOs.clientenome}</strong>
              </div>
              <strong>{moeda(saldoOS(selectedOs))}</strong>
            </div>
          ) : null}
          <div className="atendimento-grid-2">
            <Campo label="Valor recebido">
              <input className="form-input" type="number" min="0" step="0.01" value={paymentForm.valor} onChange={e => setPaymentForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" />
            </Campo>
            <Campo label="Forma">
              <select className="form-input" value={paymentForm.pagamento} onChange={e => setPaymentForm(f => ({ ...f, pagamento: e.target.value }))}>
                {PAGAMENTOS.map(p => <option key={p}>{p}</option>)}
              </select>
            </Campo>
          </div>
        </section>

        <div className="atendimento-submit-row">
          <div>
            <span>Saldo selecionado</span>
            <strong>{moeda(saldoOS(selectedOs))}</strong>
          </div>
          <button className="btn btn-primary" disabled={saving || !selectedOs} style={{ minWidth: 170 }}>
            Receber pagamento
          </button>
        </div>
      </div>
    </form>
  )

  const renderVenda = () => (
    <form onSubmit={venderAvulso} className="atendimento-form atendimento-venda-grid">
      <div className="atendimento-flow-column">
        <section className="card atendimento-section">
          <div className="atendimento-section-title">
            <Package size={16} /> Itens da venda
          </div>
          <ItemPicker produtos={produtos} onAdd={item => setSaleItems(prev => [...prev, item])} placeholder="Buscar produto ou digitar venda avulsa" />
          <ItensEditor itens={saleItems} onChange={setSaleItems} emptyText="Nenhum produto na venda" />
        </section>
      </div>

      <div className="atendimento-flow-column">
        <section className="card atendimento-section">
          <div className="atendimento-section-title">
            <DollarSign size={16} /> Caixa
          </div>
          <Campo label="Forma de pagamento">
            <select className="form-input" value={salePayment} onChange={e => setSalePayment(e.target.value)}>
              {PAGAMENTOS.map(p => <option key={p}>{p}</option>)}
            </select>
          </Campo>
        </section>

        <div className="atendimento-submit-row">
          <div>
            <span>Total da venda</span>
            <strong>{moeda(totalItens(saleItems))}</strong>
          </div>
          <button className="btn btn-primary" disabled={saving} style={{ minWidth: 170 }}>
            Registrar venda
          </button>
        </div>
      </div>
    </form>
  )

  const renderCurrent = () => {
    if (mode === 'new-os') return renderNovaOS()
    if (mode === 'receive') return renderReceber()
    if (mode === 'sale') return renderVenda()
    return renderHome()
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--color-text-muted)' }}>Carregando...</div>
  }

  return (
    <div style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-4)' }}>
      <style>{`
        .atendimento-kpis { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); }
        .atendimento-wide-workspace { min-width:0; }
        .atendimento-panel-head { display:flex; align-items:center; justify-content:space-between; gap:var(--space-3); padding: var(--space-4) var(--space-5); border-bottom:1px solid var(--color-border); }
        .atendimento-mode-buttons { display:flex; gap:var(--space-2); flex-wrap:wrap; justify-content:flex-end; }
        .atendimento-cards { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); padding: var(--space-5); }
        .atendimento-action-card { min-height: 116px; padding: var(--space-4); border:none; text-align:left; color:var(--color-text); display:flex; align-items:flex-start; gap:var(--space-3); cursor:pointer; }
        .atendimento-form { display:grid; gap: var(--space-3); padding: var(--space-5); }
        .atendimento-flow-column { min-width:0; display:grid; gap:var(--space-3); align-content:start; }
        .atendimento-nova-grid { grid-template-columns:minmax(360px, 0.95fr) minmax(460px, 1.2fr); align-items:start; }
        .atendimento-receber-grid { grid-template-columns:minmax(380px, 1fr) minmax(360px, 0.85fr); align-items:start; }
        .atendimento-venda-grid { grid-template-columns:minmax(460px, 1.25fr) minmax(320px, 0.75fr); align-items:start; }
        .atendimento-section { padding: var(--space-4); display:grid; gap: var(--space-3); }
        .atendimento-section-title { display:flex; align-items:center; gap: var(--space-2); font-weight:900; font-size: var(--text-sm); }
        .atendimento-grid-2 { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
        .atendimento-grid-3 { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
        .atendimento-popover { position:absolute; top:calc(100% + 5px); left:0; right:0; z-index:45; background:var(--color-surface-2); border:1px solid var(--color-border); border-radius:var(--radius-md); box-shadow:var(--shadow-lg); overflow:hidden; }
        .atendimento-suggestion { width:100%; border:none; border-bottom:1px solid var(--color-divider); background:transparent; color:var(--color-text); text-align:left; padding:var(--space-2) var(--space-3); display:flex; justify-content:space-between; gap:var(--space-3); cursor:pointer; font-size:var(--text-xs); }
        .atendimento-inline-callout { display:flex; align-items:center; justify-content:space-between; gap:var(--space-3); padding:var(--space-3); border:1px solid var(--color-primary); border-radius:var(--radius-md); background:color-mix(in oklab, var(--color-primary) 10%, var(--color-surface)); }
        .atendimento-inline-callout div { display:grid; gap:2px; font-size:var(--text-xs); }
        .atendimento-inline-callout span { color:var(--color-text-muted); }
        .atendimento-item-row { display:grid; grid-template-columns:minmax(160px,1fr) 72px 100px 100px 34px; gap:var(--space-2); align-items:center; padding:var(--space-2); border:1px solid var(--color-border); border-radius:var(--radius-md); background:var(--color-surface-offset); }
        .atendimento-submit-row { display:flex; align-items:center; justify-content:space-between; gap:var(--space-3); padding: var(--space-3) var(--space-4); border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-surface); position:sticky; bottom:0; z-index:5; }
        .atendimento-submit-row div { display:grid; gap:2px; }
        .atendimento-submit-row span { font-size:10px; color:var(--color-text-muted); font-weight:900; text-transform:uppercase; letter-spacing:0.06em; }
        .atendimento-submit-row strong { font-size:var(--text-xl); font-weight:900; font-variant-numeric:tabular-nums; }
        .atendimento-os-row { width:100%; border:1px solid var(--color-border); border-radius:var(--radius-md); padding:var(--space-3); color:var(--color-text); display:flex; justify-content:space-between; align-items:center; gap:var(--space-3); text-align:left; cursor:pointer; }
        .atendimento-os-row div { display:grid; gap:3px; min-width:0; }
        .atendimento-os-row span { color:var(--color-text-muted); font-size:var(--text-xs); }
        .atendimento-results-list { min-height:82px; max-height:min(32vh, 420px); overflow:auto; display:grid; gap:var(--space-2); align-content:start; padding-right:2px; }
        .atendimento-selected-os { display:flex; justify-content:space-between; gap:var(--space-3); padding:var(--space-3); border:1px solid var(--color-primary); border-radius:var(--radius-md); background:color-mix(in oklab, var(--color-primary) 10%, var(--color-surface)); }
        .atendimento-selected-os div { display:grid; gap:2px; }
        .atendimento-selected-os span { color:var(--color-text-muted); font-size:10px; font-weight:900; text-transform:uppercase; letter-spacing:0.06em; }
        @media (max-width: 1180px) {
          .atendimento-nova-grid, .atendimento-receber-grid, .atendimento-venda-grid { grid-template-columns:1fr; }
          .atendimento-kpis { grid-template-columns:repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 780px) {
          .atendimento-kpis, .atendimento-cards, .atendimento-grid-2, .atendimento-grid-3 { grid-template-columns:1fr; }
          .atendimento-panel-head { align-items:flex-start; flex-direction:column; }
          .atendimento-mode-buttons { justify-content:flex-start; }
          .atendimento-mode-button span { display:none; }
          .atendimento-item-row { grid-template-columns:1fr 68px 88px 34px; }
          .atendimento-item-row > div:nth-child(4) { display:none; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>/ Atendimento</div>
          <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 900 }}>Frente de Atendimento</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
            Nova OS, recebimento e venda avulsa no mesmo ponto de trabalho.
          </p>
        </div>
      </div>

      {mode === 'home' && (
        <div className="atendimento-kpis">
          <Kpi icon={ClipboardList} label="OS abertas" value={resumo.ativas} color="var(--color-primary)" />
          <Kpi icon={CheckCircle2} label="Prontas" value={resumo.prontas} color="var(--color-success)" />
          <Kpi icon={DollarSign} label="Recebido hoje" value={moeda(resumo.recebido)} color="var(--color-success)" />
          <Kpi icon={Search} label="Vencidas" value={resumo.vencidas} color="var(--color-warning)" />
        </div>
      )}

      <div className="atendimento-wide-workspace">
        <main className="card" style={{ overflow: 'hidden' }}>
          <div className="atendimento-panel-head">
            <div>
              <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 900 }}>O que você vai fazer agora?</h2>
              <p style={{ margin: '3px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Escolha um caminho de atendimento.</p>
            </div>
            <div className="atendimento-mode-buttons">
              {modos.map(m => (
                <MiniIconButton key={m.key} active={mode === m.key} icon={m.icon} label={m.label} onClick={() => setMode(m.key)} />
              ))}
            </div>
          </div>
          {renderCurrent()}
        </main>
      </div>

      {deliveryPrompt && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <span className="modal-title">Marcar como entregue?</span>
              <button className="btn btn-icon btn-ghost" onClick={() => setDeliveryPrompt(null)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 'var(--space-3)' }}>
              <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-offset)' }}>
                <strong>{deliveryPrompt.numero} · {deliveryPrompt.clientenome}</strong>
                <div style={{ marginTop: 4, color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>O pagamento zerou o saldo desta OS pronta.</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeliveryPrompt(null)}>Depois</button>
              <button className="btn btn-primary" disabled={saving} onClick={confirmarEntrega}>Marcar entregue</button>
            </div>
          </div>
        </div>
      )}

      <QuickClientModal
        open={clientModalOpen}
        cliente={clientModalCliente}
        initialName={osForm.clientenome}
        onClose={() => {
          setClientModalOpen(false)
          setClientModalCliente(null)
        }}
        onSaved={handleClientSaved}
      />
    </div>
  )
}
