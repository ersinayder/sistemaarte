import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/Login'

const Dashboard    = React.lazy(() => import('./pages/Dashboard'))
const Caixa        = React.lazy(() => import('./pages/Caixa'))
const Ordens       = React.lazy(() => import('./pages/Ordens'))
const OrdemDetalhe = React.lazy(() => import('./pages/OrdemDetalhe'))
const Oficina      = React.lazy(() => import('./pages/Oficina'))
const Relatorios   = React.lazy(() => import('./pages/Relatorios'))
const Usuarios     = React.lazy(() => import('./pages/Usuarios'))
const Clientes     = React.lazy(() => import('./pages/Clientes'))

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

  // Rota padrão por role
  const defaultRoute = user.role === 'oficina' ? '/oficina' : '/dashboard'

  return (
    <React.Suspense fallback={<div className="loading-center"><div className="spinner"/></div>}>
      <Routes>
        <Route path="/login" element={<Navigate to={defaultRoute} replace />} />
        <Route element={<Layout />}>

          {/* Rota raiz redireciona para o default do role */}
          <Route index element={<Navigate to={defaultRoute} replace />} />

          {/* Fila da Oficina — todos os roles acessam */}
          <Route path="/oficina" element={
            <PrivateRoute><Oficina /></PrivateRoute>
          }/>

          {/* Admin e Caixa */}
          <Route path="/dashboard" element={
            <PrivateRoute roles={['admin','caixa']}><Dashboard /></PrivateRoute>
          }/>
          <Route path="/ordens" element={
            <PrivateRoute roles={['admin','caixa']}><Ordens /></PrivateRoute>
          }/>
          <Route path="/ordens/:id" element={
            <PrivateRoute roles={['admin','caixa']}><OrdemDetalhe /></PrivateRoute>
          }/>
          <Route path="/caixa" element={
            <PrivateRoute roles={['admin','caixa']}><Caixa /></PrivateRoute>
          }/>
          <Route path="/clientes" element={
            <PrivateRoute roles={['admin','caixa']}><Clientes /></PrivateRoute>
          }/>
          <Route path="/relatorios" element={
            <PrivateRoute roles={['admin','caixa']}><Relatorios /></PrivateRoute>
          }/>

          {/* Só admin */}
          <Route path="/usuarios" element={
            <PrivateRoute roles={['admin']}><Usuarios /></PrivateRoute>
          }/>

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
