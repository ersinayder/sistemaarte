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

const EMPTY_FISCAL = {
  ambiente: '2',
  serie: '1',
  proximoNumero: '1',
}

const EMPTY_AUTXML = {
  nome: '',
  documento: '',
  tipo: 'contador',
  ativo: true,
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

function normalizeLoadedFiscal(fiscal = {}) {
  return {
    ambiente: String(fiscal.ambiente || EMPTY_FISCAL.ambiente),
    serie: String(fiscal.serie || EMPTY_FISCAL.serie),
    proximoNumero: String(fiscal.proximoNumero || EMPTY_FISCAL.proximoNumero),
  }
}

function normalizeAutXml(item = {}) {
  return {
    nome: item.nome || '',
    documento: item.documento || '',
    tipo: item.tipo || 'contador',
    ativo: Number(item.ativo ?? 1) === 1,
  }
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

function SavingLabel({ saving, idle }) {
  return saving ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Salvando...</> : idle
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

function InfoRow({ label, value }) {
  return (
    <div className="settings-info-row">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
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
  const [fiscalForm, setFiscalForm] = useState(EMPTY_FISCAL)
  const [fiscalInfo, setFiscalInfo] = useState(null)
  const [fiscalErrors, setFiscalErrors] = useState({})
  const [loadingFiscal, setLoadingFiscal] = useState(false)
  const [savingFiscal, setSavingFiscal] = useState(false)
  const [certFile, setCertFile] = useState(null)
  const [uploadingCert, setUploadingCert] = useState(false)
  const [certSenha, setCertSenha] = useState('')
  const [savingSenha, setSavingSenha] = useState(false)
  const [autXmlList, setAutXmlList] = useState([])
  const [autXmlForm, setAutXmlForm] = useState(EMPTY_AUTXML)
  const [autXmlErrors, setAutXmlErrors] = useState({})
  const [savingAutXml, setSavingAutXml] = useState(false)
  const [editingAutXmlId, setEditingAutXmlId] = useState(null)

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

  const applyFiscalResponse = useCallback((data = {}) => {
    const fiscal = data.fiscal || {}
    setFiscalInfo(fiscal)
    setFiscalForm(normalizeLoadedFiscal(fiscal))
    setAutXmlList(data.autxml || [])
    setStatusMap((current) => ({ ...current, fiscal: fiscal.status || current.fiscal }))
  }, [])

  const loadFiscal = useCallback(async () => {
    setLoadingFiscal(true)
    try {
      const res = await api.get('/configuracoes/fiscal')
      applyFiscalResponse(res.data)
      setFiscalErrors({})
      setAutXmlErrors({})
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar ajustes fiscais')
    } finally {
      setLoadingFiscal(false)
    }
  }, [applyFiscalResponse])

  useEffect(() => {
    document.title = 'Configuracoes - Arte & Molduras'
    loadConfiguracoes()
  }, [loadConfiguracoes])

  useEffect(() => {
    if (activeSection === 'fiscal' && !fiscalInfo && !loadingFiscal) {
      loadFiscal()
    }
  }, [activeSection, fiscalInfo, loadingFiscal, loadFiscal])

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

  const setFiscalField = (field, value) => {
    setFiscalForm((form) => ({ ...form, [field]: value }))
    setFiscalErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const setAutXmlField = (field, value) => {
    setAutXmlForm((form) => ({ ...form, [field]: value }))
    setAutXmlErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
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

  const saveFiscal = async (event, confirmarReducao = false, confirmarProducao = true) => {
    event.preventDefault()

    if (confirmarProducao && String(fiscalForm.ambiente) === '1') {
      const ok = window.confirm('Voce esta selecionando ambiente de producao. Confirma que os dados fiscais estao corretos?')
      if (!ok) return
    }

    setSavingFiscal(true)
    setFiscalErrors({})

    try {
      const payload = {
        ambiente: Number(fiscalForm.ambiente),
        serie: digits(fiscalForm.serie) || fiscalForm.serie,
        proximoNumero: Number(digits(fiscalForm.proximoNumero)),
        confirmarReducao,
      }
      const res = await api.put('/configuracoes/fiscal', payload)
      applyFiscalResponse(res.data)
      toast.success('Ajustes fiscais salvos')
    } catch (e) {
      if (e.response?.status === 409 && !confirmarReducao) {
        const ok = window.confirm('O numero informado e menor que o proximo numero atual. Confirma a reducao da numeracao?')
        if (ok) return saveFiscal(event, true, false)
      }
      const fieldErrors = e.response?.data?.errors
      if (fieldErrors) setFiscalErrors(fieldErrors)
      toast.error(e.response?.data?.error || 'Erro ao salvar ajustes fiscais')
    } finally {
      setSavingFiscal(false)
    }
  }

  const uploadCertificado = async () => {
    if (!certFile) {
      toast.error('Selecione um arquivo .pfx')
      return
    }

    setUploadingCert(true)
    try {
      const data = new FormData()
      data.append('certificado', certFile)
      const res = await api.post('/configuracoes/fiscal/certificado', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      })
      setFiscalInfo(res.data?.fiscal || null)
      setStatusMap((current) => ({ ...current, fiscal: res.data?.fiscal?.status || current.fiscal }))
      setCertFile(null)
      toast.success('Certificado enviado')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao enviar certificado')
    } finally {
      setUploadingCert(false)
    }
  }

  const salvarSenhaCertificado = async () => {
    if (!certSenha.trim()) {
      toast.error('Digite a senha do certificado')
      return
    }

    setSavingSenha(true)
    try {
      const res = await api.put('/configuracoes/fiscal/certificado/senha', { senha: certSenha })
      setFiscalInfo((current) => ({
        ...(current || {}),
        certificado: res.data?.certificado || current?.certificado,
      }))
      setCertSenha('')
      toast.success('Senha do certificado atualizada')
      await loadFiscal()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao atualizar senha')
    } finally {
      setSavingSenha(false)
    }
  }

  const resetAutXml = () => {
    setAutXmlForm(EMPTY_AUTXML)
    setAutXmlErrors({})
    setEditingAutXmlId(null)
  }

  const saveAutXml = async (event) => {
    event.preventDefault()
    setSavingAutXml(true)
    setAutXmlErrors({})

    try {
      const payload = {
        nome: autXmlForm.nome.trim(),
        documento: digits(autXmlForm.documento),
        tipo: autXmlForm.tipo,
        ativo: autXmlForm.ativo ? 1 : 0,
      }
      const res = editingAutXmlId
        ? await api.put(`/configuracoes/fiscal/autxml/${editingAutXmlId}`, payload)
        : await api.post('/configuracoes/fiscal/autxml', payload)
      setAutXmlList(res.data?.list || [])
      resetAutXml()
      toast.success(editingAutXmlId ? 'Autorizado XML atualizado' : 'Autorizado XML cadastrado')
      await loadFiscal()
    } catch (e) {
      const fieldErrors = e.response?.data?.errors
      if (fieldErrors) setAutXmlErrors(fieldErrors)
      toast.error(e.response?.data?.error || 'Erro ao salvar autorizado XML')
    } finally {
      setSavingAutXml(false)
    }
  }

  const editAutXml = (item) => {
    setEditingAutXmlId(item.id)
    setAutXmlForm(normalizeAutXml(item))
    setAutXmlErrors({})
  }

  const toggleAutXml = async (item) => {
    try {
      const payload = { ...normalizeAutXml(item), ativo: Number(item.ativo) !== 1 ? 1 : 0 }
      const res = await api.put(`/configuracoes/fiscal/autxml/${item.id}`, payload)
      setAutXmlList(res.data?.list || [])
      await loadFiscal()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao alterar autorizado XML')
    }
  }

  const deleteAutXml = async (item) => {
    const ok = window.confirm(`Remover ${item.nome}?`)
    if (!ok) return

    try {
      const res = await api.delete(`/configuracoes/fiscal/autxml/${item.id}`)
      setAutXmlList(res.data?.autxml || [])
      if (editingAutXmlId === item.id) resetAutXml()
      await loadFiscal()
      toast.success('Autorizado XML removido')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao remover autorizado XML')
    }
  }

  const renderFiscal = () => (
    <div className="settings-stack">
      <form className="card card-pad" onSubmit={saveFiscal}>
        <div className="settings-section-head">
          <div>
            <h2>{active.label}</h2>
            <p className="text-muted">{active.desc}</p>
          </div>
          <StatusPill value={statusMap.fiscal} />
        </div>

        {loadingFiscal ? (
          <div className="loading-center">
            <div className="spinner" />
            <span>Carregando ajustes fiscais...</span>
          </div>
        ) : (
          <>
            <div className="settings-info-grid">
              <InfoRow label="Origem do ambiente" value={fiscalInfo?.ambienteOrigem === 'banco' ? 'Tela fiscal' : fiscalInfo?.ambienteOrigem || 'padrao'} />
              <InfoRow label="Configuracao salva" value={fiscalInfo?.configurado ? 'Sim' : 'Ainda usando fallback'} />
              <InfoRow label="Certificado" value={fiscalInfo?.certificado?.configurado ? `${fiscalInfo.certificado.nome || 'Configurado'} (${fiscalInfo.certificado.origem})` : 'Nao configurado'} />
            </div>

            <div className="form-grid-2">
              <Field label="Ambiente NF-e" name="ambiente" form={fiscalForm} errors={fiscalErrors} onChange={setFiscalField}>
                <select id="ambiente" className="form-input" value={fiscalForm.ambiente} onChange={(e) => setFiscalField('ambiente', e.target.value)}>
                  <option value="2">2 - Homologacao</option>
                  <option value="1">1 - Producao</option>
                </select>
              </Field>
              <Field label="Serie" name="serie" form={fiscalForm} errors={fiscalErrors} onChange={setFiscalField} inputMode="numeric" />
              <Field label="Proximo numero NF-e" name="proximoNumero" form={fiscalForm} errors={fiscalErrors} onChange={setFiscalField} inputMode="numeric" />
            </div>

            <div className="settings-actions">
              <button type="button" className="btn btn-ghost" onClick={loadFiscal} disabled={savingFiscal}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={savingFiscal}>
                <SavingLabel saving={savingFiscal} idle="Salvar fiscal" />
              </button>
            </div>
          </>
        )}
      </form>

      <div className="settings-two-col">
        <div className="card card-pad">
          <div className="settings-section-head">
            <div>
              <h2>Certificado digital</h2>
              <p className="text-muted">Envie o arquivo PFX e atualize a senha sem exibir a senha atual.</p>
            </div>
            <span className={`badge ${fiscalInfo?.certificado?.configurado ? 'badge-success' : 'badge-warning'}`}>
              {fiscalInfo?.certificado?.configurado ? 'Configurado' : 'Pendente'}
            </span>
          </div>

          <div className="settings-cert-box">
            <InfoRow label="Arquivo" value={fiscalInfo?.certificado?.nome} />
            <InfoRow label="Origem" value={fiscalInfo?.certificado?.origem} />
            <InfoRow label="Atualizado em" value={fiscalInfo?.certificado?.updatedat} />
          </div>

          <div className="settings-inline-form">
            <input className="form-input" type="file" accept=".pfx" onChange={(e) => setCertFile(e.target.files?.[0] || null)} />
            <button type="button" className="btn btn-primary" onClick={uploadCertificado} disabled={uploadingCert}>
              {uploadingCert ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Enviando...</> : 'Enviar PFX'}
            </button>
          </div>

          <div className="settings-inline-form">
            <input className="form-input" type="password" value={certSenha} onChange={(e) => setCertSenha(e.target.value)} placeholder="Nova senha do certificado" />
            <button type="button" className="btn btn-primary" onClick={salvarSenhaCertificado} disabled={savingSenha}>
              <SavingLabel saving={savingSenha} idle="Trocar senha" />
            </button>
          </div>
        </div>

        <form className="card card-pad" onSubmit={saveAutXml}>
          <div className="settings-section-head">
            <div>
              <h2>Contadores autorizados XML</h2>
              <p className="text-muted">Documentos autorizados na tag autXML da NF-e.</p>
            </div>
            <span className="badge badge-secondary">{autXmlList.filter((item) => Number(item.ativo) === 1).length}/10 ativos</span>
          </div>

          <div className="form-grid-2">
            <Field label="Nome" name="nome" form={autXmlForm} errors={autXmlErrors} onChange={setAutXmlField} />
            <Field label="CPF/CNPJ" name="documento" form={autXmlForm} errors={autXmlErrors} onChange={setAutXmlField} inputMode="numeric" />
            <Field label="Tipo" name="tipo" form={autXmlForm} errors={autXmlErrors} onChange={setAutXmlField}>
              <select id="tipo" className="form-input" value={autXmlForm.tipo} onChange={(e) => setAutXmlField('tipo', e.target.value)}>
                <option value="contador">Contador</option>
                <option value="escritorio">Escritorio contabil</option>
                <option value="outro">Outro</option>
              </select>
            </Field>
            <label className="settings-check">
              <input type="checkbox" checked={autXmlForm.ativo} onChange={(e) => setAutXmlField('ativo', e.target.checked)} />
              Ativo
            </label>
          </div>

          <div className="settings-actions">
            {editingAutXmlId && <button type="button" className="btn btn-ghost" onClick={resetAutXml} disabled={savingAutXml}>Cancelar edicao</button>}
            <button type="submit" className="btn btn-primary" disabled={savingAutXml}>
              <SavingLabel saving={savingAutXml} idle={editingAutXmlId ? 'Atualizar' : 'Adicionar'} />
            </button>
          </div>

          <div className="settings-autxml-list">
            {autXmlList.length === 0 ? (
              <div className="empty-state">Nenhum contador autorizado cadastrado.</div>
            ) : autXmlList.map((item) => (
              <div className="settings-autxml-item" key={item.id}>
                <div>
                  <strong>{item.nome}</strong>
                  <span>{item.documento} - {item.tipo}</span>
                </div>
                <span className={`badge ${Number(item.ativo) === 1 ? 'badge-success' : 'badge-secondary'}`}>
                  {Number(item.ativo) === 1 ? 'Ativo' : 'Inativo'}
                </span>
                <div className="settings-row-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => editAutXml(item)}>Editar</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleAutXml(item)}>
                    {Number(item.ativo) === 1 ? 'Desativar' : 'Ativar'}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteAutXml(item)}>Remover</button>
                </div>
              </div>
            ))}
          </div>
        </form>
      </div>
    </div>
  )

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
          ) : activeSection === 'fiscal' ? (
            renderFiscal()
          ) : (
            <PlannedSection section={activeSection} />
          )}
        </section>
      </div>
    </div>
  )
}
