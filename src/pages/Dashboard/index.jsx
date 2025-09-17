import { useState, useContext, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from '../../context/AuthContext'
import api from '../../config/api'

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview')
  const [showLogout, setShowLogout] = useState(false)
  const navigate = useNavigate()
  const { handleLogout, user } = useContext(AuthContext)
  // Blocklist state (fetched from API). Each item: { id: number|null, address: string }
  const [blocklist, setBlocklist] = useState([])
  const [newAddress, setNewAddress] = useState('')
  const [blockError, setBlockError] = useState(null)

  const saveBlocklist = (list) => {
    setBlocklist(list)
  }

  // load blocklist from API on mount
  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const { data } = await api.get('/v1/blocklist')
        if (!mounted) return
        // server may return an array of strings or objects
        const raw = data?.blockedAddresses ?? data ?? []
        const normalized = Array.isArray(raw) ? raw.map(item => {
          if (!item) return null
          if (typeof item === 'string') return { id: null, address: item }
          // object shape: might be { id, address } or { blocked: { id, address } }
          if (item.address) return { id: item.id ?? null, address: item.address }
          if (item.blocked) return { id: item.blocked.id ?? null, address: item.blocked.address }
          // fallback — stringify
          return { id: item.id ?? null, address: String(item) }
        }).filter(Boolean) : []
        setBlocklist(normalized)
      } catch (e) {
        // fallback: keep empty
        console.error('Failed to load blocklist:', e)
      }
    }
    load()
    return () => { mounted = false }
  }, [])

  const addAddress = () => {
    setBlockError(null)
    const addr = newAddress.trim()
    if (!addr) { setBlockError('Informe um endereço'); return }
    // simple validation: 26-64 chars (hex or base58), adjust as needed
    if (!/^[0-9a-zA-Z]{26,64}$/.test(addr)) { setBlockError('Endereço inválido'); return }
  if (blocklist.some(item => (item?.address ?? item) === addr)) { setBlockError('Endereço já existe na blocklist'); return }
    // post to API
    (async () => {
      try {
        const { data } = await api.post('/v1/blocklist', { address: addr })
        // server likely returns created record
        const createdRaw = data?.blocked ?? data ?? { address: addr }
        const created = (createdRaw && typeof createdRaw === 'object') ?
          { id: createdRaw.id ?? null, address: createdRaw.address ?? String(createdRaw) } :
          { id: null, address: String(createdRaw) }
        saveBlocklist([created, ...blocklist])
        setNewAddress('')
      } catch (e) {
        console.error('Failed to add address:', e)
        setBlockError('Falha ao adicionar endereço')
      }
    })()
  }

  const removeAddress = (addr) => {
    // attempt to remove via API if server supports delete by address
    ;(async () => {
      try {
        // if caller passed an id (numeric or string id), prefer deleting by id
        if (typeof addr === 'object' && addr.id != null) {
          await api.delete(`/v1/blocklist/${encodeURIComponent(String(addr.id))}`)
        } else if (typeof addr === 'string' && /^[0-9]+$/.test(addr)) {
          await api.delete(`/v1/blocklist/${encodeURIComponent(addr)}`)
        } else if (typeof addr === 'string') {
          // try delete by id-like or fallback to delete by body address
          try {
            await api.delete(`/v1/blocklist/${encodeURIComponent(addr)}`)
          } catch (e) {
            await api.delete('/v1/blocklist', { data: { address: addr } })
          }
        } else {
          // unknown shape — attempt delete by address field
          await api.delete('/v1/blocklist', { data: { address: addr.address ?? String(addr) } })
        }
      } catch (e) {
        // ignore server delete errors but log
        console.error('Failed to delete from server:', e)
      } finally {
        const updated = blocklist.filter(item => {
          if (!item) return false
          if (typeof addr === 'object' && addr.id != null) return item.id !== addr.id
          return item.address !== (typeof addr === 'string' ? addr : (addr.address ?? String(addr)))
        })
        saveBlocklist(updated)
      }
    })()
  }

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Sidebar */}
      <aside className="w-20 bg-gray-900 border-r border-gray-800 py-6 flex flex-col items-center gap-6">
        <div className="logo w-10 h-10 rounded bg-gray-800" />
        <nav className="flex-1 flex flex-col items-center gap-4">
          <button onClick={() => setActiveTab('overview')} className={`w-full py-2 text-xs ${activeTab==='overview' ? 'text-red-300' : 'text-gray-400'}`}>Overview</button>
          <button onClick={() => setActiveTab('blocklist')} className={`w-full py-2 text-xs ${activeTab==='blocklist' ? 'text-red-300' : 'text-gray-400'}`}>Blocklist</button>
          <button onClick={() => setActiveTab('agents')} className={`w-full py-2 text-xs ${activeTab==='agents' ? 'text-red-300' : 'text-gray-400'}`}>Agents</button>
        </nav>

        <div className="avatar-area w-full flex items-center justify-center">
          <button onClick={() => setShowLogout(true)} className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-sm font-medium" aria-label="profile">
            {((user?.name || user?.email || 'U')[0] || 'U').toUpperCase()}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8">
        <header className="flex items-center justify-between mb-6">
          {/* derive a friendly display name from user */}
          {(() => {
            const raw = user?.name || user?.firstName || user?.given_name || user?.email || ''
            const first = (raw && String(raw).split(/[\s@]/)[0]) || 'User'
            return <h1 className="text-2xl font-semibold">Hey there, {first}!</h1>
          })()}
          <div className="text-sm text-gray-400">Welcome back, we're happy to have you here!</div>
        </header>

        <section>
          {activeTab === 'overview' && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-gray-800 rounded">$27,340<br/><span className="text-xs text-gray-400">Total Expenses</span></div>
              <div className="p-4 bg-gray-800 rounded">$128.47<br/><span className="text-xs text-gray-400">Total Expenses</span></div>
              <div className="p-4 bg-gray-800 rounded">$990.66<br/><span className="text-xs text-gray-400">Total Expenses</span></div>
            </div>
          )}

          {activeTab === 'blocklist' && (
            <div className="p-4 bg-gray-800 rounded">
              <h3 className="text-lg font-semibold mb-3">Blocklist</h3>
              <div className="flex gap-2 mb-3">
                <input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded" placeholder="Enter wallet address" />
                <button onClick={addAddress} className="px-4 py-2 bg-red-600 rounded">Add</button>
              </div>
              {blockError && <div className="text-red-400 text-sm mb-2">{blockError}</div>}

              <div className="space-y-2 max-h-64 overflow-auto">
                {blocklist.length === 0 && <div className="text-gray-400 text-sm">No addresses yet</div>}
                {blocklist.map(item => (
                  <div key={item.id ?? item.address} className="flex items-center justify-between bg-gray-800 p-2 rounded">
                    <div className="text-sm text-gray-100 truncate">{item.address}</div>
                    <div className="flex gap-2">
                      <button onClick={() => removeAddress(item)} className="text-red-400">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'agents' && (
            <div className="p-4 bg-gray-800 rounded">List of running agents and their status.</div>
          )}
        </section>
      </main>

      {/* Logout slideover panel (bottom-left) */}
      {showLogout && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowLogout(false)} />

          <aside className="absolute bottom-6 left-6 w-80 bg-gray-900/95 border border-gray-800 rounded-xl shadow-lg p-4 slide-panel">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-white text-lg font-semibold">Configurações e suporte</h3>
                <p className="text-gray-400 text-xs mt-1">Ajustes e ações rápidas da sua conta</p>
              </div>
              <button onClick={() => setShowLogout(false)} aria-label="close" className="text-gray-400 hover:text-white">✕</button>
            </div>

            <div className="mt-4 divide-y divide-gray-800">
              <div className="py-3 space-y-2">
                <button className="w-full text-left text-gray-200 hover:text-white py-2 rounded">Configurações</button>
                <button className="w-full text-left text-gray-200 hover:text-white py-2 rounded">Ajuste do feed inicial</button>
                <button className="w-full text-left text-gray-200 hover:text-white py-2 rounded">Contas externas conectadas</button>
                <button className="w-full text-left text-gray-200 hover:text-white py-2 rounded">Central de Denúncias e Violações</button>
              </div>

              <div className="py-3 space-y-2">
                <div className="text-xs text-gray-500 uppercase">Suporte</div>
                <button className="w-full text-left text-gray-200 hover:text-white py-2 rounded">Central de Ajuda</button>
                <button className="w-full text-left text-gray-200 hover:text-white py-2 rounded">Remoções</button>
                <button className="w-full text-left text-gray-200 hover:text-white py-2 rounded">Política de Privacidade</button>
              </div>

              <div className="py-3 flex flex-col gap-2">
                <button onClick={async () => { await handleLogout(); setShowLogout(false); navigate('/login'); }} className="w-full py-2 rounded bg-red-600 text-white">Logout</button>
                <button onClick={() => setShowLogout(false)} className="w-full py-2 rounded bg-gray-700 text-white">Cancelar</button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
