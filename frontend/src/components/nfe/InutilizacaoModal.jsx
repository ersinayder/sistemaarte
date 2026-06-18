import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, FileText, ShieldAlert, X } from 'lucide-react'
import api from '../../services/api'

const ANO_MINIMO = 2006
const NUMERO_MAXIMO = 999999999
const LIMITE_FAIXA = 10000

function criarIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `inut-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function extrairLista(data) {
  if (Array.isArray(data)) return data
  return data?.inutilizacoes || data?.registros || []
}

function extrairRegistro(data) {
  return data?.inutilizacao || data?.registro || data
}

function valorContexto(contexto, ...chaves) {
  for (const chave of chaves) {
    if (contexto?.[chave] !== undefined && contexto?.[chave] !== null) {
      return contexto[chave]
    }
  }
  return ''
}

function numeroRegistro(registro, tipo) {
  return Number(valorContexto(
    registro,
    tipo === 'inicial' ? 'numero_inicial' : 'numero_final',
    tipo === 'inicial' ? 'numeroInicial' : 'numeroFinal'
  ))
}

function faixaRegistro(registro) {
  const inicio = numeroRegistro(registro, 'inicial')
  const fim = numeroRegistro(registro, 'final')
  return inicio === fim ? String(inicio) : `${inicio}-${fim}`
}

function fraseConfirmacao(inicio, fim) {
  if (!Number.isInteger(inicio) || !Number.isInteger(fim)) return ''
  return inicio === fim ? `INUTILIZAR ${inicio}` : `INUTILIZAR ${inicio}-${fim}`
}

function formatarData(data) {
  if (!data) return '-'
  const parsed = new Date(data)
  if (Number.isNaN(parsed.getTime())) return data
  return parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function mensagemErro(error) {
  return error?.response?.data?.erro
    || error?.response?.data?.error
    || error?.response?.data?.message
    || 'Nao foi possivel concluir a inutilizacao.'
}

function validarFormulario({ ano, inicio, fim, justificativa, confirmacao }) {
  const anoAtual = new Date().getFullYear()
  const erros = {}
  const quantidade = Number.isInteger(inicio) && Number.isInteger(fim) && fim >= inicio
    ? fim - inicio + 1
    : 0

  if (!Number.isInteger(ano) || ano < ANO_MINIMO || ano > anoAtual) {
    erros.ano = `O ano deve estar entre ${ANO_MINIMO} e ${anoAtual}.`
  }
  if (!Number.isInteger(inicio) || inicio < 1 || inicio > NUMERO_MAXIMO) {
    erros.inicio = `O numero inicial deve estar entre 1 e ${NUMERO_MAXIMO}.`
  }
  if (!Number.isInteger(fim) || fim < 1 || fim > NUMERO_MAXIMO) {
    erros.fim = `O numero final deve estar entre 1 e ${NUMERO_MAXIMO}.`
  } else if (Number.isInteger(inicio) && fim < inicio) {
    erros.fim = 'O numero final deve ser maior ou igual ao numero inicial.'
  } else if (quantidade > LIMITE_FAIXA) {
    erros.fim = `A faixa pode conter no maximo ${LIMITE_FAIXA} numeros.`
  }

  const justificativaLimpa = justificativa.trim()
  if (justificativaLimpa.length < 15 || justificativaLimpa.length > 255) {
    erros.justificativa = 'A justificativa deve ter entre 15 e 255 caracteres.'
  }

  const frase = fraseConfirmacao(inicio, fim)
  if (!frase || confirmacao !== frase) {
    erros.confirmacao = 'Digite exatamente a frase de confirmacao exibida.'
  }

  return { erros, quantidade, frase, valido: Object.keys(erros).length === 0 }
}

function XmlLinks({ registro, rotuloFaixa }) {
  if (!registro?.id) return null
  const temEnvio = Boolean(valorContexto(registro, 'tem_xml_envio', 'temXmlEnvio'))
  const temRetorno = Boolean(valorContexto(registro, 'tem_xml_retorno', 'temXmlRetorno'))
  if (!temEnvio && !temRetorno) return null
  return (
    <span style={{ display: 'inline-flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
      {temEnvio && (
        <a
          href={`/api/nfe/inutilizacoes/${registro.id}/xml/envio`}
          aria-label={`XML de envio da faixa ${rotuloFaixa}`}
          className="btn btn-ghost btn-sm"
          download
        >
          <FileText size={14} /> XML de envio
        </a>
      )}
      {temRetorno && (
        <a
          href={`/api/nfe/inutilizacoes/${registro.id}/xml/retorno`}
          aria-label={`XML de retorno da faixa ${rotuloFaixa}`}
          className="btn btn-ghost btn-sm"
          download
        >
          <FileText size={14} /> XML de retorno
        </a>
      )}
    </span>
  )
}

function Historico({ registros, carregando }) {
  if (carregando) {
    return <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Carregando historico...</div>
  }
  if (!registros.length) {
    return <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Nenhuma inutilizacao registrada.</div>
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      {registros.map((registro) => {
        const faixa = faixaRegistro(registro)
        const usuario = valorContexto(registro, 'solicitado_por_nome', 'solicitadoPorNome', 'usuario_nome') || '-'
        return (
          <article
            key={registro.id}
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3)',
              display: 'grid',
              gap: 'var(--space-2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <strong>{faixa}</strong>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase' }}>
                {registro.status}
              </span>
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Ano {registro.ano} | Serie {registro.serie} | Ambiente {registro.ambiente} | {usuario} | {formatarData(valorContexto(registro, 'solicitado_em', 'solicitadoEm'))}
            </div>
            <div style={{ fontSize: 'var(--text-sm)' }}>{registro.justificativa}</div>
            {registro.protocolo && (
              <div style={{ fontSize: 'var(--text-xs)' }}><strong>Protocolo:</strong> {registro.protocolo}</div>
            )}
            <XmlLinks registro={registro} rotuloFaixa={faixa} />
          </article>
        )
      })}
    </div>
  )
}

export default function InutilizacaoModal({ open, onClose, onSuccess }) {
  const [contexto, setContexto] = useState(null)
  const [historico, setHistorico] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [erroCarga, setErroCarga] = useState('')
  const [ano, setAno] = useState('')
  const [numeroInicial, setNumeroInicial] = useState('')
  const [numeroFinal, setNumeroFinal] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [erroEnvio, setErroEnvio] = useState('')
  const [incerto, setIncerto] = useState(false)
  const tentativaRef = useRef({ assinatura: '', chave: '' })

  useEffect(() => {
    if (!open) return undefined

    let ativo = true
    setContexto(null)
    setHistorico([])
    setErroCarga('')
    setAno('')
    setNumeroInicial('')
    setNumeroFinal('')
    setJustificativa('')
    setConfirmacao('')
    setResultado(null)
    setErroEnvio('')
    setIncerto(false)
    setCarregando(true)
    tentativaRef.current = { assinatura: '', chave: '' }

    Promise.all([
      api.get('/nfe/inutilizacoes/contexto', { skipGlobalErrorToast: true }),
      api.get('/nfe/inutilizacoes', { skipGlobalErrorToast: true }),
    ]).then(([contextoResponse, historicoResponse]) => {
      if (!ativo) return
      const proximoContexto = contextoResponse.data || {}
      setContexto(proximoContexto)
      setAno(String(valorContexto(proximoContexto, 'anoSugerido', 'ano_sugerido') || new Date().getFullYear()))
      setHistorico(extrairLista(historicoResponse.data))
    }).catch((error) => {
      if (ativo) setErroCarga(mensagemErro(error))
    }).finally(() => {
      if (ativo) setCarregando(false)
    })

    return () => {
      ativo = false
    }
  }, [open])

  const inicioNumero = numeroInicial === '' ? Number.NaN : Number(numeroInicial)
  const fimNumero = numeroFinal === '' ? Number.NaN : Number(numeroFinal)
  const anoNumero = ano === '' ? Number.NaN : Number(ano)
  const validacao = useMemo(
    () => validarFormulario({
      ano: anoNumero,
      inicio: inicioNumero,
      fim: fimNumero,
      justificativa,
      confirmacao,
    }),
    [anoNumero, inicioNumero, fimNumero, justificativa, confirmacao]
  )

  if (!open) return null

  const handleClose = () => {
    if (!enviando) onClose?.()
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validacao.valido || enviando || incerto || !contexto) return

    const payloadBase = {
      ano: anoNumero,
      numeroInicial: inicioNumero,
      numeroFinal: fimNumero,
      justificativa: justificativa.trim(),
      confirmacao,
    }
    const assinatura = JSON.stringify(payloadBase)
    if (tentativaRef.current.assinatura !== assinatura) {
      tentativaRef.current = { assinatura, chave: criarIdempotencyKey() }
    }

    setEnviando(true)
    setErroEnvio('')
    setResultado(null)
    try {
      const response = await api.post(
        '/nfe/inutilizacoes',
        { ...payloadBase, idempotencyKey: tentativaRef.current.chave },
        { timeout: 80000, skipGlobalErrorToast: true }
      )
      const registro = {
        ano: anoNumero,
        serie,
        numero_inicial: inicioNumero,
        numero_final: fimNumero,
        justificativa: justificativa.trim(),
        ...extrairRegistro(response.data),
      }
      setResultado(registro)
      onSuccess?.(registro)
    } catch (error) {
      if (error?.response?.status === 504) {
        setIncerto(true)
        setErroEnvio(`Resultado incerto: ${mensagemErro(error)} Nao reenvie esta faixa ate consultar a SEFAZ.`)
        const registro = extrairRegistro(error.response?.data)
        if (registro?.id) {
          setHistorico((atual) => [registro, ...atual.filter((item) => item.id !== registro.id)])
        }
      } else if (error?.response?.status === 422) {
        const registro = extrairRegistro(error.response?.data)
        if (registro?.id) {
          const rejeicao = {
            ano: anoNumero,
            serie,
            numero_inicial: inicioNumero,
            numero_final: fimNumero,
            justificativa: justificativa.trim(),
            ...registro,
          }
          setResultado(rejeicao)
          onSuccess?.(rejeicao)
        } else {
          setErroEnvio(mensagemErro(error))
        }
      } else {
        setErroEnvio(mensagemErro(error))
      }
    } finally {
      setEnviando(false)
    }
  }

  const ambiente = valorContexto(contexto, 'ambienteLabel', 'ambiente_label')
    || (Number(contexto?.ambiente) === 1 ? 'Producao' : Number(contexto?.ambiente) === 2 ? 'Homologacao' : '')
  const cnpj = valorContexto(contexto, 'cnpj', 'cnpjMascarado', 'cnpj_mascarado')
  const modelo = valorContexto(contexto, 'modelo') || '55'
  const serie = valorContexto(contexto, 'serie')
  const ultimoNumero = valorContexto(contexto, 'ultimoNumero', 'ultimo_numero')
  const avisoPrazo = valorContexto(contexto, 'avisoPrazo', 'aviso_prazo')
  const faixaAtual = fraseConfirmacao(inicioNumero, fimNumero).replace('INUTILIZAR ', '')
  const statusResultado = String(resultado?.status || '').toLowerCase()
  const resultadoAutorizado = statusResultado === 'autorizado'
  const resultadoIncerto = statusResultado === 'incerto'
  const resultadoTitulo = resultadoAutorizado
    ? 'Inutilizacao autorizada'
    : resultadoIncerto
      ? 'Inutilizacao incerta'
      : 'Inutilizacao rejeitada'
  const resultadoBorda = resultadoAutorizado
    ? 'var(--color-success)'
    : resultadoIncerto
      ? 'var(--color-warning, var(--color-border-strong))'
      : 'var(--color-danger)'
  const resultadoFundo = resultadoAutorizado
    ? 'var(--color-success-highlight, var(--color-surface-offset))'
    : 'var(--color-surface-offset)'

  return (
    <div
      className="modal-overlay"
      data-testid="inutilizacao-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose()
      }}
    >
      <section
        className="modal modal-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inutilizacao-titulo"
      >
        <header className="modal-header">
          <div>
            <h2 id="inutilizacao-titulo" style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Inutilizar numeracao NF-e</h2>
            <p style={{ margin: '2px 0 0', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
              Operacao fiscal administrativa e irreversivel
            </p>
          </div>
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            onClick={handleClose}
            disabled={enviando}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--space-3)',
              padding: 'var(--space-3)',
              border: '1px solid var(--color-error)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-error-highlight, var(--color-surface-offset))',
            }}
          >
            <ShieldAlert size={20} aria-hidden="true" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
              <strong>Isto nao cancela uma NF-e.</strong> A inutilizacao declara que os numeros informados nao foram e nao serao usados. Depois de autorizada, nao pode ser desfeita.
            </div>
          </div>

          {carregando && (
            <div style={{ minHeight: 120, display: 'grid', placeItems: 'center', color: 'var(--color-text-muted)' }}>
              <span><span className="spinner" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 8 }} />Carregando contexto fiscal...</span>
            </div>
          )}

          {erroCarga && <div role="alert" className="form-error">{erroCarga}</div>}

          {!carregando && contexto && (
            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 'var(--space-4)' }}>
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend style={{ fontWeight: 800, fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>Contexto fiscal</legend>
                <div className="form-grid-2">
                  <label className="form-group">
                    <span className="form-label">Ambiente</span>
                    <input className="form-input" value={ambiente} readOnly />
                  </label>
                  <label className="form-group">
                    <span className="form-label">CNPJ emitente</span>
                    <input className="form-input" value={cnpj} readOnly />
                  </label>
                  <label className="form-group">
                    <span className="form-label">Modelo</span>
                    <input className="form-input" value={modelo} readOnly />
                  </label>
                  <label className="form-group">
                    <span className="form-label">Serie</span>
                    <input className="form-input" value={serie} readOnly />
                  </label>
                </div>
                <div style={{ marginTop: 'var(--space-2)', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
                  Ultimo numero conhecido: {ultimoNumero || '-'}
                  {avisoPrazo && <> | {avisoPrazo}</>}
                </div>
              </fieldset>

              <fieldset disabled={enviando || Boolean(resultado)} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 'var(--space-3)' }}>
                <legend style={{ fontWeight: 800, fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>Faixa a inutilizar</legend>
                <div className="form-grid-2">
                  <label className="form-group">
                    <span className="form-label">Ano</span>
                    <input
                      className="form-input"
                      type="number"
                      min={ANO_MINIMO}
                      max={new Date().getFullYear()}
                      value={ano}
                      onChange={(event) => setAno(event.target.value)}
                    />
                    {validacao.erros.ano && <span className="form-error">{validacao.erros.ano}</span>}
                  </label>
                  <div />
                  <label className="form-group">
                    <span className="form-label">Numero inicial</span>
                    <input
                      className="form-input"
                      type="number"
                      min="1"
                      max={NUMERO_MAXIMO}
                      value={numeroInicial}
                      onChange={(event) => setNumeroInicial(event.target.value)}
                    />
                    {validacao.erros.inicio && <span className="form-error">{validacao.erros.inicio}</span>}
                  </label>
                  <label className="form-group">
                    <span className="form-label">Numero final</span>
                    <input
                      className="form-input"
                      type="number"
                      min="1"
                      max={NUMERO_MAXIMO}
                      value={numeroFinal}
                      onChange={(event) => setNumeroFinal(event.target.value)}
                    />
                    {validacao.erros.fim && <span className="form-error">{validacao.erros.fim}</span>}
                  </label>
                </div>

                {validacao.quantidade > 0 && (
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>
                    Faixa {faixaAtual}: {validacao.quantidade} {validacao.quantidade === 1 ? 'numero' : 'numeros'}
                  </div>
                )}

                <label className="form-group">
                  <span className="form-label">Justificativa</span>
                  <textarea
                    className="form-input"
                    rows="3"
                    maxLength="255"
                    value={justificativa}
                    onChange={(event) => setJustificativa(event.target.value)}
                    placeholder="Descreva a causa tecnica da quebra de sequencia."
                  />
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
                    {justificativa.trim().length}/255 caracteres
                  </span>
                  {validacao.erros.justificativa && <span className="form-error">{validacao.erros.justificativa}</span>}
                </label>

                <div
                  style={{
                    padding: 'var(--space-3)',
                    border: '1px solid var(--color-warning)',
                    borderRadius: 'var(--radius-md)',
                    display: 'grid',
                    gap: 'var(--space-2)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                    <AlertTriangle size={17} aria-hidden="true" />
                    Digite exatamente: <strong>{validacao.frase || 'INUTILIZAR numero-faixa'}</strong>
                  </div>
                  <label className="form-group">
                    <span className="form-label">Confirmacao</span>
                    <input
                      className="form-input"
                      autoComplete="off"
                      value={confirmacao}
                      onChange={(event) => setConfirmacao(event.target.value)}
                    />
                    {confirmacao && validacao.erros.confirmacao && (
                      <span className="form-error">{validacao.erros.confirmacao}</span>
                    )}
                  </label>
                </div>
              </fieldset>

              {erroEnvio && <div role="alert" className="form-error" style={{ fontSize: 'var(--text-sm)' }}>{erroEnvio}</div>}

              {resultado && (
                <div
                  role="status"
                  style={{
                    border: `1px solid ${resultadoBorda}`,
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-4)',
                    background: resultadoFundo,
                    display: 'grid',
                    gap: 'var(--space-2)',
                  }}
                >
                  <strong>{resultadoTitulo}</strong>
                  <span>Protocolo: <strong>{resultado.protocolo || '-'}</strong></span>
                  <span>cStat {valorContexto(resultado, 'cstat', 'cStat') || '-'} | {formatarData(valorContexto(resultado, 'concluido_em', 'concluidoEm'))}</span>
                  {!resultadoAutorizado && resultado.motivo && <span>{resultado.motivo}</span>}
                  <XmlLinks registro={resultado} rotuloFaixa={faixaAtual} />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost" onClick={handleClose} disabled={enviando}>
                  {resultado ? 'Fechar' : 'Voltar'}
                </button>
                {!resultado && (
                  <button
                    type="submit"
                    className="btn btn-danger"
                    disabled={!validacao.valido || enviando || incerto}
                  >
                    {enviando ? 'Enviando...' : 'Inutilizar numeracao'}
                  </button>
                )}
              </div>
            </form>
          )}

          <section aria-labelledby="historico-inutilizacao-titulo" style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <h3 id="historico-inutilizacao-titulo" style={{ margin: 0, fontSize: 'var(--text-base)' }}>Historico de inutilizacoes</h3>
            <Historico registros={historico} carregando={carregando} />
          </section>
        </div>
      </section>
    </div>
  )
}
