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

const EMPTY_WHATSAPP = {
  enabled: false,
  provider: 'meta',
  phoneId: '',
  token: '',
  templatePronto: 'os_pronta',
  templateConfirmacao: 'confirmacao_pedido',
}

const SECTIONS = [
  { id: 'empresa', label: 'Empresa', desc: 'Dados cadastrais e endereco do emitente.' },
  { id: 'fiscal', label: 'Fiscal', desc: 'Certificado, ambiente e numeracao fiscal.' },
  { id: 'whatsapp', label: 'WhatsApp', desc: 'Provedor, token e mensagens automaticas.' },
  { id: 'backups', label: 'Backups', desc: 'Rotina local, offsite e verificacao diaria.' },
  { id: 'seguranca', label: 'Seguranca', desc: 'Acesso, limites e protecoes da aplicacao.' },
  { id: 'sistema', label: 'Sistema', desc: 'Parametros gerais e saude operacional.' },
]

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

function normalizeLoadedWhatsapp(whatsapp = {}) {
  return {
    ...EMPTY_WHATSAPP,
    enabled: Boolean(whatsapp.enabled),
    provider: whatsapp.provider || 'meta',
    phoneId: whatsapp.phoneId || '',
    token: '',
    templatePronto: whatsapp.templatePronto || EMPTY_WHATSAPP.templatePronto,
    templateConfirmacao: whatsapp.templateConfirmacao || EMPTY_WHATSAPP.templateConfirmacao,
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
  if (status === 'OK') return 'badge-success'
  if (status === 'Inativo') return 'badge-secondary'
  return 'badge-warning'
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

function formatBytes(bytes) {
  const n = Number(bytes || 0)
  if (!n) return '0 KB'
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
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
  const [whatsappInfo, setWhatsappInfo] = useState(null)
  const [whatsappForm, setWhatsappForm] = useState(EMPTY_WHATSAPP)
  const [whatsappErrors, setWhatsappErrors] = useState({})
  const [loadingWhatsapp, setLoadingWhatsapp] = useState(false)
  const [savingWhatsapp, setSavingWhatsapp] = useState(false)
  const [backupsInfo, setBackupsInfo] = useState(null)
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [runningBackup, setRunningBackup] = useState(false)
  const [segurancaInfo, setSegurancaInfo] = useState(null)
  const [loadingSeguranca, setLoadingSeguranca] = useState(false)
  const [sistemaInfo, setSistemaInfo] = useState(null)
  const [loadingSistema, setLoadingSistema] = useState(false)

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

  const applyWhatsappResponse = useCallback((data = {}) => {
    const whatsapp = data.whatsapp || {}
    setWhatsappInfo(whatsapp)
    setWhatsappForm(normalizeLoadedWhatsapp(whatsapp))
    setStatusMap((current) => ({ ...current, whatsapp: whatsapp.status || current.whatsapp }))
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

  const loadWhatsapp = useCallback(async () => {
    setLoadingWhatsapp(true)
    try {
      const res = await api.get('/configuracoes/whatsapp')
      applyWhatsappResponse(res.data)
      setWhatsappErrors({})
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar WhatsApp')
    } finally {
      setLoadingWhatsapp(false)
    }
  }, [applyWhatsappResponse])

  const loadBackups = useCallback(async () => {
    setLoadingBackups(true)
    try {
      const res = await api.get('/configuracoes/backups')
      setBackupsInfo(res.data?.backups || null)
      setStatusMap((current) => ({ ...current, backups: res.data?.backups?.status || current.backups }))
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar backups')
    } finally {
      setLoadingBackups(false)
    }
  }, [])

  const loadSeguranca = useCallback(async () => {
    setLoadingSeguranca(true)
    try {
      const res = await api.get('/configuracoes/seguranca')
      setSegurancaInfo(res.data?.seguranca || null)
      setStatusMap((current) => ({ ...current, seguranca: res.data?.seguranca?.status || current.seguranca }))
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar seguranca')
    } finally {
      setLoadingSeguranca(false)
    }
  }, [])

  const loadSistema = useCallback(async () => {
    setLoadingSistema(true)
    try {
      const res = await api.get('/configuracoes/sistema')
      setSistemaInfo(res.data?.sistema || null)
      setStatusMap((current) => ({ ...current, sistema: res.data?.sistema?.status || current.sistema }))
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar sistema')
    } finally {
      setLoadingSistema(false)
    }
  }, [])

  useEffect(() => {
    document.title = 'Configurações - Arte & Molduras'
    loadConfiguracoes()
  }, [loadConfiguracoes])

  useEffect(() => {
    if (activeSection === 'fiscal' && !fiscalInfo && !loadingFiscal) {
      loadFiscal()
    }
    if (activeSection === 'whatsapp' && !whatsappInfo && !loadingWhatsapp) {
      loadWhatsapp()
    }
    if (activeSection === 'backups' && !backupsInfo && !loadingBackups) {
      loadBackups()
    }
    if (activeSection === 'seguranca' && !segurancaInfo && !loadingSeguranca) {
      loadSeguranca()
    }
    if (activeSection === 'sistema' && !sistemaInfo && !loadingSistema) {
      loadSistema()
    }
  }, [
    activeSection,
    fiscalInfo,
    loadingFiscal,
    loadFiscal,
    whatsappInfo,
    loadingWhatsapp,
    loadWhatsapp,
    backupsInfo,
    loadingBackups,
    loadBackups,
    segurancaInfo,
    loadingSeguranca,
    loadSeguranca,
    sistemaInfo,
    loadingSistema,
    loadSistema,
  ])

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

  const setWhatsappField = (field, value) => {
    setWhatsappForm((form) => ({ ...form, [field]: value }))
    setWhatsappErrors((current) => {
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

  const saveWhatsapp = async (event) => {
    event.preventDefault()
    setSavingWhatsapp(true)
    setWhatsappErrors({})

    try {
      const payload = {
        enabled: whatsappForm.enabled ? 1 : 0,
        provider: whatsappForm.provider,
        phoneId: whatsappForm.phoneId.trim(),
        token: whatsappForm.token.trim(),
        templatePronto: whatsappForm.templatePronto.trim(),
        templateConfirmacao: whatsappForm.templateConfirmacao.trim(),
      }
      const res = await api.put('/configuracoes/whatsapp', payload)
      applyWhatsappResponse(res.data)
      toast.success('Configuracao do WhatsApp salva')
    } catch (e) {
      const fieldErrors = e.response?.data?.errors
      if (fieldErrors) setWhatsappErrors(fieldErrors)
      toast.error(e.response?.data?.error || 'Erro ao salvar WhatsApp')
    } finally {
      setSavingWhatsapp(false)
    }
  }

  const runBackupManual = async () => {
    const ok = window.confirm('Gerar um backup local agora?')
    if (!ok) return

    setRunningBackup(true)
    try {
      const res = await api.post('/configuracoes/backups/manual')
      setBackupsInfo(res.data?.backups || null)
      setStatusMap((current) => ({ ...current, backups: res.data?.backups?.status || current.backups }))
      toast.success('Backup local gerado')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao gerar backup')
    } finally {
      setRunningBackup(false)
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

  const renderWhatsapp = () => (
    <div className="settings-stack">
      <form className="card card-pad" onSubmit={saveWhatsapp}>
        <div className="settings-section-head">
          <div>
            <h2>{active.label}</h2>
            <p className="text-muted">{active.desc}</p>
          </div>
          <StatusPill value={statusMap.whatsapp} />
        </div>

        {loadingWhatsapp ? (
          <div className="loading-center">
            <div className="spinner" />
            <span>Carregando WhatsApp...</span>
          </div>
        ) : (
          <>
            <div className="settings-info-grid">
              <InfoRow label="Origem" value={whatsappInfo?.origem === 'banco' ? 'Tela de configuracao' : whatsappInfo?.origem || 'env'} />
              <InfoRow label="Token" value={whatsappInfo?.tokenConfigurado ? 'Configurado' : 'Nao configurado'} />
              <InfoRow label="Atualizado em" value={whatsappInfo?.updatedat} />
            </div>

            <div className="form-grid-2">
              <Field label="Provedor" name="provider" form={whatsappForm} errors={whatsappErrors} onChange={setWhatsappField}>
                <select id="provider" className="form-input" value={whatsappForm.provider} onChange={(e) => setWhatsappField('provider', e.target.value)}>
                  <option value="meta">Meta Cloud API</option>
                </select>
              </Field>
              <Field label="Phone Number ID" name="phoneId" form={whatsappForm} errors={whatsappErrors} onChange={setWhatsappField} />
              <Field label="Novo token" name="token" form={whatsappForm} errors={whatsappErrors} onChange={setWhatsappField}>
                <input id="token" className="form-input" type="password" value={whatsappForm.token} onChange={(e) => setWhatsappField('token', e.target.value)} placeholder={whatsappInfo?.tokenConfigurado ? 'Deixe em branco para manter o atual' : 'Token permanente'} />
              </Field>
              <label className="settings-check">
                <input type="checkbox" checked={whatsappForm.enabled} onChange={(e) => setWhatsappField('enabled', e.target.checked)} />
                Envio automatico ativo
              </label>
              <Field label="Template OS pronta" name="templatePronto" form={whatsappForm} errors={whatsappErrors} onChange={setWhatsappField} />
              <Field label="Template confirmacao" name="templateConfirmacao" form={whatsappForm} errors={whatsappErrors} onChange={setWhatsappField} />
            </div>

            <div className="settings-actions">
              <button type="button" className="btn btn-ghost" onClick={loadWhatsapp} disabled={savingWhatsapp}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={savingWhatsapp}>
                <SavingLabel saving={savingWhatsapp} idle="Salvar WhatsApp" />
              </button>
            </div>
          </>
        )}
      </form>

      <div className="settings-planned-grid">
        <div className="settings-planned-item">
          <strong>OS pronta</strong>
          <span>Usa o template configurado quando a OS muda para Pronto.</span>
        </div>
        <div className="settings-planned-item">
          <strong>Confirmacao</strong>
          <span>Usa o template configurado no envio manual de confirmacao do pedido.</span>
        </div>
        <div className="settings-planned-item">
          <strong>Segredo protegido</strong>
          <span>O token pode ser trocado, mas nao aparece de volta na tela.</span>
        </div>
      </div>
    </div>
  )

  const renderBackups = () => {
    const local = backupsInfo?.local || {}
    const arquivos = local.arquivos || []
    const alertas = backupsInfo?.alertas || []
    const offsite = backupsInfo?.offsite || {}

    return (
      <div className="settings-stack">
        <div className="card card-pad">
          <div className="settings-section-head">
            <div>
              <h2>{active.label}</h2>
              <p className="text-muted">{active.desc}</p>
            </div>
            <StatusPill value={statusMap.backups} />
          </div>

          {loadingBackups ? (
            <div className="loading-center">
              <div className="spinner" />
              <span>Carregando backups...</span>
            </div>
          ) : (
            <>
              <div className="settings-info-grid">
                <InfoRow label="Ultimo backup" value={local.ultimo?.nome || 'Nenhum backup local'} />
                <InfoRow label="Tempo desde ultimo" value={local.horasDesdeUltimo === null || local.horasDesdeUltimo === undefined ? '-' : `${local.horasDesdeUltimo}h`} />
                <InfoRow label="Retencao local" value={`${local.total || 0}/${local.retencao || 7} arquivos`} />
              </div>

              <div className="settings-actions">
                <button type="button" className="btn btn-ghost" onClick={loadBackups} disabled={runningBackup}>Atualizar</button>
                <button type="button" className="btn btn-primary" onClick={runBackupManual} disabled={runningBackup}>
                  {runningBackup ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Gerando...</> : 'Gerar backup agora'}
                </button>
              </div>

              <div className="settings-planned-grid">
                {alertas.length === 0 ? (
                  <div className="settings-planned-item">
                    <strong>Alertas operacionais</strong>
                    <span>Nenhuma pendencia local detectada.</span>
                  </div>
                ) : alertas.map((alerta) => (
                  <div className="settings-planned-item" key={alerta.codigo}>
                    <strong>{alerta.nivel === 'critico' ? 'Critico' : 'Atencao'}: {alerta.codigo}</strong>
                    <span>{alerta.mensagem}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="settings-two-col">
          <div className="card card-pad">
            <div className="settings-section-head">
              <div>
                <h2>Arquivos locais</h2>
                <p className="text-muted">{local.proximaRotina || 'Rotina diaria local.'}</p>
              </div>
              <span className="badge badge-secondary">{arquivos.length} recentes</span>
            </div>
            <div className="settings-list">
              {arquivos.length === 0 ? (
                <div className="empty-state">Nenhum backup local encontrado.</div>
              ) : arquivos.map((file) => (
                <div className="settings-list-item" key={file.nome}>
                  <div>
                    <strong>{file.nome}</strong>
                    <span>{file.updatedat}</span>
                  </div>
                  <span className="badge badge-secondary">{formatBytes(file.bytes)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card card-pad">
            <div className="settings-section-head">
              <div>
                <h2>Backup offsite</h2>
                <p className="text-muted">Destino externo versionado antes de venda SaaS.</p>
              </div>
              <span className="badge badge-warning">{offsite.status || 'Pendente'}</span>
            </div>
            <div className="settings-planned-item">
              <strong>Proximo passo operacional</strong>
              <span>{offsite.missing?.includes('destino-offsite') ? 'Configurar copia diaria fora do servidor, como storage versionado, OneDrive empresarial ou S3.' : 'Destino offsite configurado.'}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderSeguranca = () => (
    <div className="settings-stack">
      <div className="card card-pad">
        <div className="settings-section-head">
          <div>
            <h2>{active.label}</h2>
            <p className="text-muted">{active.desc}</p>
          </div>
          <StatusPill value={statusMap.seguranca} />
        </div>

        {loadingSeguranca ? (
          <div className="loading-center">
            <div className="spinner" />
            <span>Carregando seguranca...</span>
          </div>
        ) : (
          <>
            <div className="settings-info-grid">
              <InfoRow label="Rate limit API" value={`${segurancaInfo?.politicas?.rateLimitGlobalPorMinuto || 60} req/min`} />
              <InfoRow label="Senha minima" value={`${segurancaInfo?.politicas?.senhaMinima || 8} caracteres`} />
              <InfoRow label="Sessao" value={`${segurancaInfo?.politicas?.sessaoHoras || 12}h`} />
            </div>
            <div className="settings-planned-grid">
              <div className="settings-planned-item">
                <strong>Auto-bloqueio admin</strong>
                <span>{segurancaInfo?.politicas?.protegeAutoDesativacaoAdmin ? 'Ativo: admin nao desativa nem troca o proprio perfil.' : 'Pendente'}</span>
              </div>
              <div className="settings-planned-item">
                <strong>Login por IP</strong>
                <span>{segurancaInfo?.politicas?.loginTentativasPorIp || 10} tentativas em {segurancaInfo?.politicas?.loginJanelaMinutos || 15} minutos.</span>
              </div>
              <div className="settings-planned-item">
                <strong>Pendencias</strong>
                <span>{(segurancaInfo?.pendencias || []).join(' | ') || 'Nenhuma pendencia critica.'}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )

  const renderSistema = () => (
    <div className="settings-stack">
      <div className="card card-pad">
        <div className="settings-section-head">
          <div>
            <h2>{active.label}</h2>
            <p className="text-muted">{active.desc}</p>
          </div>
          <StatusPill value={statusMap.sistema} />
        </div>

        {loadingSistema ? (
          <div className="loading-center">
            <div className="spinner" />
            <span>Carregando sistema...</span>
          </div>
        ) : (
          <>
            <div className="settings-info-grid">
              <InfoRow label="Versao" value={sistemaInfo?.app?.versao} />
              <InfoRow label="Node.js" value={sistemaInfo?.app?.node} />
              <InfoRow label="Ambiente" value={sistemaInfo?.app?.ambiente} />
              <InfoRow label="Plataforma" value={sistemaInfo?.app?.plataforma} />
              <InfoRow label="Timezone" value={sistemaInfo?.app?.timezone} />
              <InfoRow label="API" value={sistemaInfo?.servicos?.api} />
            </div>
            <div className="settings-planned-grid">
              {Object.entries(sistemaInfo?.servicos || {}).map(([key, value]) => (
                <div className="settings-planned-item" key={key}>
                  <strong>{key}</strong>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className="page-content-wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Configurações</h1>
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
          ) : activeSection === 'whatsapp' ? (
            renderWhatsapp()
          ) : activeSection === 'backups' ? (
            renderBackups()
          ) : activeSection === 'seguranca' ? (
            renderSeguranca()
          ) : activeSection === 'sistema' ? (
            renderSistema()
          ) : (
            null
          )}
        </section>
      </div>
    </div>
  )
}
