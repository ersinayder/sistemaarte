import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/Login'

const Dashboard    = React.lazy(() => import('./pages/Dashboard'))
const Caixa        = React.lazy(() => import('./pages/Caixa'))
const Ordens       = React.lazy(() => import('./pages/Ordens'))
const OrdemDetalhe = React.lazy(() => import('./pages/OrdemDetalhe'))
const OrdemLixeira = React.lazy(() => import('./pages/OrdemLixeira'))
const Oficina      = React.lazy(() => import('./pages/Oficina'))
const Financeiro   = React.lazy(() => import('./pages/Financeiro'))
const Usuarios     = React.lazy(() => import('./pages/Usuarios'))
const Clientes     = React.lazy(() => import('./pages/Clientes'))
const Orcamento    = React.lazy(() => import('./pages/Orcamento'))
const Propostas    = React.lazy(() => import('./pages/Propostas'))
const Produtos     = React.lazy(() => import('./pages/Produtos'))
const NotasFiscais = React.lazy(() => import('./pages/NotasFiscais'))
const Configuracoes = React.lazy(() => import('./pages/Configuracoes'))

function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-center"><div className="spinner"/></div>
  if (!user)   return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-center"><div className="spinner"/></div>
  if (!user)   return <Routes><Route path="*" element={<LoginPage />} /></Routes>

  const defaultRoute = user.role === 'oficina' ? '/oficina' : '/dashboard'

  return (
    <React.Suspense fallback={<div className="loading-center"><div className="spinner"/></div>}>
      <Routes>
        <Route path="/login" element={<Navigate to={defaultRoute} replace />} />
        <Route element={<Layout />}>
          <Route index element={<Navigate to={defaultRoute} replace />} />
          <Route path="/oficina" element={<PrivateRoute><Oficina /></PrivateRoute>}/>
          <Route path="/oficina/:id" element={<PrivateRoute><OrdemDetalhe context="oficina" /></PrivateRoute>}/>
          <Route path="/dashboard" element={<PrivateRoute roles={['admin','caixa']}><Dashboard /></PrivateRoute>}/>
          <Route path="/ordens" element={<PrivateRoute roles={['admin','caixa']}><Ordens /></PrivateRoute>}/>
          <Route path="/ordens/lixeira" element={<PrivateRoute roles={['admin']}><OrdemLixeira /></PrivateRoute>}/>
          <Route path="/ordens/:id" element={<PrivateRoute roles={['admin','caixa']}><OrdemDetalhe /></PrivateRoute>}/>
          <Route path="/caixa" element={<PrivateRoute roles={['admin','caixa']}><Caixa /></PrivateRoute>}/>
          <Route path="/caixa/:id" element={<PrivateRoute roles={['admin','caixa']}><Caixa /></PrivateRoute>}/>
          <Route path="/clientes" element={<PrivateRoute roles={['admin','caixa']}><Clientes /></PrivateRoute>}/>
          <Route path="/clientes/:id" element={<PrivateRoute roles={['admin','caixa']}><Clientes /></PrivateRoute>}/>
          <Route path="/financeiro" element={<PrivateRoute roles={['admin']}><Financeiro /></PrivateRoute>}/>
          <Route path="/relatorios" element={<Navigate to="/financeiro" replace />}/>
          <Route path="/orcamento" element={<PrivateRoute roles={['admin','caixa']}><Orcamento /></PrivateRoute>}/>
          <Route path="/propostas" element={<PrivateRoute roles={['admin','caixa']}><Propostas /></PrivateRoute>}/>
          <Route path="/produtos" element={<PrivateRoute roles={['admin','caixa']}><Produtos /></PrivateRoute>}/>
          <Route path="/usuarios" element={<PrivateRoute roles={['admin']}><Usuarios /></PrivateRoute>}/>
          <Route path="/configuracoes" element={<PrivateRoute roles={['admin']}><Configuracoes /></PrivateRoute>}/>
          <Route path="/nfe" element={<PrivateRoute roles={['admin','caixa']}><NotasFiscais /></PrivateRoute>}/>
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
