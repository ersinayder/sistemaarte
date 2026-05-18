import React, { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'

const EMPTY_EMPRESA = {
  razaosocial: '',
  nomefantasia: '',
  cnpj: '',
  inscricaoestadual: '',
  crt: '1',
  telefone: '',
  email: '',
  logradouro: '',
  numero: '',
  bairro: '',
  municipio: '',
  codigomunicipio: '',
  uf: '',
  cep: '',
}

const SECTIONS = [
  { id: 'empresa', label: 'Empresa', desc: 'Dados cadastrais e endereco do emitente.' },
  { id: 'fiscal', label: 'Fiscal', desc: 'Certificado, ambiente e numeracao fiscal.' },
  { id: 'whatsapp', label: 'WhatsApp', desc: 'Provedor, token e mensagens automaticas.' },
  { id: 'backups', label: 'Backups', desc: 'Rotina local, offsite e verificacao diaria.' },
  { id: 'seguranca', label: 'Seguranca', desc: 'Acesso, limites e protecoes da aplicacao.' },
  { id: 'sistema', label: 'Sistema', desc: 'Parametros gerais e saude operacional.' },
]

const PLANNED_SECTIONS = {
  fiscal: [
    ['Certificado digital', 'Cadastro do PFX, senha e validade para emissao fiscal.'],
    ['Ambiente NF-e', 'Troca assistida entre homologacao e producao.'],
    ['Serie e numero', 'Controle operacional da sequencia fiscal.'],
  ],
  whatsapp: [
    ['Provedor', 'Configuracao da Evolution API ou outro provedor aprovado.'],
    ['Mensagens', 'Templates para confirmacao, status e retirada.'],
    ['Monitoramento', 'Status da instancia e ultima entrega registrada.'],
  ],
  backups: [
    ['Backup local', 'Resumo da rotina diaria e ultimos arquivos gerados.'],
    ['Backup offsite', 'Destino externo versionado para recuperacao segura.'],
    ['Alertas', 'Aviso quando a rotina falhar ou ficar desatualizada.'],
  ],
  seguranca: [
    ['Rate limits', 'Limites por rota para reduzir abuso e erro operacional.'],
    ['Login', 'Lockout por usuario e politicas de senha.'],
    ['Auditoria', 'Registro de acoes sensiveis para rastreabilidade.'],
  ],
  sistema: [
    ['Versao', 'Identificacao da versao instalada e data do build.'],
    ['Saude', 'Resumo de API, banco e servicos auxiliares.'],
    ['Preferencias', 'Ajustes gerais da aplicacao para a loja.'],
  ],
}

const digitFields = ['cnpj', 'inscricaoestadual', 'telefone', 'codigomunicipio', 'cep']

function digits(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeLoadedEmpresa(empresa = {}) {
  return { ...EMPTY_EMPRESA, ...empresa, crt: empresa.crt || EMPTY_EMPRESA.crt }
}

function cleanPayload(form) {
  const payload = { ...form }
  for (const field of digitFields) payload[field] = digits(payload[field])
  payload.razaosocial = payload.razaosocial.trim()
  payload.nomefantasia = payload.nomefantasia.trim()
  payload.email = payload.email.trim()
  payload.logradouro = payload.logradouro.trim()
  payload.numero = payload.numero.trim()
  payload.bairro = payload.bairro.trim()
  payload.municipio = payload.municipio.trim()
  payload.uf = payload.uf.trim().toUpperCase()
  payload.crt = String(payload.crt || '1')
  return payload
}

function statusClass(status) {
  return status === 'OK' ? 'badge-success' : 'badge-warning'
}

function StatusPill({ value }) {
  const status = value?.status || 'Pendente'
  return <span className={`badge ${statusClass(status)}`}>{status}</span>
}

function Field({ label, name, form, errors, onChange, children, ...props }) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={name}>{label}</label>
      {children || (
        <input
          id={name}
          className="form-input"
          value={form[name] || ''}
          onChange={(e) => onChange(name, e.target.value)}
          {...props}
        />
      )}
      {errors[name] && <span className="form-error">{errors[name]}</span>}
    </div>
  )
}

function PlannedSection({ section }) {
  const items = PLANNED_SECTIONS[section] || []

  return (
    <div className="card card-pad">
      <div className="settings-section-head">
        <div>
          <h2>Etapa futura</h2>
          <p className="text-muted">Esta area ja esta mapeada para as proximas etapas.</p>
        </div>
        <span className="badge badge-secondary">Planejado</span>
      </div>

      <div className="settings-planned-grid">
        {items.map(([title, desc]) => (
          <div className="settings-planned-item" key={title}>
            <strong>{title}</strong>
            <span>{desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Configuracoes() {
  const [activeSection, setActiveSection] = useState('empresa')
  const [empresaForm, setEmpresaForm] = useState(EMPTY_EMPRESA)
  const [loadedEmpresa, setLoadedEmpresa] = useState(EMPTY_EMPRESA)
  const [statusMap, setStatusMap] = useState({})
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const active = useMemo(
    () => SECTIONS.find((section) => section.id === activeSection) || SECTIONS[0],
    [activeSection]
  )

  const loadConfiguracoes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/configuracoes')
      const empresa = normalizeLoadedEmpresa(res.data?.empresa)
      setEmpresaForm(empresa)
      setLoadedEmpresa(empresa)
      setStatusMap(res.data?.status || {})
      setErrors({})
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar configuracoes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    document.title = 'Configuracoes - Arte & Molduras'
    loadConfiguracoes()
  }, [loadConfiguracoes])

  const setField = (field, value) => {
    setEmpresaForm((form) => ({ ...form, [field]: value }))
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const resetEmpresa = () => {
    setEmpresaForm(loadedEmpresa)
    setErrors({})
  }

  const saveEmpresa = async (event) => {
    event.preventDefault()
    setSaving(true)
    setErrors({})

    try {
      const payload = cleanPayload(empresaForm)
      const res = await api.put('/configuracoes/empresa', payload)
      const empresa = normalizeLoadedEmpresa(res.data?.empresa)
      setEmpresaForm(empresa)
      setLoadedEmpresa(empresa)
      setStatusMap((current) => ({ ...current, empresa: res.data?.status }))
      toast.success('Dados da empresa salvos')
    } catch (e) {
      const fieldErrors = e.response?.data?.errors
      if (fieldErrors) setErrors(fieldErrors)
      toast.error(e.response?.data?.error || 'Erro ao salvar dados da empresa')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-content-wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuracoes</h1>
          <p className="text-muted">Central administrativa do sistema.</p>
        </div>
        {loading && <span className="badge badge-secondary">Carregando</span>}
      </div>

      <div className="settings-layout">
        <aside className="settings-menu card" aria-label="Secoes de configuracao">
          {SECTIONS.map((section) => (
            <button
              type="button"
              key={section.id}
              className={`settings-menu-item ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <span className="settings-menu-copy">
                <strong>{section.label}</strong>
                <small>{section.desc}</small>
              </span>
              <StatusPill value={statusMap[section.id]} />
            </button>
          ))}
        </aside>

        <section className="settings-main">
          {activeSection === 'empresa' ? (
            <form className="card card-pad" onSubmit={saveEmpresa}>
              <div className="settings-section-head">
                <div>
                  <h2>{active.label}</h2>
                  <p className="text-muted">{active.desc}</p>
                </div>
                <StatusPill value={statusMap.empresa} />
              </div>

              {loading ? (
                <div className="loading-center">
                  <div className="spinner" />
                  <span>Carregando dados da empresa...</span>
                </div>
              ) : (
                <>
                  <div className="form-grid-2">
                    <Field label="Razao social" name="razaosocial" form={empresaForm} errors={errors} onChange={setField} autoFocus />
                    <Field label="Nome fantasia" name="nomefantasia" form={empresaForm} errors={errors} onChange={setField} />
                    <Field label="CNPJ" name="cnpj" form={empresaForm} errors={errors} onChange={setField} inputMode="numeric" placeholder="Somente numeros" />
                    <Field label="Inscricao estadual" name="inscricaoestadual" form={empresaForm} errors={errors} onChange={setField} inputMode="numeric" />
                    <Field label="CRT" name="crt" form={empresaForm} errors={errors} onChange={setField}>
                      <select id="crt" className="form-input" value={empresaForm.crt} onChange={(e) => setField('crt', e.target.value)}>
                        <option value="1">1 - Simples Nacional</option>
                        <option value="2">2 - Simples Nacional, excesso sublimite</option>
                        <option value="3">3 - Regime normal</option>
                      </select>
                    </Field>
                    <Field label="Telefone" name="telefone" form={empresaForm} errors={errors} onChange={setField} inputMode="tel" />
                    <Field label="E-mail" name="email" form={empresaForm} errors={errors} onChange={setField} type="email" />
                    <Field label="CEP" name="cep" form={empresaForm} errors={errors} onChange={setField} inputMode="numeric" />
                    <Field label="Logradouro" name="logradouro" form={empresaForm} errors={errors} onChange={setField} />
                    <Field label="Numero" name="numero" form={empresaForm} errors={errors} onChange={setField} />
                    <Field label="Bairro" name="bairro" form={empresaForm} errors={errors} onChange={setField} />
                    <Field label="Municipio" name="municipio" form={empresaForm} errors={errors} onChange={setField} />
                    <Field label="Codigo municipio" name="codigomunicipio" form={empresaForm} errors={errors} onChange={setField} inputMode="numeric" placeholder="Codigo IBGE" />
                    <Field label="UF" name="uf" form={empresaForm} errors={errors} onChange={setField} maxLength={2} />
                  </div>

                  <div className="settings-actions">
                    <button type="button" className="btn btn-ghost" onClick={resetEmpresa} disabled={saving}>
                      Cancelar
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Salvando...</> : 'Salvar empresa'}
                    </button>
                  </div>
                </>
              )}
            </form>
          ) : (
            <PlannedSection section={activeSection} />
          )}
        </section>
      </div>
    </div>
  )
}
