import { createBrowserRouter, Navigate } from 'react-router-dom'
import { useContext } from 'react'
import { AuthContext } from './context/AuthContext.jsx'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Error from './pages/Error'

function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useContext(AuthContext);

  if (loading) return <div>Carregando...</div>;

  return isAuthenticated ? children : <Navigate to="/login" />;
}

function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useContext(AuthContext);

  if (loading) return <div>Carregando...</div>;

  return isAuthenticated ? <Navigate to="/" /> : children;
}


export const router = createBrowserRouter([
  {
    path: '/',
    element: <PrivateRoute><Dashboard/></PrivateRoute>
  },
  {
    path: '/login',
    element: <PublicRoute><Login/></PublicRoute>
  },
  {
    path: '*',
    element: <Error/>
  }
])
