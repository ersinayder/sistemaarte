import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/Login'

const Dashboard    = React.lazy(() => import('./pages/Dashboard'))
const Atendimento  = React.lazy(() => import('./pages/Atendimento'))
const Caixa        = React.lazy(() => import('./pages/Caixa'))
const Ordens       = React.lazy(() => import('./pages/Ordens'))
const OrdemDetalhe = React.lazy(() => import('./pages/OrdemDetalhe'))
const OrdemLixeira = React.lazy(() => import('./pages/OrdemLixeira'))
const Oficina      = React.lazy(() => import('./pages/Oficina'))
const Financeiro   = React.lazy(() => import('./pages/Financeiro'))
const Usuarios     = React.lazy(() => import('./pages/Usuarios'))
const Clientes     = React.lazy(() => import('./pages/Clientes'))
const Orcamento    = React.lazy(() => import('./pages/NovaProposta'))
const CalculadoraOrcamento = React.lazy(() => import('./pages/Orcamento'))
const Propostas    = React.lazy(() => import('./pages/Propostas'))
const Produtos     = React.lazy(() => import('./pages/Produtos'))
const NotasFiscais = React.lazy(() => import('./pages/NotasFiscais'))
const Configuracoes = React.lazy(() => import('./pages/Configuracoes'))

function PrivateRoute({ children, permissions }) {
  const { user, loading, canAny } = useAuth()
  if (loading) return <div className="loading-center"><div className="spinner"/></div>
  if (!user)   return <Navigate to="/login" replace />
  if (permissions && !canAny(permissions)) return <Navigate to="/" replace />
  return children
}

function SemAcesso() {
  return (
    <div className="loading-center" style={{ flexDirection: 'column', gap: 'var(--space-2)', textAlign: 'center' }}>
      <strong>Sem acesso disponivel</strong>
      <span style={{ color: 'var(--color-text-muted)', maxWidth: 420 }}>
        Seu usuario esta ativo, mas nao possui permissao para acessar os modulos do sistema.
      </span>
    </div>
  )
}

function AppRoutes() {
  const { user, loading, canAny } = useAuth()
  if (loading) return <div className="loading-center"><div className="spinner"/></div>
  if (!user)   return <Routes><Route path="*" element={<LoginPage />} /></Routes>

  const firstAllowedRoute = [
    [canAny(['atendimento.ver']), '/atendimento'],
    [canAny(['oficina.ver']), '/oficina'],
    [canAny(['dashboard.ver']), '/dashboard'],
    [canAny(['ordens.ver']), '/ordens'],
    [canAny(['caixa.ver']), '/caixa'],
    [canAny(['propostas.ver']), '/propostas'],
    [canAny(['nfe.ver']), '/nfe'],
    [canAny(['clientes.ver']), '/clientes'],
    [canAny(['produtos.ver']), '/produtos'],
    [canAny(['financeiro.ver', 'financeiro.contas_pagar.ver', 'financeiro.relatorios']), '/financeiro'],
    [canAny(['usuarios.ver']), '/usuarios'],
    [canAny(['configuracoes.ver', 'configuracoes.editar_empresa', 'configuracoes.editar_fiscal', 'configuracoes.editar_whatsapp', 'configuracoes.editar_impressao', 'configuracoes.seguranca', 'backups.ver', 'backups.executar']), '/configuracoes'],
  ].find(([allowed]) => allowed)?.[1]
  const defaultRoute = firstAllowedRoute || '/sem-acesso'

  return (
    <React.Suspense fallback={<div className="loading-center"><div className="spinner"/></div>}>
      <Routes>
        <Route path="/login" element={<Navigate to={defaultRoute} replace />} />
        <Route element={<Layout />}>
          <Route index element={<Navigate to={defaultRoute} replace />} />
          <Route path="/oficina" element={<PrivateRoute permissions={['oficina.ver']}><Oficina /></PrivateRoute>}/>
          <Route path="/oficina/:id" element={<PrivateRoute permissions={['oficina.ver', 'ordens.ver']}><OrdemDetalhe context="oficina" /></PrivateRoute>}/>
          <Route path="/atendimento" element={<PrivateRoute permissions={['atendimento.ver']}><Atendimento /></PrivateRoute>}/>
          <Route path="/dashboard" element={<PrivateRoute permissions={['dashboard.ver']}><Dashboard /></PrivateRoute>}/>
          <Route path="/ordens" element={<PrivateRoute permissions={['ordens.ver']}><Ordens /></PrivateRoute>}/>
          <Route path="/ordens/lixeira" element={<PrivateRoute permissions={['ordens.excluir', 'ordens.restaurar', 'ordens.excluir_permanente']}><OrdemLixeira /></PrivateRoute>}/>
          <Route path="/ordens/:id" element={<PrivateRoute permissions={['ordens.ver']}><OrdemDetalhe /></PrivateRoute>}/>
          <Route path="/caixa" element={<PrivateRoute permissions={['caixa.ver']}><Caixa /></PrivateRoute>}/>
          <Route path="/caixa/:id" element={<PrivateRoute permissions={['caixa.ver']}><Caixa /></PrivateRoute>}/>
          <Route path="/clientes" element={<PrivateRoute permissions={['clientes.ver']}><Clientes /></PrivateRoute>}/>
          <Route path="/clientes/:id" element={<PrivateRoute permissions={['clientes.ver']}><Clientes /></PrivateRoute>}/>
          <Route path="/financeiro" element={<PrivateRoute permissions={['financeiro.ver', 'financeiro.contas_pagar.ver', 'financeiro.relatorios']}><Financeiro /></PrivateRoute>}/>
          <Route path="/relatorios" element={<Navigate to="/financeiro" replace />}/>
          <Route path="/orcamento" element={<PrivateRoute permissions={['propostas.criar']}><Orcamento /></PrivateRoute>}/>
          <Route path="/orcamento/calculadora" element={<PrivateRoute permissions={['ordens.criar', 'propostas.criar']}><CalculadoraOrcamento /></PrivateRoute>}/>
          <Route path="/orcamento-rapido" element={<Navigate to="/orcamento/calculadora" replace />}/>
          <Route path="/propostas" element={<PrivateRoute permissions={['propostas.ver']}><Propostas /></PrivateRoute>}/>
          <Route path="/produtos" element={<PrivateRoute permissions={['produtos.ver']}><Produtos /></PrivateRoute>}/>
          <Route path="/usuarios" element={<PrivateRoute permissions={['usuarios.ver']}><Usuarios /></PrivateRoute>}/>
          <Route path="/configuracoes" element={<PrivateRoute permissions={['configuracoes.ver', 'configuracoes.editar_empresa', 'configuracoes.editar_fiscal', 'configuracoes.editar_whatsapp', 'configuracoes.editar_impressao', 'configuracoes.seguranca', 'backups.ver', 'backups.executar']}><Configuracoes /></PrivateRoute>}/>
          <Route path="/nfe" element={<PrivateRoute permissions={['nfe.ver']}><NotasFiscais /></PrivateRoute>}/>
          <Route path="/nfe/lixeira" element={<PrivateRoute permissions={['nfe.lixeira']}><NotasFiscais lixeira /></PrivateRoute>}/>
          <Route path="/sem-acesso" element={<SemAcesso />}/>
          <Route path="*" element={<Navigate to={defaultRoute} replace />} />
        </Route>
      </Routes>
    </React.Suspense>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
