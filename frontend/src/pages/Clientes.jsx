import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { buscarEnderecoPorCep, maskCep, onlyCepDigits } from '../utils/cep';
import {
  getDocumentoInputState,
  maskCNPJ,
  maskCPF,
  normalizeCnpj,
  onlyDigits,
  validaCNPJ,
  validaCPF,
} from '../utils/documentos';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const documentoTipo = (documento, ie = '') => {
  const normalized = normalizeCnpj(documento);
  if (/[A-Z]/.test(normalized) || normalized.length > 11 || (!normalized && ie)) return 'PJ';
  return 'PF';
};
const documentoLabel = documento => documentoTipo(documento) === 'PJ' ? 'CNPJ' : 'CPF';

const STATUS_COLOR = {
  'Recebido':    'var(--status-aguardando)',
  'Aguardando':  'var(--status-aguardando)',
  'Em Produção': 'var(--status-producao)',
  'Pronto':      'var(--status-pronto)',
  'Entregue':    'var(--status-entregue)',
  'Cancelado':   'var(--status-cancelado)',
};

const FORMAS_PAGAMENTO = [
  { valor: 'Pix', rotulo: 'Pix' },
  { valor: 'Dinheiro', rotulo: 'Dinheiro' },
  { valor: 'Credito', rotulo: 'Cartão de Crédito' },
  { valor: 'Debito', rotulo: 'Cartão de Débito' },
  { valor: 'Transferencia', rotulo: 'Transferência Bancária' },
  { valor: 'Boleto', rotulo: 'Boleto' },
];

export default function Clientes() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canCreate = typeof can === 'function' && can('clientes.criar');
  const canEdit = typeof can === 'function' && can('clientes.editar');
  const canDelete = typeof can === 'function' && can('clientes.excluir');
  const canConsultDocuments = typeof can === 'function' && can('clientes.consultar_documentos');
  const canGerenciarFiado = typeof can === 'function' && can('clientes.fiado.gerenciar');
  const canReceberAcerto = typeof can === 'function' && can('clientes.fiado.acerto');
  const canCreditoAjuste = typeof can === 'function' && can('clientes.credito.ajuste');
  const canCreditoDevolver = typeof can === 'function' && can('clientes.credito.devolver');
  const canCreditoEstornar = typeof can === 'function' && can('clientes.credito.estornar');

  const blank = {
    tipo:'PF', nome:'', cpf:'', cnpj:'', ie:'', ind_ie_dest:'', contato:'', email:'',
    cep:'', logradouro:'', numero:'', bairro:'', cidade:'', uf:'', obs:'',
    fiado_ativo: 0, fiado_limite: ''
  };

  const [clientes,      setClientes]      = useState([]);
  const [clientesMeta,  setClientesMeta]  = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState('');
  const [page,          setPage]          = useState(1);
  const [form,          setForm]          = useState(blank);
  const [editId,        setEditId]        = useState(null);
  const [showForm,      setShowForm]      = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [deleting,      setDeleting]      = useState(null);
  const [confirmDel,    setConfirmDel]    = useState(null);
  const [cepLoading,    setCepLoading]    = useState(false);
  const [cnpjLoading,   setCnpjLoading]   = useState(false);
  const [cpfError,      setCpfError]      = useState('');
  const [cnpjError,     setCnpjError]     = useState('');
  const [sortField,     setSortField]     = useState('nome');
  const [sortDir,       setSortDir]       = useState('asc');
  const [detailId,      setDetailId]      = useState(null);
  const [detailData,    setDetailData]    = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab,     setDetailTab]     = useState('conta_aberto');

  // Modais de Fiado e Crédito Loja
  const [showModalAcerto,       setShowModalAcerto]       = useState(false);
  const [acertoPagamento,        setAcertoPagamento]        = useState('Pix');
  const [acertoSubmitting,       setAcertoSubmitting]       = useState(false);

  const [showModalSaldoInicial, setShowModalSaldoInicial] = useState(false);
  const [saldoInicialValor,     setSaldoInicialValor]     = useState('');
  const [saldoInicialMotivo,    setSaldoInicialMotivo]    = useState('Saldo anterior em ficha de papel');
  const [saldoInicialSubmitting, setSaldoInicialSubmitting] = useState(false);

  const [showModalAjuste,       setShowModalAjuste]       = useState(false);
  const [ajusteTipo,            setAjusteTipo]            = useState('entrada');
  const [ajusteValor,           setAjusteValor]           = useState('');
  const [ajusteMotivo,          setAjusteMotivo]          = useState('');
  const [ajusteSubmitting,      setAjusteSubmitting]      = useState(false);

  const [showModalDevolver,     setShowModalDevolver]     = useState(false);
  const [devolverValor,         setDevolverValor]         = useState('');
  const [devolverMotivo,        setDevolverMotivo]        = useState('Restituição de crédito em espécie');
  const [devolverSubmitting,    setDevolverSubmitting]    = useState(false);

  const [confirmEstornoMov,     setConfirmEstornoMov]     = useState(null);
  const [estornoSubmitting,     setEstornoSubmitting]     = useState(false);

  const searchRef = useRef(null);
  const formOverlayDownRef = useRef(false);
  const PER_PAGE = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PER_PAGE),
      });
      if (search.trim()) params.set('q', search.trim());
      const { data } = await api.get(`/clientes?${params.toString()}`);
      setClientes(Array.isArray(data) ? data : (data?.data || []));
      setClientesMeta(Array.isArray(data) ? { page: 1, limit: PER_PAGE, total: data.length, totalPages: 1 } : (data?.meta || { page: 1, limit: PER_PAGE, total: 0, totalPages: 1 }));
    } catch { toast.error('Erro ao carregar clientes'); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const buscarCNPJ = async (raw) => {
    const n = normalizeCnpj(raw);
    if (n.length !== 14) return;
    if (!validaCNPJ(n)) { setCnpjError('CNPJ inválido'); return; }
    setCnpjError('');
    setCnpjLoading(true);
    try {
      const { data: d } = await api.get(`/clientes/cnpj/${encodeURIComponent(n)}`);
      const cepCnpj = onlyCepDigits(d.cep);
      const enderecoIncompleto = cepCnpj.length === 8 && [
        d.logradouro,
        d.bairro,
        d.municipio || d.cidade,
        d.uf,
      ].some(value => !String(value || '').trim());
      setForm(f => ({
        ...f,
        nome:       f.nome.trim()       ? f.nome       : (d.razao_social || d.nome_fantasia || f.nome),
        email:      f.email.trim()      ? f.email      : (d.email?.toLowerCase() || f.email),
        contato:    f.contato.trim()    ? f.contato    : (d.ddd_telefone_1 ? d.ddd_telefone_1.replace(/[^\d]/g,'').replace(/(\d{2})(\d+)/,'($1) $2') : f.contato),
        cep:        f.cep.trim()        ? f.cep        : (d.cep?.replace(/\D/g,'').replace(/(\d{5})(\d{3})/,'$1-$2') || f.cep),
        logradouro: f.logradouro.trim() ? f.logradouro : (d.logradouro || f.logradouro),
        numero:     f.numero.trim()     ? f.numero     : (d.numero || f.numero),
        bairro:     f.bairro.trim()     ? f.bairro     : (d.bairro || f.bairro),
        cidade:     f.cidade.trim()     ? f.cidade     : (d.municipio || d.cidade || f.cidade),
        uf:         f.uf.trim()         ? f.uf         : (d.uf || f.uf),
      }));
      if (enderecoIncompleto) {
        setCepLoading(true);
        try {
          const endereco = await buscarEnderecoPorCep(cepCnpj);
          if (endereco) {
            setForm(f => ({
              ...f,
              cep:        f.cep.trim()        ? f.cep        : endereco.cep,
              logradouro: f.logradouro.trim() ? f.logradouro : (endereco.logradouro || f.logradouro),
              bairro:     f.bairro.trim()     ? f.bairro     : (endereco.bairro     || f.bairro),
              cidade:     f.cidade.trim()     ? f.cidade     : (endereco.cidade     || f.cidade),
              uf:         f.uf.trim()         ? f.uf         : (endereco.uf         || f.uf),
            }));
          }
        } catch {}
        finally { setCepLoading(false); }
      }
      toast.success('Dados do CNPJ carregados');
    } catch(e) {
      setCnpjError(e?.response?.data?.error || 'CNPJ não encontrado na Receita Federal');
    } finally {
      setCnpjLoading(false);
    }
  };

  const buscarCep = async (cep) => {
    if (onlyDigits(cep).length !== 8) return;
    setCepLoading(true);
    try {
      const endereco = await buscarEnderecoPorCep(cep);
      if (endereco) {
        setForm(f => ({
          ...f,
          cep:        endereco.cep,
          logradouro: endereco.logradouro || f.logradouro,
          bairro:     endereco.bairro     || f.bairro,
          cidade:     endereco.cidade     || f.cidade,
          uf:         endereco.uf         || f.uf,
        }));
      }
    } catch {}
    finally { setCepLoading(false); }
  };

  const handleDocumento = (v) => {
    const state = getDocumentoInputState(v, form.tipo);
    const normalized = normalizeCnpj(v);

    setForm(f => ({
      ...f,
      tipo: state.tipo,
      cpf: state.cpf,
      cnpj: state.cnpj,
      ie: state.tipo === 'PF' ? '' : f.ie,
    }));

    setCpfError(state.cpfError);
    setCnpjError(state.cnpjError);

    if (canConsultDocuments && state.tipo === 'PJ' && normalized.length === 14 && !state.cnpjError) {
      buscarCNPJ(state.cnpj);
    }
  };

  const openEdit = (c) => {
    setEditId(c.id);
    const tipo = documentoTipo(c.cpf, c.ie);
    const documento = tipo === 'PJ' ? maskCNPJ(c.cpf || '') : maskCPF(c.cpf || '');
    setForm({
      tipo,
      nome:        c.name       || '',
      cpf:         tipo === 'PF' ? documento : '',
      cnpj:        tipo === 'PJ' ? documento : '',
      ie:          c.ie         || '',
      ind_ie_dest: tipo === 'PJ' ? (c.ind_ie_dest || '') : '',
      contato:     c.phone      || '',
      email:       c.email      || '',
      cep:         c.cep        || '',
      logradouro:  c.logradouro || '',
      numero:      c.numero     || '',
      bairro:      c.bairro     || '',
      cidade:      c.cidade     || '',
      uf:          c.uf         || '',
      obs:         c.notes      || '',
      fiado_ativo: c.fiado_ativo ? 1 : 0,
      fiado_limite: c.fiado_limite != null ? String(c.fiado_limite) : '',
    });
    setCpfError(''); setCnpjError('');
    setShowForm(true);
  };

  const openNew   = () => { setEditId(null); setForm(blank); setCpfError(''); setCnpjError(''); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(blank); setCpfError(''); setCnpjError(''); };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    if (form.tipo === 'PF' && form.cpf && !validaCPF(form.cpf)) { toast.error('CPF inválido'); return; }
    if (form.tipo === 'PJ' && form.cnpj && !validaCNPJ(form.cnpj)) { toast.error('CNPJ inválido'); return; }
    const documento = form.tipo === 'PJ' ? form.cnpj : form.cpf;
    setSaving(true);
    try {
      const payload = {
        name:        form.nome,
        phone:       form.contato,
        email:       form.email,
        cpf:         documento,
        ie:          form.ie,
        ind_ie_dest: form.tipo === 'PJ' ? (form.ind_ie_dest || null) : null,
        logradouro:  form.logradouro,
        numero:      form.numero,
        bairro:      form.bairro,
        cidade:      form.cidade,
        uf:          form.uf,
        cep:         form.cep,
        notes:       form.obs,
        fiado_ativo: form.fiado_ativo ? 1 : 0,
        fiado_limite: form.fiado_ativo ? Number(form.fiado_limite || 0) : 0,
      };
      if (editId) {
        await api.put(`/clientes/${editId}`, payload);
        toast.success('Cliente atualizado');
      } else {
        await api.post('/clientes', payload);
        toast.success('Cliente cadastrado');
      }
      closeForm();
      load();
    } catch(e) {
      toast.error(e?.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await api.delete(`/clientes/${id}`);
      toast.success('Cliente removido');
      setConfirmDel(null);
      if (detailId === id) setDetailId(null);
      load();
    } catch(e) {
      toast.error(e?.response?.data?.error || 'Erro ao remover');
    } finally { setDeleting(null); }
  };

  const loadDetail = useCallback(async (id) => {
    setDetailLoading(true);
    try {
      const [cliRes, ordRes, contaRes, credRes] = await Promise.all([
        api.get(`/clientes/${id}`),
        api.get(`/clientes/${id}/ordens`),
        api.get(`/clientes/${id}/conta-aberto`).catch(() => ({ data: { ordens: [], totalEmAberto: 0 } })),
        api.get(`/clientes/${id}/credito`).catch(() => ({ data: { saldo: 0, movimentos: [] } })),
      ]);
      setDetailData({
        cliente: cliRes.data,
        sumario: cliRes.data._sumario,
        ordens: ordRes.data,
        contaAberto: contaRes.data,
        credito: credRes.data,
      });
    } catch { toast.error('Erro ao carregar detalhes'); }
    finally { setDetailLoading(false); }
  }, []);

  useEffect(() => {
    if (detailId) loadDetail(detailId);
    else setDetailData(null);
  }, [detailId, loadDetail]);

  const fmt  = v  => v != null ? Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : '—';
  const fmtD = d  => {
    if (!d) return '—';
    const s = d.includes('T') ? d : d + 'T00:00:00';
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('pt-BR');
  };

  const sorted = [...clientes]
    .sort((a,b) => {
      let va = a[sortField === 'nome' ? 'name' : sortField] || '';
      let vb = b[sortField === 'nome' ? 'name' : sortField] || '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

  const toggleSort = (f) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('asc'); }
  };

  const SortIcon = ({ f }) => sortField !== f
    ? <span style={{color:'var(--color-text-faint)',marginLeft:4}}>⇅</span>
    : <span style={{marginLeft:4}}>{sortDir==='asc'?'↑':'↓'}</span>;

  const tabStyle = (active) => ({
    flex: 1,
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    fontWeight: 700,
    cursor: 'pointer',
    border: 'none',
    background: active ? 'var(--color-primary)' : 'transparent',
    color: active ? '#fff' : 'var(--color-text-muted)',
    transition: 'background var(--ease), color var(--ease)',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  });

  // Handlers para Ações de Fiado e Crédito Loja
  const handleEnviarCobranca = async () => {
    if (!detailId) return;
    try {
      const { data } = await api.get(`/clientes/${detailId}/cobranca/whatsapp`);
      const url = data.urlWhatsAppApp || data.urlWhatsAppWeb;
      if (url) {
        window.open(url, '_blank');
      } else {
        toast.error('Não foi possível gerar link do WhatsApp');
      }
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Erro ao gerar mensagem de cobrança');
    }
  };

  const handleImprimirExtrato = () => {
    if (!detailId) return;
    window.open(`/api/clientes/${detailId}/conta-aberto/extrato`, '_blank');
  };

  const handleConfirmAcerto = async () => {
    if (!detailId || !detailData?.contaAberto?.totalEmAberto) return;
    setAcertoSubmitting(true);
    try {
      const { data } = await api.post(`/clientes/${detailId}/acerto`, {
        pagamento: acertoPagamento,
        valor_total_esperado: detailData.contaAberto.totalEmAberto,
        ordem_ids: detailData.contaAberto.ordens.map(o => o.id),
      });
      toast.success('Acerto realizado com sucesso!');
      setShowModalAcerto(false);
      if (data?.acerto?.id) {
        window.open(`/api/clientes/acertos/${data.acerto.id}/recibo`, '_blank');
      }
      loadDetail(detailId);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Erro ao processar acerto');
    } finally {
      setAcertoSubmitting(false);
    }
  };

  const handleConfirmSaldoInicial = async () => {
    const v = Number(saldoInicialValor);
    if (!(v > 0)) { toast.error('Informe um valor de crédito válido'); return; }
    setSaldoInicialSubmitting(true);
    try {
      await api.post(`/clientes/${detailId}/credito/saldo-inicial`, {
        valor: v,
        motivo: saldoInicialMotivo || 'Saldo anterior em ficha de papel',
      });
      toast.success('Saldo inicial de crédito registrado!');
      setShowModalSaldoInicial(false);
      setSaldoInicialValor('');
      loadDetail(detailId);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Erro ao registrar saldo inicial');
    } finally {
      setSaldoInicialSubmitting(false);
    }
  };

  const handleConfirmAjuste = async () => {
    const v = Number(ajusteValor);
    if (!(v > 0)) { toast.error('Informe um valor de crédito válido'); return; }
    if (!ajusteMotivo.trim()) { toast.error('Informe o motivo do ajuste'); return; }
    setAjusteSubmitting(true);
    try {
      await api.post(`/clientes/${detailId}/credito/ajuste`, {
        tipo: ajusteTipo,
        valor: v,
        motivo: ajusteMotivo.trim(),
      });
      toast.success('Ajuste de crédito registrado!');
      setShowModalAjuste(false);
      setAjusteValor('');
      setAjusteMotivo('');
      loadDetail(detailId);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Erro ao registrar ajuste');
    } finally {
      setAjusteSubmitting(false);
    }
  };

  const handleConfirmDevolver = async () => {
    const v = Number(devolverValor);
    if (!(v > 0)) { toast.error('Informe um valor válido para devolução'); return; }
    setDevolverSubmitting(true);
    try {
      await api.post(`/clientes/${detailId}/credito/devolver`, {
        valor: v,
        motivo: devolverMotivo || 'Restituição de crédito em espécie',
      });
      toast.success('Devolução registrada com sucesso!');
      setShowModalDevolver(false);
      setDevolverValor('');
      loadDetail(detailId);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Erro ao devolver crédito');
    } finally {
      setDevolverSubmitting(false);
    }
  };

  const handleConfirmEstorno = async () => {
    if (!confirmEstornoMov) return;
    setEstornoSubmitting(true);
    try {
      await api.post(`/clientes/credito/estornar/${confirmEstornoMov.id}`, {
        motivo: 'Estorno manual autorizado',
      });
      toast.success('Movimento estornado com sucesso!');
      setConfirmEstornoMov(null);
      loadDetail(detailId);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Erro ao estornar movimento');
    } finally {
      setEstornoSubmitting(false);
    }
  };

  const DetailPanel = () => {
    const s = detailData?.sumario;
    const c = detailData?.cliente;
    const ordens = detailData?.ordens || [];
    const contaAberto = detailData?.contaAberto || { ordens: [], totalEmAberto: 0 };
    const credito = detailData?.credito || { saldo: 0, movimentos: [] };

    const KpiBox = ({ label, value, color, sub }) => (
      <div style={{ background:'var(--color-surface-offset)', borderRadius:'var(--radius-md)', padding:'var(--space-3)', textAlign:'center' }}>
        <div style={{ fontSize:'var(--text-sm)', fontWeight:800, color: color || 'var(--color-text)', fontVariantNumeric:'tabular-nums', lineHeight:1.1 }}>{value}</div>
        {sub && <div style={{ fontSize:9, color:'var(--color-text-faint)', marginTop:2 }}>{sub}</div>}
        <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginTop:'var(--space-1)' }}>{label}</div>
      </div>
    );

    const addrParts = [
      c.logradouro,
      c.numero ? `nº ${c.numero}` : '',
      c.bairro || '',
    ].filter(Boolean).join(', ');
    const cityPart = [c.cidade, c.uf ? `/${c.uf}` : ''].filter(Boolean).join('');
    const cepPart  = c.cep ? `— ${c.cep}` : '';

    return (
      <div style={{ overflowY:'auto', flex:1, padding:'var(--space-3) var(--space-4)' }}>

        <div style={{ marginBottom:'var(--space-4)' }}>
          <div style={{ fontWeight:800, fontSize:'var(--text-base)', marginBottom:'var(--space-1)' }}>{c.name}</div>
          {c.email   && <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginBottom:2 }}>✉ {c.email}</div>}
          {c.phone   && <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginBottom:2 }}>📞 {c.phone}</div>}
          {c.cpf     && <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginBottom:2 }}>{documentoLabel(c.cpf)}: {c.cpf}</div>}
          {c.ie      && <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginBottom:2 }}>IE: {c.ie}</div>}
          {(addrParts || cityPart) && (
            <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginBottom:2 }}>
              📍 {[addrParts, cityPart, cepPart].filter(Boolean).join(' ')}
            </div>
          )}
          {c.notes && (
            <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', marginTop:'var(--space-2)', padding:'var(--space-2)', background:'var(--color-surface-offset)', borderRadius:'var(--radius-md)' }}>💬 {c.notes}</div>
          )}
        </div>

        {s && (
          <>
            <div style={{ fontWeight:700, fontSize:'var(--text-xs)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'var(--space-2)' }}>Resumo de Contas</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-2)', marginBottom:'var(--space-3)' }}>
              <KpiBox
                label="Em Aberto"
                value={fmt(contaAberto.totalEmAberto || 0)}
                color={contaAberto.totalEmAberto > 0 ? 'var(--color-error)' : 'var(--color-text-muted)'}
                sub={c.fiado_ativo ? (c.fiado_limite > 0 ? `Limite: ${fmt(c.fiado_limite)}` : 'Sem limite fixado') : 'Fiado desativado'}
              />
              <KpiBox
                label="Crédito Loja"
                value={fmt(credito.saldo ?? s.saldoCredito ?? 0)}
                color={(credito.saldo || 0) > 0 ? 'var(--color-success)' : 'var(--color-text-muted)'}
                sub={credito.movimentos?.length ? `${credito.movimentos.length} lançamento(s)` : null}
              />
              <KpiBox label="Total de OS" value={s.totalOrdens} color="var(--color-primary)" />
              <KpiBox label="Total gasto" value={fmt(s.totalGasto)} color="var(--color-success)" />
            </div>

            <div style={{ display:'flex', background:'var(--color-surface-offset)', borderRadius:'var(--radius-lg)', padding:3, gap:2, marginBottom:'var(--space-3)' }}>
              <button
                type="button"
                style={tabStyle(detailTab === 'conta_aberto')}
                onClick={() => setDetailTab('conta_aberto')}
              >
                Conta em Aberto {contaAberto.totalEmAberto > 0 ? `(${fmt(contaAberto.totalEmAberto)})` : ''}
              </button>
              <button
                type="button"
                style={tabStyle(detailTab === 'credito')}
                onClick={() => setDetailTab('credito')}
              >
                Crédito Loja {credito.saldo > 0 ? `(${fmt(credito.saldo)})` : ''}
              </button>
              <button
                type="button"
                style={tabStyle(detailTab === 'ordens')}
                onClick={() => setDetailTab('ordens')}
              >
                Histórico ({ordens.length})
              </button>
            </div>

            {/* ABA: CONTA EM ABERTO (FIADO) */}
            {detailTab === 'conta_aberto' && (
              <div style={{ marginBottom:'var(--space-4)' }}>
                <div style={{ display:'flex', gap:'var(--space-2)', flexWrap:'wrap', marginBottom:'var(--space-3)' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleEnviarCobranca}
                    disabled={!contaAberto.totalEmAberto}
                  >
                    💬 Enviar cobrança
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleImprimirExtrato}
                  >
                    🖨️ Imprimir extrato
                  </button>
                  {canReceberAcerto && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setShowModalAcerto(true)}
                      disabled={!contaAberto.totalEmAberto}
                    >
                      💰 Receber acerto
                    </button>
                  )}
                </div>

                {contaAberto.ordens.length > 0 ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-2)' }}>
                    {contaAberto.ordens.map(o => (
                      <div
                        key={o.id}
                        style={{ background:'var(--color-surface-offset)', borderRadius:'var(--radius-md)', padding:'var(--space-2) var(--space-3)', border:'1px solid var(--color-border)', cursor:'pointer' }}
                        onClick={() => navigate(`/ordens/${o.id}`)}
                      >
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ fontWeight:700, fontSize:'var(--text-xs)', color:'var(--color-primary)' }}>{o.numero}</span>
                          <span style={{ fontSize:10, color:'var(--color-text-muted)' }}>Prazo: {fmtD(o.prazoentrega)}</span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:2 }}>
                          <span style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>{o.servico}</span>
                          <span style={{ fontSize:'var(--text-xs)', fontFamily:'monospace', fontWeight:700, color:'var(--color-error)' }}>
                            Saldo: {fmt(o.saldo)}
                          </span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:2, fontSize:10, color:'var(--color-text-faint)' }}>
                          <span>Total: {fmt(o.valortotal)}</span>
                          <span>Pago: {fmt(o.recebido)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign:'center', padding:'var(--space-4)', color:'var(--color-text-muted)', fontSize:'var(--text-sm)' }}>
                    Nenhuma OS em débito. Todas as contas estão quitadas.
                  </div>
                )}
              </div>
            )}

            {/* ABA: CRÉDITO LOJA (HAVER) */}
            {detailTab === 'credito' && (
              <div style={{ marginBottom:'var(--space-4)' }}>
                <div style={{ display:'flex', gap:'var(--space-2)', flexWrap:'wrap', marginBottom:'var(--space-3)' }}>
                  {canCreditoAjuste && (
                    <>
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowModalSaldoInicial(true)}>
                        ➕ Saldo inicial
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowModalAjuste(true)}>
                        ⚖️ Ajuste
                      </button>
                    </>
                  )}
                  {canCreditoDevolver && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowModalDevolver(true)}
                      disabled={!(credito.saldo > 0)}
                    >
                      💸 Devolver em dinheiro
                    </button>
                  )}
                </div>

                {credito.movimentos.length > 0 ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-2)' }}>
                    {credito.movimentos.map(m => (
                      <div
                        key={m.id}
                        style={{ background:'var(--color-surface-offset)', borderRadius:'var(--radius-md)', padding:'var(--space-2) var(--space-3)', border:'1px solid var(--color-border)' }}
                      >
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ fontWeight:700, fontSize:'var(--text-xs)', color: m.valor > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                            {m.valor > 0 ? `+ ${fmt(m.valor)}` : `- ${fmt(Math.abs(m.valor))}`}
                          </span>
                          <span style={{ fontSize:10, color:'var(--color-text-muted)' }}>{fmtD(m.createdat)}</span>
                        </div>
                        <div style={{ fontSize:'var(--text-xs)', marginTop:2, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span>{m.motivo || m.tipo} {m.ordem_numero ? `(${m.ordem_numero})` : ''}</span>
                          {canCreditoEstornar && !m.estorna_id && !m.foi_estornado && (
                            <button
                              className="btn btn-ghost btn-xs inline-danger"
                              title="Estornar movimento"
                              onClick={() => setConfirmEstornoMov(m)}
                            >
                              Estornar
                            </button>
                          )}
                        </div>
                        {m.usuario_nome && (
                          <div style={{ fontSize:9, color:'var(--color-text-faint)', marginTop:2 }}>
                            Registrado por: {m.usuario_nome}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign:'center', padding:'var(--space-4)', color:'var(--color-text-muted)', fontSize:'var(--text-sm)' }}>
                    Nenhum movimento de crédito registrado.
                  </div>
                )}
              </div>
            )}

            {/* ABA: HISTÓRICO DE OS */}
            {detailTab === 'ordens' && (
              <div>
                {ordens.length > 0 ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-2)' }}>
                    {ordens.map(o => (
                      <div
                        key={o.id}
                        style={{ background:'var(--color-surface-offset)', borderRadius:'var(--radius-md)', padding:'var(--space-2) var(--space-3)', cursor:'pointer', border:'1px solid var(--color-border)' }}
                        onClick={() => navigate(`/ordens/${o.id}`)}
                      >
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ fontWeight:700, fontSize:'var(--text-xs)', color:'var(--color-primary)' }}>{o.numero}</span>
                          <span style={{ fontSize:10, color:'var(--color-text-muted)' }}>{fmtD(o.createdat || o.criadoem)}</span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:2 }}>
                          <span style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>{o.servico}</span>
                          <span style={{ fontSize:'var(--text-xs)', fontFamily:'monospace', fontWeight:600 }}>{fmt(o.valortotal||o.valor)}</span>
                        </div>
                        <div style={{ marginTop:4 }}>
                          <span
                            style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:'var(--radius-full)',
                              background: `color-mix(in oklch, ${STATUS_COLOR[o.status] || 'var(--color-primary)'} 15%, var(--color-surface))`,
                              color: STATUS_COLOR[o.status] || 'var(--color-primary)' }}
                          >{o.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign:'center', padding:'var(--space-4)', color:'var(--color-text-muted)', fontSize:'var(--text-sm)' }}>
                    Nenhuma ordem de serviço cadastrada.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="erp-page" style={{ height:'calc(100vh - 60px - var(--space-12))', display:'flex', flexDirection:'column', minHeight:0 }}>

      <div className="erp-page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:0, flexShrink:0 }}>
        <div>
          <h1 className="erp-page-title" style={{ fontSize:'var(--text-xl)', fontWeight:800, margin:0 }}>Clientes</h1>
          <p className="erp-page-subtitle" style={{ margin:0, fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>{clientesMeta.total ?? clientes.length} cadastrado{(clientesMeta.total ?? clientes.length)!==1?'s':''}</p>
        </div>
        {canCreate && (
          <button className="btn btn-primary" onClick={openNew}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Novo Cliente
          </button>
        )}
      </div>

      <div className="erp-filter-bar" style={{ marginBottom:0, flexShrink:0 }}>
        <div className="erp-search" style={{ position:'relative' }}>
          <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--color-text-faint)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            ref={searchRef}
            className="form-input"
            style={{ paddingLeft:36 }}
            placeholder="Buscar por nome, telefone, email, CPF ou CNPJ…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div style={{ flex:1, overflow:'hidden', display:'flex', gap:'var(--space-4)', minHeight:0, padding:'var(--space-4)' }}>

        <div className="card" style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', minWidth:0 }}>
          {loading ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'var(--color-text-muted)', gap:'var(--space-2)' }}>
              <svg className="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              Carregando…
            </div>
          ) : sorted.length === 0 ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, color:'var(--color-text-muted)', gap:'var(--space-3)' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <div style={{ textAlign:'center' }}>
                <p style={{ fontWeight:600, margin:0 }}>{search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}</p>
                {!search && canCreate && <p style={{ fontSize:'var(--text-xs)', margin:'var(--space-1) 0 0' }}>Clique em "Novo Cliente" para começar</p>}
              </div>
            </div>
          ) : (
            <>
            <div className="mobile-list">
              {sorted.map(c => (
                <article
                  key={c.id}
                  className="mobile-record-card"
                  onClick={() => setDetailId(prev => prev===c.id ? null : c.id)}
                >
                  <div className="mobile-record-top">
                    <div style={{ minWidth:0 }}>
                      <div className="mobile-record-title">{c.name}</div>
                      {c.email && <div className="mobile-record-sub truncate">{c.email}</div>}
                      <div className="mobile-record-sub">{c.phone || 'Sem telefone'}</div>
                    </div>
                    <div className="mobile-record-value">{fmt(c.gastototal)}</div>
                  </div>
                  <div className="mobile-record-row">
                    <div className="mobile-record-meta">
                      <span className="badge badge-primary">{c.totalordens ?? 0} OS</span>
                      {(c.cpf || c.ie) && <span className="badge badge-secondary">{c.cpf ? documentoLabel(c.cpf) : 'IE'}</span>}
                      {Boolean(c.fiado_ativo) && <span className="badge badge-warning">Fiado</span>}
                    </div>
                    {(canEdit || canDelete) && (
                      <div className="mobile-record-actions" onClick={e => e.stopPropagation()}>
                        {canEdit && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEdit(c)}
                          >
                            Editar
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className="btn btn-ghost btn-sm inline-danger"
                            onClick={() => setConfirmDel(c)}
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <div className="desktop-table-area mobile-cards-hidden" style={{ overflowY:'auto', flex:1 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort('nome')} style={{ cursor:'pointer', userSelect:'none' }}>
                      Nome <SortIcon f="nome" />
                    </th>
                    <th>Documento</th>
                    <th>Telefone</th>
                    <th>E-mail</th>
                    <th onClick={() => toggleSort('gastototal')} style={{ cursor:'pointer', userSelect:'none', textAlign:'right' }}>
                      Gasto Total <SortIcon f="gastototal" />
                    </th>
                    <th onClick={() => toggleSort('totalordens')} style={{ cursor:'pointer', userSelect:'none', textAlign:'center' }}>
                      OS <SortIcon f="totalordens" />
                    </th>
                    {(canEdit || canDelete) && <th style={{ textAlign:'right' }}>Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(c => {
                    const isSelected = detailId === c.id;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setDetailId(prev => prev===c.id ? null : c.id)}
                        style={{ cursor:'pointer', background: isSelected ? 'var(--color-surface-offset)' : undefined }}
                      >
                        <td style={{ fontWeight:600 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'var(--space-2)' }}>
                            <span>{c.name}</span>
                            {Boolean(c.fiado_ativo) && <span className="badge badge-warning" style={{ fontSize:9, padding:'1px 5px' }}>Fiado</span>}
                          </div>
                        </td>
                        <td style={{ color:'var(--color-text-muted)', fontSize:'var(--text-xs)' }}>
                          {c.cpf ? `${documentoLabel(c.cpf)} ${c.cpf}` : c.ie ? `IE ${c.ie}` : '—'}
                        </td>
                        <td style={{ color:'var(--color-text-muted)' }}>{c.phone || '—'}</td>
                        <td style={{ color:'var(--color-text-muted)' }}>{c.email || '—'}</td>
                        <td style={{ textAlign:'right', fontFamily:'monospace', fontWeight:600 }}>{fmt(c.gastototal)}</td>
                        <td style={{ textAlign:'center' }}>
                          <span className="badge badge-primary">{c.totalordens ?? 0}</span>
                        </td>
                        {(canEdit || canDelete) && (
                          <td style={{ textAlign:'right' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display:'flex', gap:'var(--space-1)', justifyContent:'flex-end' }}>
                              {canEdit && (
                                <button className="btn btn-ghost btn-sm" title="Editar" onClick={() => openEdit(c)}>
                                  Editar
                                </button>
                              )}
                              {canDelete && (
                                <button className="btn btn-ghost btn-sm inline-danger" title="Excluir" onClick={() => setConfirmDel(c)}>
                                  Excluir
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>

        {detailId && (
          <div className="card" style={{ width:380, flexShrink:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, padding:'var(--space-3) var(--space-4) var(--space-2)' }}>
              <span style={{ fontWeight:700, fontSize:'var(--text-sm)' }}>Detalhes do Cliente</span>
              <button className="btn btn-ghost btn-xs" onClick={() => setDetailId(null)}>✕</button>
            </div>
            {detailLoading ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'var(--color-text-muted)', gap:'var(--space-2)' }}>
                <svg className="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                Carregando…
              </div>
            ) : detailData ? (
              <DetailPanel />
            ) : null}
          </div>
        )}
      </div>

      {/* MODAL DE CADASTRO / EDIÇÃO DE CLIENTE */}
      {showForm && ReactDOM.createPortal(
        <div
          className="modal-overlay"
          onMouseDown={e => { formOverlayDownRef.current = e.target === e.currentTarget; }}
          onClick={e => {
            if (formOverlayDownRef.current && e.target === e.currentTarget) closeForm();
            formOverlayDownRef.current = false;
          }}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editId ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <button className="btn btn-ghost btn-sm" onClick={closeForm}>✕</button>
            </div>
            <div className="modal-body modal-body-dense">
              <div style={{ display:'flex', background:'var(--color-surface-offset)', borderRadius:'var(--radius-lg)', padding:3, gap:2, marginBottom:'var(--space-3)' }}>
                <div style={{ ...tabStyle(form.tipo==='PF'), cursor:'default', opacity: form.tipo==='PF' ? 1 : 0.68 }}>👤 Pessoa Física</div>
                <div style={{ ...tabStyle(form.tipo==='PJ'), cursor:'default', opacity: form.tipo==='PJ' ? 1 : 0.68 }}>🏢 Pessoa Jurídica</div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span>CPF / CNPJ</span>
                    {cnpjLoading && <span style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)',fontWeight:400}}>🔍 buscando…</span>}
                  </label>
                  <input
                    className="form-input"
                    style={(cpfError || cnpjError) ? {borderColor:'var(--color-error)'} : {}}
                    value={form.tipo === 'PJ' ? form.cnpj : form.cpf}
                    onChange={e => handleDocumento(e.target.value)}
                    placeholder="CPF ou CNPJ"
                    inputMode="text"
                    autoCapitalize="characters"
                  />
                  {cpfError && <span className="form-error">{cpfError}</span>}
                  {cnpjError && <span className="form-error">{cnpjError}</span>}
                </div>
                {form.tipo === 'PJ' && (
                  <div className="form-group">
                    <label className="form-label">Inscrição Estadual</label>
                    <input className="form-input" value={form.ie} onChange={e => set('ie', e.target.value)} placeholder="IE ou deixe vazio se isento" />
                  </div>
                )}
                {form.tipo === 'PJ' && (
                  <div className="form-group">
                    <label className="form-label">
                      Tipo de Contribuinte ICMS
                      <span style={{ fontSize:'var(--text-xs)', fontWeight:400, color:'var(--color-text-muted)', marginLeft:6 }}>para NF-e</span>
                    </label>
                    <select className="form-input" value={form.ind_ie_dest} onChange={e => set('ind_ie_dest', e.target.value)}>
                      <option value="">Detectar automaticamente</option>
                      <option value="1">Contribuinte com IE</option>
                      <option value="2">Contribuinte Isento</option>
                      <option value="9">Não Contribuinte</option>
                    </select>
                  </div>
                )}

                <div className="form-group" style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Nome / Razão Social <span style={{color:"var(--color-error)"}}>*</span></label>
                  <input className="form-input" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder={form.tipo==='PJ' ? 'Razão social ou nome fantasia' : 'Nome completo'} />
                </div>

                <div className="form-group">
                  <label className="form-label">Telefone / WhatsApp</label>
                  <input className="form-input" value={form.contato} onChange={e => set('contato', e.target.value)} placeholder="(31) 99999-9999" />
                </div>
                <div className="form-group">
                  <label className="form-label">E-mail</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span>CEP</span>
                    {cepLoading && <span style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)',fontWeight:400}}>buscando…</span>}
                  </label>
                  <input className="form-input" value={form.cep} onChange={e => { const cep = maskCep(e.target.value); set('cep', cep); buscarCep(cep); }} placeholder="00000-000" inputMode="numeric" />
                </div>

                <div />

                <div className="form-group" style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Logradouro</label>
                  <input className="form-input" value={form.logradouro} onChange={e => set('logradouro', e.target.value)} placeholder="Rua, Av., Travessa…" />
                </div>

                <div className="form-group">
                  <label className="form-label">Número</label>
                  <input className="form-input" value={form.numero} onChange={e => set('numero', e.target.value)} placeholder="Ex: 123 / S/N" />
                </div>
                <div className="form-group">
                  <label className="form-label">Bairro</label>
                  <input className="form-input" value={form.bairro} onChange={e => set('bairro', e.target.value)} placeholder="Bairro" />
                </div>

                <div className="form-group">
                  <label className="form-label">Cidade</label>
                  <input className="form-input" value={form.cidade} onChange={e => set('cidade', e.target.value)} placeholder="Cidade" />
                </div>
                <div className="form-group">
                  <label className="form-label">UF</label>
                  <select className="form-input" value={form.uf} onChange={e => set('uf', e.target.value)}>
                    <option value="" />
                    {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>

                {/* CONFIGURAÇÃO DE FIADO / CONTA EM ABERTO (APENAS COM PERMISSÃO) */}
                {canGerenciarFiado && (
                  <div className="form-group" style={{ gridColumn: '1/-1', background: 'var(--color-surface-offset)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        aria-label="Permite Conta em Aberto (Fiado)"
                        checked={Boolean(form.fiado_ativo)}
                        onChange={e => set('fiado_ativo', e.target.checked ? 1 : 0)}
                      />
                      <span>Permite Conta em Aberto (Fiado)</span>
                    </label>
                    {Boolean(form.fiado_ativo) && (
                      <div style={{ marginTop: 'var(--space-2)' }}>
                        <label className="form-label" htmlFor="fiado_limite_input">Limite de Crédito Fiado (R$ 0 = Ilimitado)</label>
                        <input
                          id="fiado_limite_input"
                          aria-label="Limite de Crédito Fiado"
                          className="form-input"
                          type="number"
                          step="0.01"
                          value={form.fiado_limite}
                          onChange={e => set('fiado_limite', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="form-group" style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Observações</label>
                  <textarea className="form-input" rows={3} value={form.obs} onChange={e => set('obs', e.target.value)} placeholder="Anotações sobre o cliente…" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeForm}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando…' : editId ? 'Salvar alterações' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL DE RECEBER ACERTO AGRUPADO */}
      {showModalAcerto && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={() => setShowModalAcerto(false)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Receber Acerto de Conta</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModalAcerto(false)}>✕</button>
            </div>
            <div className="modal-body modal-body-dense">
              <p style={{ margin:0, fontSize:'var(--text-sm)' }}>
                Cliente: <strong>{detailData?.cliente?.name}</strong>
              </p>
              <div style={{ margin:'var(--space-3) 0', padding:'var(--space-3)', background:'var(--color-surface-offset)', borderRadius:'var(--radius-md)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'var(--text-sm)', marginBottom:'var(--space-1)' }}>
                  <span>Ordens a quitar:</span>
                  <strong>{detailData?.contaAberto?.ordens?.length || 0} OS</strong>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'var(--text-base)', fontWeight:800 }}>
                  <span>Total a Receber:</span>
                  <span style={{ color:'var(--color-primary)' }}>{fmt(detailData?.contaAberto?.totalEmAberto)}</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Forma de Pagamento</label>
                <select
                  className="form-input"
                  value={acertoPagamento}
                  onChange={e => setAcertoPagamento(e.target.value)}
                >
                  {FORMAS_PAGAMENTO.map(f => (
                    <option key={f.valor} value={f.valor}>{f.rotulo}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModalAcerto(false)} disabled={acertoSubmitting}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleConfirmAcerto} disabled={acertoSubmitting}>
                {acertoSubmitting ? 'Processando…' : 'Confirmar e Emitir Recibo'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL DE SALDO INICIAL DE CRÉDITO */}
      {showModalSaldoInicial && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={() => setShowModalSaldoInicial(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Lançar Saldo Inicial de Crédito</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModalSaldoInicial(false)}>✕</button>
            </div>
            <div className="modal-body modal-body-dense">
              <p style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', margin:'0 0 var(--space-3)' }}>
                Utilize para registrar saldo de haver legado trazido de fichas de papel sem distorcer o DRE do mês corrente.
              </p>
              <div className="form-group">
                <label className="form-label">Valor (R$)</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={saldoInicialValor}
                  onChange={e => setSaldoInicialValor(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Motivo / Referência</label>
                <input
                  className="form-input"
                  value={saldoInicialMotivo}
                  onChange={e => setSaldoInicialMotivo(e.target.value)}
                  placeholder="Saldo anterior em ficha de papel"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModalSaldoInicial(false)} disabled={saldoInicialSubmitting}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleConfirmSaldoInicial} disabled={saldoInicialSubmitting}>
                {saldoInicialSubmitting ? 'Gravando…' : 'Gravar Saldo'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL DE AJUSTE MANUAL DE CRÉDITO */}
      {showModalAjuste && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={() => setShowModalAjuste(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Ajuste Manual de Crédito</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModalAjuste(false)}>✕</button>
            </div>
            <div className="modal-body modal-body-dense">
              <div className="form-group">
                <label className="form-label">Tipo de Ajuste</label>
                <select className="form-input" value={ajusteTipo} onChange={e => setAjusteTipo(e.target.value)}>
                  <option value="entrada">Crédito (+) Cortesia / Correção a favor do cliente</option>
                  <option value="saida">Débito (-) Regularização / Correção a favor da loja</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Valor (R$)</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={ajusteValor}
                  onChange={e => setAjusteValor(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Motivo (Obrigatório)</label>
                <input
                  className="form-input"
                  value={ajusteMotivo}
                  onChange={e => setAjusteMotivo(e.target.value)}
                  placeholder="Justificativa da alteração"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModalAjuste(false)} disabled={ajusteSubmitting}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleConfirmAjuste} disabled={ajusteSubmitting}>
                {ajusteSubmitting ? 'Gravando…' : 'Gravar Ajuste'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL DE DEVOLVER CRÉDITO EM DINHEIRO */}
      {showModalDevolver && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={() => setShowModalDevolver(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Devolver Crédito em Dinheiro</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModalDevolver(false)}>✕</button>
            </div>
            <div className="modal-body modal-body-dense">
              <p style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)', margin:'0 0 var(--space-3)' }}>
                Saldo disponível para devolução: <strong>{fmt(detailData?.credito?.saldo)}</strong>. Registra uma saída de caixa.
              </p>
              <div className="form-group">
                <label className="form-label">Valor a Devolver (R$)</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  max={detailData?.credito?.saldo}
                  placeholder="0.00"
                  value={devolverValor}
                  onChange={e => setDevolverValor(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Motivo</label>
                <input
                  className="form-input"
                  value={devolverMotivo}
                  onChange={e => setDevolverMotivo(e.target.value)}
                  placeholder="Restituição de crédito em espécie"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModalDevolver(false)} disabled={devolverSubmitting}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleConfirmDevolver} disabled={devolverSubmitting}>
                {devolverSubmitting ? 'Registrando…' : 'Confirmar Devolução'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL DE CONFIRMAÇÃO DE ESTORNO DE MOVIMENTO */}
      {confirmEstornoMov && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={() => setConfirmEstornoMov(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Estornar Movimento</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmEstornoMov(null)}>✕</button>
            </div>
            <div className="modal-body modal-body-dense">
              <p>Deseja realmente estornar o movimento de <strong>{fmt(confirmEstornoMov.valor)}</strong>?</p>
              <p style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>
                Motivo: {confirmEstornoMov.motivo || confirmEstornoMov.tipo}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmEstornoMov(null)} disabled={estornoSubmitting}>
                Cancelar
              </button>
              <button
                className="btn"
                style={{ background:'var(--color-error)', color:'white' }}
                onClick={handleConfirmEstorno}
                disabled={estornoSubmitting}
              >
                {estornoSubmitting ? 'Estornando…' : 'Confirmar Estorno'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE CLIENTE */}
      {confirmDel && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Excluir Cliente</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(null)}>✕</button>
            </div>
            <div className="modal-body modal-body-dense">
              <p>Tem certeza que deseja excluir <strong>{confirmDel.name}</strong>?</p>
              <p style={{ marginTop:'var(--space-2)', fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>
                ⚠️ As ordens de serviço vinculadas a este cliente <strong>não serão excluídas</strong>, apenas a referência ao cliente será removida.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="btn" style={{ background:'var(--color-error)', color:'white' }}
                onClick={() => handleDelete(confirmDel.id)} disabled={deleting === confirmDel.id}>
                {deleting === confirmDel.id ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
