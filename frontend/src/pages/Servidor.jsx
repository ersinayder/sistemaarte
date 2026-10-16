import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  Server,
  HardDrive,
  Cpu,
  Database,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Download,
  Copy,
  Terminal,
  RotateCcw,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Search,
  FileCheck2,
  Play,
  Pause,
  AlertOctagon,
} from 'lucide-react';
import api from '../services/api';

const AUTO_REFRESH_OPTIONS = [
  { label: '5s', value: 5000 },
  { label: '10s (padrão)', value: 10000 },
  { label: '30s', value: 30000 },
  { label: 'Pausado', value: 0 },
];

export default function Servidor() {
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [status, setStatus] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Auto-refresh state
  const [refreshInterval, setRefreshInterval] = useState(10000);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Logs state
  const [logTipo, setLogTipo] = useState('error'); // 'error' | 'out'
  const [logLinesCount, setLogLinesCount] = useState(150);
  const [logSearch, setLogSearch] = useState('');
  const [logsData, setLogsData] = useState({ linhas: [], arquivo: '', existe: false, tamanhoFormatted: '0 B' });
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Action states
  const [modalRestartOpen, setModalRestartOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [runningBackup, setRunningBackup] = useState(false);
  const [testingSefaz, setTestingSefaz] = useState(false);
  const [sefazResult, setSefazResult] = useState(null);

  const logsEndRef = useRef(null);

  // Fetch server status
  const fetchStatus = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await api.get('/servidor/status', { skipGlobalErrorToast: true });
      setStatus(res.data);
      setLastUpdated(new Date());
    } catch (err) {
      if (isManual) {
        toast.error(err.response?.data?.error || 'Erro ao carregar métricas do servidor');
      }
    } finally {
      setLoadingStatus(false);
      if (isManual) setIsRefreshing(false);
    }
  }, []);

  // Fetch logs
  const fetchLogs = useCallback(async (tipo = logTipo, lines = logLinesCount, q = logSearch) => {
    setLoadingLogs(true);
    try {
      const params = { tipo, lines };
      if (q.trim()) params.q = q.trim();
      const res = await api.get('/servidor/logs', { params, skipGlobalErrorToast: true });
      setLogsData({
        linhas: res.data.linhas || [],
        arquivo: res.data.arquivo || '',
        existe: res.data.existe,
        tamanhoFormatted: res.data.tamanhoFormatted || '0 B',
      });
    } catch (err) {
      // Ignora erro silencioso no polling de logs
    } finally {
      setLoadingLogs(false);
    }
  }, [logTipo, logLinesCount, logSearch]);

  // Initial load
  useEffect(() => {
    fetchStatus();
    fetchLogs();
  }, [fetchStatus, fetchLogs]);

  // Polling interval
  useEffect(() => {
    if (!refreshInterval || restarting) return undefined;
    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs();
    }, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval, restarting, fetchStatus, fetchLogs]);

  // Action: Backup now
  const handleRunBackup = async () => {
    setRunningBackup(true);
    try {
      const res = await api.post('/backup');
      toast.success(res.data?.mensagem || 'Backup realizado com sucesso!');
      fetchStatus(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Falha ao executar backup.');
    } finally {
      setRunningBackup(false);
    }
  };

  // Action: Test SEFAZ
  const handleTestSefaz = async () => {
    setTestingSefaz(true);
    setSefazResult(null);
    try {
      const res = await api.get('/nfe/status-servico');
      setSefazResult({
        ok: true,
        duracao_ms: res.data?.duracao_ms,
        xMotivo: res.data?.status?.xMotivo || 'Serviço em Operação',
        cStat: res.data?.status?.cStat || '107',
      });
      toast.success(`SEFAZ Online (${res.data?.duracao_ms} ms)`);
    } catch (err) {
      const erroMsg = err.response?.data?.erro || err.message || 'Falha na comunicação';
      setSefazResult({
        ok: false,
        duracao_ms: err.response?.data?.duracao_ms,
        xMotivo: erroMsg,
      });
      toast.error(`SEFAZ Indisponível: ${erroMsg}`);
    } finally {
      setTestingSefaz(false);
    }
  };

  // Action: Restart backend with reconnect polling
  const handleRestartBackend = async () => {
    setModalRestartOpen(false);
    setRestarting(true);
    try {
      await api.post('/servidor/restart');
      toast('Sinal de reinício enviado. Reconectando...', { icon: '⏳' });

      // Espera 2.5s antes de começar a pingar /api/health
      setTimeout(() => {
        let attempts = 0;
        const checkHealth = setInterval(async () => {
          attempts += 1;
          try {
            const h = await api.get('/health', { skipGlobalErrorToast: true });
            if (h.data?.ok) {
              clearInterval(checkHealth);
              setRestarting(false);
              toast.success('Servidor reiniciado e operacional! ✅');
              fetchStatus(true);
              fetchLogs();
            }
          } catch (_) {
            if (attempts > 30) {
              clearInterval(checkHealth);
              setRestarting(false);
              toast.error('O servidor demorou para responder. Verifique manualmente se necessário.');
            }
          }
        }, 1500);
      }, 2500);
    } catch (err) {
      setRestarting(false);
      toast.error(err.response?.data?.error || 'Falha ao solicitar reinício.');
    }
  };

  // Logs actions
  const handleCopyLogs = () => {
    const text = logsData.linhas.join('\n');
    if (!text) return toast.error('Nenhum log para copiar.');
    navigator.clipboard.writeText(text);
    toast.success(`${logsData.linhas.length} linhas copiadas!`);
  };

  const handleDownloadLogs = () => {
    const text = logsData.linhas.join('\n');
    if (!text) return toast.error('Nenhum log para baixar.');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${logTipo === 'error' ? 'sistemaarte-error' : 'sistemaarte-out'}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Download do log iniciado.');
  };

  const sys = status?.system;
  const db = status?.database;
  const bk = status?.backups;
  const fis = status?.fiscal;
  const alertas = status?.alertas || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBottom: 'var(--space-8)' }}>
      {/* Header com Uptime e Controles */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        borderBottom: '1px solid var(--color-divider)',
        paddingBottom: 'var(--space-3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{
            width: 42,
            height: 42,
            borderRadius: 'var(--radius-lg)',
            background: 'color-mix(in oklch, var(--color-primary) 15%, transparent)',
            color: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Server size={22} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--color-text)' }}>
              Painel do Servidor
            </h1>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {sys?.os?.hostname ? `${sys.os.hostname} · ${sys.os.platform} (${sys.os.release})` : 'Servidor · Infraestrutura'}
              {sys?.os?.uptimeFormatted && ` · Uptime SO: ${sys.os.uptimeFormatted}`}
            </span>
          </div>
        </div>

        {/* Controles de auto-refresh e atualização */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            <span>Atualização:</span>
            <select
              className="form-input"
              value={refreshInterval}
              onChange={e => setRefreshInterval(Number(e.target.value))}
              style={{ height: 32, fontSize: 'var(--text-xs)', padding: '2px 8px' }}
            >
              {AUTO_REFRESH_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { fetchStatus(true); fetchLogs(); }}
            disabled={isRefreshing || restarting}
            title="Atualizar dados agora"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} className={isRefreshing ? 'spinner' : ''} />
            {isRefreshing ? 'Atualizando...' : 'Atualizar'}
          </button>

          {lastUpdated && (
            <span style={{ fontSize: 11, color: 'var(--color-text-faint)', marginLeft: 4 }}>
              Às {lastUpdated.toLocaleTimeString('pt-BR')}
            </span>
          )}
        </div>
      </div>

      {/* Overlay de Reinício em Andamento */}
      {restarting && (
        <div className="card" style={{
          background: 'color-mix(in oklch, var(--color-warning) 12%, var(--color-surface))',
          borderColor: 'var(--color-warning)',
          padding: 'var(--space-4)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}>
          <div className="spinner" style={{ width: 22, height: 22, borderColor: 'var(--color-warning)', borderTopColor: 'transparent' }} />
          <div>
            <strong style={{ color: 'var(--color-warning)', display: 'block' }}>Reiniciando o backend do servidor...</strong>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text)' }}>
              Aguardando o serviço subir e restabelecer a conexão. A tela reconectará automaticamente.
            </span>
          </div>
        </div>
      )}

      {/* Banners Proativos de Alerta */}
      {alertas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {alertas.map(al => (
            <div
              key={al.id}
              className="card"
              style={{
                padding: 'var(--space-3) var(--space-4)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                borderColor: al.nivel === 'critico' ? 'var(--color-error)' : 'var(--color-warning)',
                background: al.nivel === 'critico'
                  ? 'color-mix(in oklch, var(--color-error) 10%, var(--color-surface))'
                  : 'color-mix(in oklch, var(--color-warning) 10%, var(--color-surface))',
              }}
            >
              <AlertTriangle size={18} color={al.nivel === 'critico' ? 'var(--color-error)' : 'var(--color-warning)'} />
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 'var(--text-xs)', color: al.nivel === 'critico' ? 'var(--color-error)' : 'var(--color-warning)' }}>
                  {al.titulo}:
                </strong>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text)', marginLeft: 6 }}>
                  {al.mensagem}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grid de Métricas Principais */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 'var(--space-4)',
      }}>
        {/* 1. Servidor Host (RAM e Disco) */}
        <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Cpu size={18} color="var(--color-primary)" />
              <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>Host & Recursos</strong>
            </div>
            <span className="badge badge-secondary" style={{ fontSize: 10 }}>
              {sys?.os?.platform === 'linux' ? 'Linux' : (sys?.os?.platform === 'win32' ? 'Windows Server' : (sys?.os?.platform || 'Servidor'))}
            </span>
          </div>

          {/* Carga CPU */}
          {sys?.cpu && (
            <div style={{ fontSize: 'var(--text-xs)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Carga CPU ({sys.cpu.cores} {sys.cpu.cores === 1 ? 'core' : 'cores'}):</span>
              <strong>{sys.cpu.loadFormatted}</strong>
            </div>
          )}

          {/* Memória RAM */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', marginBottom: 4 }}>
              <span>Memória RAM: <strong>{sys?.ram?.percentUsed ?? 0}%</strong></span>
              <span style={{ color: 'var(--color-text-muted)' }}>{sys?.ram?.usedFormatted} / {sys?.ram?.totalFormatted}</span>
            </div>
            <div style={{ height: 8, background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, sys?.ram?.percentUsed || 0)}%`,
                background: sys?.ram?.alert ? 'var(--color-error)' : 'var(--color-primary)',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>

          {/* Disco */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', marginBottom: 4 }}>
              <span>Disco ({sys?.disk?.drive || (sys?.os?.platform === 'win32' ? 'C:' : '/')}): <strong>{sys?.disk?.percentUsed ?? 0}% em uso</strong></span>
              <span style={{ color: 'var(--color-text-muted)' }}>{sys?.disk?.freeFormatted} livres</span>
            </div>
            <div style={{ height: 8, background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, sys?.disk?.percentUsed || 0)}%`,
                background: sys?.disk?.alert ? 'var(--color-error)' : 'var(--color-success)',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--color-text-faint)', paddingTop: 4, borderTop: '1px solid var(--color-divider)' }}>
            Node.js: {sys?.node?.version} · PID: {sys?.node?.pid} · Heap: {sys?.node?.heapUsedFormatted}
          </div>
        </div>

        {/* 2. Processo Backend PM2 */}
        <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Server size={18} color="var(--color-success)" />
              <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>Processo Backend (PM2)</strong>
            </div>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(34,197,94,0.15)',
              color: 'var(--color-success)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
              Online
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', fontSize: 'var(--text-xs)' }}>
            <div>
              <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Serviço</span>
              <strong style={{ color: 'var(--color-text)' }}>{sys?.pm2?.name || 'sistemaarte-backend'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Restarts</span>
              <strong style={{ color: 'var(--color-text)' }}>{sys?.pm2?.restart_time ?? 0}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Uptime Processo</span>
              <strong style={{ color: 'var(--color-text)' }}>{sys?.node?.uptimeFormatted || '—'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Memória RSS</span>
              <strong style={{ color: 'var(--color-text)' }}>{sys?.node?.rssFormatted || '—'}</strong>
            </div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 'var(--space-2)' }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setModalRestartOpen(true)}
              disabled={restarting}
              style={{ width: '100%', borderColor: 'var(--color-warning)', color: 'var(--color-warning)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <RotateCcw size={14} />
              Reiniciar Backend
            </button>
          </div>
        </div>

        {/* 3. Banco de Dados SQLite */}
        <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Database size={18} color="var(--color-primary)" />
              <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>SQLite (oficina.db)</strong>
            </div>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 'var(--radius-full)',
              background: db?.integridadeOk ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              color: db?.integridadeOk ? 'var(--color-success)' : 'var(--color-error)',
            }}>
              {db?.integridadeOk ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
              Integridade: {db?.integridade}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', fontSize: 'var(--text-xs)' }}>
            <div>
              <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Tamanho Principal</span>
              <strong style={{ color: 'var(--color-text)' }}>{db?.tamanhoDbFormatted || '0 B'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Tamanho WAL</span>
              <strong style={{ color: 'var(--color-text)' }}>{db?.tamanhoWalFormatted || '0 B'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Ordens Ativas</span>
              <strong style={{ color: 'var(--color-text)' }}>{db?.contagens?.ordens ?? 0}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Clientes</span>
              <strong style={{ color: 'var(--color-text)' }}>{db?.contagens?.clientes ?? 0}</strong>
            </div>
          </div>

          <div style={{ marginTop: 'auto', fontSize: 11, color: 'var(--color-text-faint)', paddingTop: 4, borderTop: '1px solid var(--color-divider)' }}>
            Total ocupado em disco: <strong>{db?.tamanhoTotalFormatted || '—'}</strong>
          </div>
        </div>

        {/* 4. Backups Locais */}
        <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <FileCheck2 size={18} color="var(--color-primary)" />
              <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>Rotina de Backups</strong>
            </div>
            <span className="badge badge-secondary" style={{ fontSize: 10 }}>Diário às 02h</span>
          </div>

          <div style={{ fontSize: 'var(--text-xs)' }}>
            <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Último Backup Local</span>
            <strong style={{ color: 'var(--color-text)', display: 'block' }}>
              {bk?.ultimoBackup?.datahora ? new Date(bk.ultimoBackup.datahora).toLocaleString('pt-BR') : 'Nenhum backup registrado'}
            </strong>
            {bk?.ultimoBackup && (
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                {bk.ultimoBackup.arquivo} ({bk.ultimoBackup.tamanho})
              </span>
            )}
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 'var(--space-2)' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleRunBackup}
              disabled={runningBackup}
              style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Download size={14} className={runningBackup ? 'spinner' : ''} />
              {runningBackup ? 'Gerando Backup...' : 'Fazer Backup Agora'}
            </button>
          </div>
        </div>

        {/* 5. SEFAZ & NF-e */}
        <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <ShieldCheck size={18} color="var(--color-primary)" />
              <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>NF-e & SEFAZ</strong>
            </div>
            <span className={`badge ${fis?.ambienteNum === 1 ? 'badge-primary' : 'badge-warning'}`} style={{ fontSize: 10 }}>
              {fis?.ambiente || 'Homologação'}
            </span>
          </div>

          <div style={{ fontSize: 'var(--text-xs)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div>
              <span style={{ color: 'var(--color-text-muted)' }}>Certificado A1: </span>
              <strong>{fis?.certificadoConfigurado ? (fis.certificadoNome || 'Configurado') : 'Não configurado'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-muted)' }}>Série / Próximo Nº: </span>
              <strong>{fis?.serie || '1'} / {fis?.proximoNumero || '—'}</strong>
            </div>
            {sefazResult && (
              <div style={{
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 11,
                background: sefazResult.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                color: sefazResult.ok ? 'var(--color-success)' : 'var(--color-error)',
              }}>
                {sefazResult.ok ? `SEFAZ Online (${sefazResult.duracao_ms} ms) - ${sefazResult.xMotivo}` : sefazResult.xMotivo}
              </div>
            )}
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 'var(--space-2)' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleTestSefaz}
              disabled={testingSefaz}
              style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <RefreshCw size={14} className={testingSefaz ? 'spinner' : ''} />
              {testingSefaz ? 'Consultando SEFAZ...' : 'Testar Conexão SEFAZ'}
            </button>
          </div>
        </div>
      </div>

      {/* Terminal de Logs do PM2 */}
      <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          borderBottom: '1px solid var(--color-divider)',
          paddingBottom: 'var(--space-3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Terminal size={18} color="var(--color-primary)" />
            <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>Console de Logs do Backend</strong>
          </div>

          {/* Abas Erro / Saída */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => { setLogTipo('error'); fetchLogs('error', logLinesCount, logSearch); }}
                style={{
                  padding: '4px 12px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  background: logTipo === 'error' ? 'var(--color-error)' : 'transparent',
                  color: logTipo === 'error' ? '#fff' : 'var(--color-text-muted)',
                }}
              >
                Erros (stderr)
              </button>
              <button
                type="button"
                onClick={() => { setLogTipo('out'); fetchLogs('out', logLinesCount, logSearch); }}
                style={{
                  padding: '4px 12px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  background: logTipo === 'out' ? 'var(--color-primary)' : 'transparent',
                  color: logTipo === 'out' ? '#fff' : 'var(--color-text-muted)',
                }}
              >
                Saída Geral (stdout)
              </button>
            </div>

            {/* Linhas selector */}
            <select
              className="form-input"
              value={logLinesCount}
              onChange={e => {
                const lines = Number(e.target.value);
                setLogLinesCount(lines);
                fetchLogs(logTipo, lines, logSearch);
              }}
              style={{ height: 30, fontSize: 11, padding: '2px 6px' }}
            >
              <option value={50}>50 linhas</option>
              <option value={150}>150 linhas</option>
              <option value={300}>300 linhas</option>
            </select>
          </div>
        </div>

        {/* Barra de busca e ações de log */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 200, maxWidth: 360 }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                className="form-input"
                placeholder="Filtrar texto no log..."
                value={logSearch}
                onChange={e => {
                  setLogSearch(e.target.value);
                  fetchLogs(logTipo, logLinesCount, e.target.value);
                }}
                style={{ paddingLeft: 28, height: 30, fontSize: 11, width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>
              {logsData.linhas.length} linhas ({logsData.tamanhoFormatted})
            </span>
            <button className="btn btn-ghost btn-sm" onClick={handleCopyLogs} title="Copiar logs para área de transferência" style={{ padding: '4px 8px' }}>
              <Copy size={14} />
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleDownloadLogs} title="Baixar arquivo de log .txt" style={{ padding: '4px 8px' }}>
              <Download size={14} />
            </button>
          </div>
        </div>

        {/* Visualizador estilo Terminal */}
        <div style={{
          background: 'oklch(0.12 0.01 260)',
          color: '#E2E8F0',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: 11,
          lineHeight: '1.5',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3)',
          maxHeight: 420,
          overflowY: 'auto',
          border: '1px solid var(--color-border)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {loadingLogs ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-muted)' }}>
              <div className="spinner" style={{ width: 16, height: 16, display: 'inline-block', marginRight: 8 }} />
              Carregando logs...
            </div>
          ) : logsData.linhas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-muted)' }}>
              Nenhuma linha de log encontrada {logSearch ? `com o filtro "${logSearch}"` : ''}.
            </div>
          ) : (
            logsData.linhas.map((line, idx) => {
              const isError = /error|falha|fail|rejeicao|unique constraint/i.test(line);
              const isWarn = /warn|atencao/i.test(line);
              return (
                <div
                  key={idx}
                  style={{
                    color: isError ? '#F87171' : isWarn ? '#FBBF24' : '#E2E8F0',
                    padding: '1px 0',
                  }}
                >
                  <span style={{ color: 'rgba(255,255,255,0.25)', userSelect: 'none', marginRight: 8, display: 'inline-block', minWidth: 28, textAlign: 'right' }}>
                    {idx + 1}
                  </span>
                  {line}
                </div>
              );
            })
          )}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* Modal de Confirmação: Reiniciar Backend */}
      {modalRestartOpen && (
        <div className="modal-backdrop" onClick={() => setModalRestartOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertOctagon size={20} color="var(--color-warning)" />
                <h3 style={{ margin: 0, fontSize: 'var(--text-base)' }}>Confirmar Reinício do Backend</h3>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModalRestartOpen(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              <p>
                Tem certeza que deseja reiniciar o processo do backend (<strong>sistemaarte-backend</strong>)?
              </p>
              <div style={{ padding: 'var(--space-3)', background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-2)' }}>
                ℹ️ O serviço ficará indisponível por aproximadamente 2 a 4 segundos enquanto o PM2 reinicia o processo. A tela reconectará automaticamente assim que o servidor voltar.
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalRestartOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleRestartBackend} style={{ background: 'var(--color-warning)', color: '#000', borderColor: 'var(--color-warning)' }}>
                Sim, Reiniciar Backend
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
