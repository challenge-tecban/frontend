import { useState, useContext, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from '../../context/AuthContext'
import api from '../../config/api'
import axios from 'axios'

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview')
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [showLogout, setShowLogout] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)
  })
  const navigate = useNavigate()
  const { handleLogout, user } = useContext(AuthContext)
  // Blocklist state (fetched from API). Each item: { id: number|null, address: string }
  const [blocklist, setBlocklist] = useState([])
  const [newAddress, setNewAddress] = useState('')
  const [blockError, setBlockError] = useState(null)
  
  // Blockchain transactions state
  const [transactions, setTransactions] = useState([])
  const [transactionsLoading, setTransactionsLoading] = useState(false)
  const [transactionsError, setTransactionsError] = useState(null)
  const [analytics, setAnalytics] = useState({
    totalTransactions: 0,
    totalVolume: '0',
    uniqueAddresses: 0
  })
  
  // Wallet analysis state
  const [walletAddress, setWalletAddress] = useState('')
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [analysisError, setAnalysisError] = useState(null)
  const [analysisHistory, setAnalysisHistory] = useState([])
  
  // Etherscan API configuration
  const ETHERSCAN_API_KEY = 'QVSTYQRUSV39EH3RC3IWQJ3EQVSIZDSD1S' // Replace with your actual API key
  const ETHERSCAN_BASE_URL = 'https://api.etherscan.io/v2/api'

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

  // Persist theme preference
  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light')
  }, [isDarkMode])

  // Load transactions when overview tab is active
  useEffect(() => {
    if (activeTab === 'overview') {
      fetchTransactions()
    }
  }, [activeTab])

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode)
  }

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

  // Fetch latest ERC-20 token transfers from Etherscan
  const fetchTransactions = async () => {
    setTransactionsLoading(true)
    setTransactionsError(null)
    
    try {
      // Get ERC-20 token transfers - fetch maximum available
      const response = await axios.get(ETHERSCAN_BASE_URL, {
        params: {
          chainid: 1,
          module: 'account',
          action: 'tokentx',
          address: '0x4e83362442b8d1bec281594cea3050c8eb01311c', // Example address from the API documentation
          page: 1,
          offset: 1000, // Get maximum transactions allowed by API
          startblock: 0,
          endblock: 99999999,
          sort: 'desc',
          apikey: ETHERSCAN_API_KEY
        }
      })

      if (response.data.status === '1' && response.data.result) {
        const txs = response.data.result
        
        // Show all transactions at once
        setTransactions(txs)
        
        // Calculate analytics using all data
        calculateAnalytics(txs)
      } else {
        setTransactionsError('No token transfers found or API limit reached')
        // Clear data when API fails
        setTransactions([])
        setAnalytics({
          totalTransactions: 0,
          totalVolume: '0',
          uniqueAddresses: 0
        })
      }
    } catch (error) {
      console.error('Error fetching token transfers:', error)
      setTransactionsError('Failed to fetch token transfers from API')
      
      // Clear data when API fails
      setTransactions([])
      setAnalytics({
        totalTransactions: 0,
        totalVolume: '0',
        uniqueAddresses: 0
      })
    } finally {
      setTransactionsLoading(false)
    }
  }







  // Calculate analytics from transactions
  const calculateAnalytics = (txs) => {
    if (!txs || txs.length === 0) return

    const totalTxs = txs.length
    let totalVol = 0
    const addresses = new Set()

    txs.forEach(tx => {
      // Convert token value considering decimals
      const decimals = parseInt(tx.tokenDecimal) || 18
      const valueInToken = parseFloat(tx.value) / Math.pow(10, decimals)
      totalVol += valueInToken
      
      addresses.add(tx.from)
      addresses.add(tx.to)
    })

    setAnalytics({
      totalTransactions: totalTxs,
      totalVolume: totalVol.toFixed(4),
      uniqueAddresses: addresses.size
    })
  }

  // Format token value considering decimals
  const formatTokenValue = (value, decimals) => {
    const tokenDecimals = parseInt(decimals) || 18
    const tokenValue = parseFloat(value) / Math.pow(10, tokenDecimals)
    return tokenValue.toFixed(6)
  }

  // Format timestamp to readable date
  const formatDate = (timestamp) => {
    return new Date(parseInt(timestamp) * 1000).toLocaleString()
  }

  // Analyze wallet function
  const analyzeWallet = async () => {
    if (!walletAddress.trim()) {
      setAnalysisError('Please enter a wallet address')
      return
    }

    // Basic wallet address validation
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress.trim())) {
      setAnalysisError('Please enter a valid Ethereum wallet address')
      return
    }

    setAnalysisLoading(true)
    setAnalysisError(null)
    setAnalysisResult(null)

    try {
      const response = await axios.post('http://localhost:5000/api/analyze-simple', {
        address: walletAddress.trim()
      })

      if (response.data) {
        setAnalysisResult(response.data)
        // Add to history
        const newAnalysis = {
          id: Date.now(),
          address: walletAddress.trim(),
          result: response.data,
          timestamp: new Date().toISOString()
        }
        setAnalysisHistory(prev => [newAnalysis, ...prev.slice(0, 4)]) // Keep last 5 analyses
        setWalletAddress('') // Clear input after successful analysis
      } else {
        setAnalysisError('No analysis data received from server')
      }
    } catch (error) {
      console.error('Error analyzing wallet:', error)
      setAnalysisError(
        error.response?.data?.message || 
        error.response?.data?.error || 
        'Failed to analyze wallet. Please try again.'
      )
    } finally {
      setAnalysisLoading(false)
    }
  }

  // Clear analysis results
  const clearAnalysis = () => {
    setAnalysisResult(null)
    setAnalysisError(null)
    setWalletAddress('')
  }



  // Theme variables
  const theme = {
    // Background colors
    bg: isDarkMode ? 'bg-black' : 'bg-gray-50',
    text: isDarkMode ? 'text-white' : 'text-gray-900',
    
    // Sidebar
    sidebarBg: isDarkMode ? 'bg-gray-900' : 'bg-white',
    sidebarBorder: isDarkMode ? 'border-gray-800' : 'border-gray-200',
    
    // Logo
    logoBg: isDarkMode ? 'bg-red-600' : 'bg-black',
    
    // Navigation buttons
    navActive: isDarkMode ? 'text-red-300 bg-red-600/20' : 'text-black bg-gray-100',
    navInactive: isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-black hover:bg-gray-50',
    
    // Toggle button
    toggleBg: isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200',
    toggleIcon: isDarkMode ? 'text-gray-400' : 'text-gray-600',
    
    // Avatar
    avatarBg: isDarkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    avatarText: isDarkMode ? 'text-white' : 'text-black',
    avatarSubtext: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    
    // Cards
    cardBg: isDarkMode ? 'bg-gray-800' : 'bg-white',
    cardBorder: isDarkMode ? 'border-gray-700' : 'border-gray-200',
    cardText: isDarkMode ? 'text-white' : 'text-gray-900',
    cardSubtext: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    cardSecondaryBg: isDarkMode ? 'bg-gray-700' : 'bg-gray-50',
    
    // Inputs
    inputBg: isDarkMode ? 'bg-gray-900' : 'bg-white',
    inputBorder: isDarkMode ? 'border-gray-600' : 'border-gray-300',
    inputText: isDarkMode ? 'text-white placeholder-gray-400' : 'text-gray-900 placeholder-gray-500',
    inputFocus: isDarkMode ? 'focus:border-red-500 focus:ring-red-500' : 'focus:border-blue-500 focus:ring-blue-500',
    
    // Buttons
    buttonPrimary: isDarkMode ? 'bg-red-600 text-white' : 'bg-black text-white',
    buttonPrimaryHover: isDarkMode ? 'bg-red-700' : 'bg-gray-800',
    buttonSecondary: isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    buttonDanger: isDarkMode ? 'bg-red-600 text-white' : 'bg-red-600 text-white',
    buttonDangerHover: isDarkMode ? 'bg-red-700' : 'bg-red-700',
    
    // Modal
    modalBg: isDarkMode ? 'bg-gray-900' : 'bg-white',
    modalText: isDarkMode ? 'text-white' : 'text-gray-900',
    modalSubtext: isDarkMode ? 'text-gray-400' : 'text-gray-500'
  }

  return (
    <div className={`min-h-screen ${theme.bg} ${theme.text} flex flex-col md:flex-row`}>
      {/* Sidebar */}
      <aside className={`${theme.sidebarBg} border-r ${theme.sidebarBorder} transition-all duration-300 ${sidebarExpanded ? 'md:w-64 w-full' : 'md:w-16 w-full'}`}>
        {/* Mobile: horizontal layout */}
        <div className={`md:hidden flex items-center justify-between px-4 py-3 border-b ${theme.sidebarBorder}`}>
          <div className={`w-8 h-8 rounded-lg ${theme.logoBg} flex items-center justify-center`}>
            <div className="w-4 h-4 rounded bg-white"></div>
          </div>
          <nav className="flex items-center gap-1">
            <button 
              onClick={() => setActiveTab('overview')} 
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all ${activeTab==='overview' ? theme.navActive : theme.navInactive}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5v6m4-6v6m4-6v6" />
              </svg>
              <span>Dashboard</span>
            </button>
            <button 
              onClick={() => setActiveTab('blocklist')} 
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all ${activeTab==='blocklist' ? theme.navActive : theme.navInactive}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <span>Blocklist</span>
            </button>
            <button 
              onClick={() => setActiveTab('agents')} 
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all ${activeTab==='agents' ? theme.navActive : theme.navInactive}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
              <span>Agents</span>
            </button>
          </nav>
          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className={`w-8 h-8 rounded-lg ${theme.toggleBg} flex items-center justify-center transition-all`}
              aria-label="Toggle theme"
            >
              {isDarkMode ? (
                <svg className={`w-4 h-4 ${theme.toggleIcon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className={`w-4 h-4 ${theme.toggleIcon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            <button onClick={() => setShowLogout(true)} className={`w-8 h-8 rounded-full ${theme.avatarBg} flex items-center justify-center text-sm font-medium transition-colors`} aria-label="profile">
              {((user?.name || user?.email || 'U')[0] || 'U').toUpperCase()}
            </button>
          </div>
        </div>

        {/* Desktop: vertical layout */}
        <div className="hidden md:flex md:flex-col md:h-full">
          {/* Header */}
          <div className={`flex items-center ${sidebarExpanded ? 'justify-between' : 'justify-center'} p-4 border-b ${theme.sidebarBorder}`}>
            {sidebarExpanded && (
              <div className={`w-8 h-8 rounded-lg ${theme.logoBg} flex items-center justify-center`}>
                <div className="w-4 h-4 rounded bg-white"></div>
              </div>
            )}
            
            <div className="flex items-center gap-1">
              {/* Show theme toggle only when sidebar is expanded */}
              {sidebarExpanded && (
                <button
                  onClick={toggleTheme}
                  className={`w-6 h-6 rounded-md ${theme.toggleBg} flex items-center justify-center transition-all duration-200`}
                  aria-label="Toggle theme"
                >
                  {isDarkMode ? (
                    <svg className={`w-3 h-3 ${theme.toggleIcon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  ) : (
                    <svg className={`w-3 h-3 ${theme.toggleIcon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  )}
                </button>
              )}
              
              {/* Sidebar collapse button - always visible */}
              <button
                onClick={() => setSidebarExpanded(!sidebarExpanded)}
                className={`w-6 h-6 rounded-md ${theme.toggleBg} flex items-center justify-center transition-all duration-200 ${!sidebarExpanded ? 'mx-auto' : ''}`}
                aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              >
                <svg className={`w-3 h-3 ${theme.toggleIcon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {sidebarExpanded ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  )}
                </svg>
              </button>
            </div>
          </div>
          
          {/* Navigation */}
          <nav className="flex-1 py-4 px-3 space-y-1">
            <button 
              onClick={() => setActiveTab('overview')} 
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-all ${activeTab==='overview' ? theme.navActive : theme.navInactive} ${sidebarExpanded ? 'justify-start' : 'justify-center'}`}
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5v6m4-6v6m4-6v6" />
              </svg>
              {sidebarExpanded && <span className="font-medium">Dashboard</span>}
            </button>
            
            <button 
              onClick={() => setActiveTab('blocklist')} 
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-all ${activeTab==='blocklist' ? theme.navActive : theme.navInactive} ${sidebarExpanded ? 'justify-start' : 'justify-center'}`}
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              {sidebarExpanded && <span className="font-medium">Blocklist</span>}
            </button>
            
            <button 
              onClick={() => setActiveTab('agents')} 
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-all ${activeTab==='agents' ? theme.navActive : theme.navInactive} ${sidebarExpanded ? 'justify-start' : 'justify-center'}`}
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
              {sidebarExpanded && <span className="font-medium">Agents</span>}
            </button>
          </nav>
          
          {/* Avatar no rodapé */}
          <div className={`p-4 border-t ${theme.sidebarBorder}`}>
            <button 
              onClick={() => setShowLogout(true)} 
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg ${theme.navInactive} transition-all ${sidebarExpanded ? 'justify-start' : 'justify-center'}`}
              aria-label="profile"
            >
              <div className={`w-8 h-8 rounded-full ${theme.avatarBg} flex items-center justify-center text-sm font-medium flex-shrink-0`}>
                {((user?.name || user?.email || 'U')[0] || 'U').toUpperCase()}
              </div>
              {sidebarExpanded && (
                <div className="text-left">
                  <div className={`font-medium text-sm ${theme.avatarText}`}>
                    {(() => {
                      const raw = user?.name || user?.firstName || user?.given_name || user?.username || user?.displayName || user?.email || ''
                      return (raw && String(raw).split(/[\s@]/)[0]) || 'User'
                    })()}
                  </div>
                  <div className={`text-xs ${theme.avatarSubtext}`}>View profile</div>
                </div>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 md:p-8 min-w-0 overflow-hidden">
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-2">
          {/* derive a friendly display name from user */}
          {(() => {
            // Try multiple possible user name fields
            const raw = user?.name || user?.firstName || user?.given_name || user?.username || user?.displayName || user?.email || ''
            const first = (raw && String(raw).split(/[\s@]/)[0]) || 'User'
            return <h1 className={`text-xl md:text-2xl font-semibold ${theme.text}`}>Hey there, {first}!</h1>
          })()}
          <div className={`text-sm ${theme.cardSubtext}`}>Welcome back, we're happy to have you here!</div>
        </header>

        <section className="min-w-0">
          {activeTab === 'overview' && (
            <div className="space-y-6 min-w-0">
              {/* Analytics Dashboard Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className={`p-4 ${theme.cardBg} rounded-lg border ${theme.cardBorder} hover:shadow-md transition-all`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`text-2xl font-bold ${theme.cardText}`}>{analytics.totalTransactions.toLocaleString()}</div>
                      <span className={`text-sm ${theme.cardSubtext}`}>Token Transfers</span>
                    </div>
                    <div className={`w-10 h-10 rounded-full ${isDarkMode ? 'bg-blue-600/20' : 'bg-blue-100'} flex items-center justify-center`}>
                      <svg className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                <div className={`p-4 ${theme.cardBg} rounded-lg border ${theme.cardBorder} hover:shadow-md transition-all`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`text-2xl font-bold ${theme.cardText}`}>{analytics.totalVolume}</div>
                      <span className={`text-sm ${theme.cardSubtext}`}>Token Volume</span>
                    </div>
                    <div className={`w-10 h-10 rounded-full ${isDarkMode ? 'bg-green-600/20' : 'bg-green-100'} flex items-center justify-center`}>
                      <svg className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                <div className={`p-4 ${theme.cardBg} rounded-lg border ${theme.cardBorder} hover:shadow-md transition-all`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`text-2xl font-bold ${theme.cardText}`}>{analytics.uniqueAddresses.toLocaleString()}</div>
                      <span className={`text-sm ${theme.cardSubtext}`}>Unique Addresses</span>
                    </div>
                    <div className={`w-10 h-10 rounded-full ${isDarkMode ? 'bg-purple-600/20' : 'bg-purple-100'} flex items-center justify-center`}>
                      <svg className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transactions Table */}
              <div className={`${theme.cardBg} rounded-lg border ${theme.cardBorder} shadow-sm min-w-0`}>
                <div className="p-4 md:p-6 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <h3 className={`text-lg font-semibold ${theme.cardText}`}>Recent ERC-20 Token Transfers</h3>
                    <div className="flex items-center gap-2">
                      {transactionsLoading && (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                          <span className={`text-sm ${theme.cardSubtext}`}>Loading...</span>
                        </div>
                      )}
                      <button
                        onClick={() => fetchTransactions()}
                        className={`px-3 py-1.5 text-sm ${theme.buttonSecondary} rounded-md transition-colors`}
                        disabled={transactionsLoading}
                      >
                        Refresh
                      </button>
                    </div>
                  </div>
                </div>

                {transactionsError && (
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400 text-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      {transactionsError}
                    </div>
                  </div>
                )}

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto overflow-y-auto max-h-[calc(100vh-28rem)] border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="w-full min-w-full">
                    <thead className={`${theme.cardSecondaryBg} border-b ${theme.cardBorder} sticky top-0 z-10`}>
                      <tr>
                        <th className={`px-4 py-3 text-left text-xs font-medium ${theme.cardSubtext} uppercase tracking-wider`}>Hash</th>
                        <th className={`px-4 py-3 text-left text-xs font-medium ${theme.cardSubtext} uppercase tracking-wider`}>Token</th>
                        <th className={`px-4 py-3 text-left text-xs font-medium ${theme.cardSubtext} uppercase tracking-wider`}>From</th>
                        <th className={`px-4 py-3 text-left text-xs font-medium ${theme.cardSubtext} uppercase tracking-wider`}>To</th>
                        <th className={`px-4 py-3 text-left text-xs font-medium ${theme.cardSubtext} uppercase tracking-wider`}>Value</th>
                        <th className={`px-4 py-3 text-left text-xs font-medium ${theme.cardSubtext} uppercase tracking-wider`}>Time</th>
                      </tr>
                    </thead>
                    <tbody className={`${theme.cardBg} divide-y ${theme.cardBorder}`}>
                      {transactions.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="px-4 py-8 text-center">
                            <div className={`text-sm ${theme.cardSubtext}`}>
                              {transactionsLoading ? 'Loading transactions...' : 
                               transactionsError ? 'Failed to load transactions from API' :
                               'No transactions available'}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        transactions.map((tx, index) => (
                        <tr key={tx.hash} className={`hover:${theme.cardSecondaryBg} transition-colors`}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className={`text-sm font-mono ${theme.cardText}`}>
                              {tx.hash.substring(0, 8)}...{tx.hash.substring(tx.hash.length - 6)}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className={`text-sm ${theme.cardText}`}>
                              <div className="font-medium">{tx.tokenSymbol || 'TOKEN'}</div>
                              <div className={`text-xs ${theme.cardSubtext} truncate max-w-[100px]`}>{tx.tokenName || 'Unknown Token'}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className={`text-sm font-mono ${theme.cardText}`}>
                              {tx.from.substring(0, 6)}...{tx.from.substring(tx.from.length - 4)}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className={`text-sm font-mono ${theme.cardText}`}>
                              {tx.to.substring(0, 6)}...{tx.to.substring(tx.to.length - 4)}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className={`text-sm font-medium ${theme.cardText}`}>
                              {formatTokenValue(tx.value, tx.tokenDecimal)} {tx.tokenSymbol}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className={`text-sm ${theme.cardSubtext}`}>
                              {formatDate(tx.timeStamp)}
                            </div>
                          </td>
                        </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-4 max-h-[calc(100vh-28rem)] overflow-y-auto">
                  {transactions.length === 0 ? (
                    <div className={`p-6 text-center ${theme.cardBg} rounded-lg border ${theme.cardBorder}`}>
                      <div className={`text-sm ${theme.cardSubtext}`}>
                        {transactionsLoading ? 'Loading transactions...' : 
                         transactionsError ? 'Failed to load transactions from API' :
                         'No transactions available'}
                      </div>
                    </div>
                  ) : (
                    transactions.map((tx, index) => (
                      <div key={tx.hash} className={`p-4 ${theme.cardBg} rounded-lg border ${theme.cardBorder} space-y-3`}>
                        <div className="flex items-center justify-between">
                          <div className={`text-sm ${theme.cardText}`}>
                            <div className="font-medium">{tx.tokenSymbol || 'TOKEN'}</div>
                            <div className={`text-xs ${theme.cardSubtext}`}>{tx.tokenName || 'Unknown Token'}</div>
                          </div>
                          <div className={`text-sm font-medium ${theme.cardText}`}>
                            {formatTokenValue(tx.value, tx.tokenDecimal)} {tx.tokenSymbol}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className={`text-xs font-medium ${theme.cardSubtext} uppercase tracking-wider mb-1`}>From</div>
                            <div className={`font-mono ${theme.cardText}`}>
                              {tx.from.substring(0, 6)}...{tx.from.substring(tx.from.length - 4)}
                            </div>
                          </div>
                          <div>
                            <div className={`text-xs font-medium ${theme.cardSubtext} uppercase tracking-wider mb-1`}>To</div>
                            <div className={`font-mono ${theme.cardText}`}>
                              {tx.to.substring(0, 6)}...{tx.to.substring(tx.to.length - 4)}
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-2 text-sm">
                          <div>
                            <div className={`text-xs font-medium ${theme.cardSubtext} uppercase tracking-wider mb-1`}>Hash</div>
                            <div className={`font-mono ${theme.cardText}`}>
                              {tx.hash.substring(0, 10)}...{tx.hash.substring(tx.hash.length - 8)}
                            </div>
                          </div>
                          <div>
                            <div className={`text-xs font-medium ${theme.cardSubtext} uppercase tracking-wider mb-1`}>Time</div>
                            <div className={`${theme.cardSubtext}`}>
                              {formatDate(tx.timeStamp)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Transaction Count Info */}
                <div className="px-4 md:px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <div className={`text-sm ${theme.cardSubtext}`}>
                    {transactions.length > 0 ? `Showing ${transactions.length} transactions` : 'No transactions to display'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'blocklist' && (
            <div className={`p-6 ${theme.cardBg} rounded-lg border ${theme.cardBorder}`}>
              <h3 className={`text-lg font-semibold mb-4 ${theme.cardText}`}>Blocklist</h3>
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <input 
                  value={newAddress} 
                  onChange={(e) => setNewAddress(e.target.value)} 
                  className={`flex-1 px-3 py-2 ${theme.inputBg} border ${theme.inputBorder} rounded-lg ${theme.inputText} ${theme.inputFocus} transition-all`}
                  placeholder="Enter wallet address" 
                />
                <button 
                  onClick={addAddress} 
                  className={`px-4 py-2 ${theme.buttonPrimary} rounded-lg font-medium whitespace-nowrap ${isDarkMode ? 'hover:bg-red-700' : 'hover:bg-gray-800'} transition-colors`}
                >
                  Add Address
                </button>
              </div>
              {blockError && <div className="text-red-600 text-sm mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">{blockError}</div>}

              <div className="space-y-2 max-h-64 overflow-auto">
                {blocklist.length === 0 && <div className={`${theme.cardSubtext} text-sm text-center py-8 ${theme.cardSecondaryBg} rounded-lg`}>No addresses yet</div>}
                {blocklist.map(item => (
                  <div key={item.id ?? item.address} className={`flex flex-col sm:flex-row items-start sm:items-center justify-between ${theme.cardSecondaryBg} p-3 rounded-lg ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'} transition-colors`}>
                    <div className={`text-sm ${theme.cardText} truncate w-full sm:w-auto mb-2 sm:mb-0 font-mono`}>{item.address}</div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => removeAddress(item)} 
                        className="text-red-600 hover:text-red-700 text-sm font-medium transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'agents' && (
            <div className="space-y-6 min-w-0">
              {/* Wallet Analysis Section */}
              <div className={`p-6 ${theme.cardBg} rounded-lg border ${theme.cardBorder}`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-lg font-semibold ${theme.cardText}`}>Wallet Analysis Agent</h3>
                  {analysisResult && (
                    <button
                      onClick={clearAnalysis}
                      className={`px-3 py-1.5 text-sm ${theme.buttonSecondary} rounded-md transition-colors`}
                    >
                      Clear Results
                    </button>
                  )}
                </div>
                
                <div className={`text-sm ${theme.cardSubtext} mb-4`}>
                  Analyze Ethereum wallet addresses for risk assessment and transaction patterns.
                </div>

                {/* Input Form */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <input 
                    value={walletAddress} 
                    onChange={(e) => setWalletAddress(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !analysisLoading && analyzeWallet()}
                    className={`flex-1 px-3 py-2 ${theme.inputBg} border ${theme.inputBorder} rounded-lg ${theme.inputText} ${theme.inputFocus} transition-all`}
                    placeholder="Enter Ethereum wallet address (0x...)" 
                    disabled={analysisLoading}
                  />
                  <button 
                    onClick={analyzeWallet}
                    disabled={analysisLoading || !walletAddress.trim()}
                    className={`px-4 py-2 ${theme.buttonPrimary} rounded-lg font-medium whitespace-nowrap ${isDarkMode ? 'hover:bg-red-700' : 'hover:bg-gray-800'} transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
                  >
                    {analysisLoading && (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    )}
                    {analysisLoading ? 'Analyzing...' : 'Analyze Wallet'}
                  </button>
                </div>

                {/* Error Display */}
                {analysisError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      {analysisError}
                    </div>
                  </div>
                )}

                {/* Analysis Results */}
                {analysisResult && (
                  <div className={`p-4 ${theme.cardSecondaryBg} rounded-lg border ${theme.cardBorder} space-y-4`}>
                    <h4 className={`font-semibold ${theme.cardText} flex items-center gap-2`}>
                      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Analysis Complete
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Risk Score */}
                      {analysisResult.riskScore !== undefined && (
                        <div className={`p-3 ${theme.cardBg} rounded-lg border ${theme.cardBorder}`}>
                          <div className={`text-xs font-medium ${theme.cardSubtext} uppercase tracking-wider mb-1`}>Risk Score</div>
                          <div className={`text-lg font-bold ${analysisResult.riskScore > 7 ? 'text-red-500' : analysisResult.riskScore > 4 ? 'text-yellow-500' : 'text-green-500'}`}>
                            {analysisResult.riskScore}/10
                          </div>
                        </div>
                      )}

                      {/* Transaction Count */}
                      {analysisResult.transactionCount !== undefined && (
                        <div className={`p-3 ${theme.cardBg} rounded-lg border ${theme.cardBorder}`}>
                          <div className={`text-xs font-medium ${theme.cardSubtext} uppercase tracking-wider mb-1`}>Transactions</div>
                          <div className={`text-lg font-bold ${theme.cardText}`}>
                            {analysisResult.transactionCount.toLocaleString()}
                          </div>
                        </div>
                      )}

                      {/* Balance */}
                      {analysisResult.balance !== undefined && (
                        <div className={`p-3 ${theme.cardBg} rounded-lg border ${theme.cardBorder}`}>
                          <div className={`text-xs font-medium ${theme.cardSubtext} uppercase tracking-wider mb-1`}>Balance</div>
                          <div className={`text-lg font-bold ${theme.cardText}`}>
                            {parseFloat(analysisResult.balance).toFixed(4)} ETH
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Additional Analysis Data */}
                    <div className="space-y-3">
                      {analysisResult.riskFactors && analysisResult.riskFactors.length > 0 && (
                        <div>
                          <div className={`text-sm font-medium ${theme.cardText} mb-2`}>Risk Factors:</div>
                          <div className="flex flex-wrap gap-2">
                            {analysisResult.riskFactors.map((factor, index) => (
                              <span key={index} className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded-full dark:bg-red-900/20 dark:text-red-400">
                                {factor}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {analysisResult.notes && (
                        <div>
                          <div className={`text-sm font-medium ${theme.cardText} mb-2`}>Analysis Notes:</div>
                          <div className={`text-sm ${theme.cardSubtext} p-3 ${theme.cardBg} rounded border ${theme.cardBorder}`}>
                            {analysisResult.notes}
                          </div>
                        </div>
                      )}

                      {/* Raw JSON Toggle */}
                      <details className="group">
                        <summary className={`cursor-pointer text-sm font-medium ${theme.cardText} hover:${theme.cardSubtext} transition-colors`}>
                          View Raw Analysis Data
                        </summary>
                        <pre className={`mt-2 p-3 ${theme.cardBg} rounded border ${theme.cardBorder} text-xs overflow-x-auto ${theme.cardText}`}>
                          {JSON.stringify(analysisResult, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </div>
                )}
              </div>

              {/* Analysis History */}
              {analysisHistory.length > 0 && (
                <div className={`p-6 ${theme.cardBg} rounded-lg border ${theme.cardBorder}`}>
                  <h4 className={`font-semibold ${theme.cardText} mb-4 flex items-center gap-2`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Recent Analyses
                  </h4>
                  
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {analysisHistory.map((analysis) => (
                      <div key={analysis.id} className={`p-3 ${theme.cardSecondaryBg} rounded-lg border ${theme.cardBorder} flex items-center justify-between`}>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-mono ${theme.cardText} truncate`}>
                            {analysis.address}
                          </div>
                          <div className={`text-xs ${theme.cardSubtext}`}>
                            {new Date(analysis.timestamp).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 ml-4">
                          {analysis.result.riskScore !== undefined && (
                            <div className={`text-sm font-bold ${analysis.result.riskScore > 7 ? 'text-red-500' : analysis.result.riskScore > 4 ? 'text-yellow-500' : 'text-green-500'}`}>
                              Risk: {analysis.result.riskScore}/10
                            </div>
                          )}
                          <button
                            onClick={() => setAnalysisResult(analysis.result)}
                            className={`px-2 py-1 text-xs ${theme.buttonSecondary} rounded transition-colors`}
                          >
                            View
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Floating theme toggle when sidebar is collapsed */}
      {!sidebarExpanded && !showLogout && (
        <div className="fixed bottom-4 right-4 z-40">
          <button
            onClick={toggleTheme}
            className={`w-10 h-10 rounded-full ${theme.toggleBg} flex items-center justify-center shadow-lg transition-all duration-200 border ${theme.sidebarBorder}`}
            aria-label="Toggle theme"
          >
            {isDarkMode ? (
              <svg className={`w-4 h-4 ${theme.toggleIcon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className={`w-4 h-4 ${theme.toggleIcon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
      )}

      {/* Logout slideover panel (bottom-left) */}
      {showLogout && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowLogout(false)} />

          <aside className={`absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-auto w-auto sm:w-80 ${theme.modalBg} border ${theme.cardBorder} rounded-xl shadow-lg p-4 slide-panel`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className={`${theme.modalText} text-lg font-semibold`}>Configurações e suporte</h3>
                <p className={`${theme.modalSubtext} text-xs mt-1`}>Ajustes e ações rápidas da sua conta</p>
              </div>
              <button onClick={() => setShowLogout(false)} aria-label="close" className={`${theme.modalSubtext} ${isDarkMode ? 'hover:text-white' : 'hover:text-gray-900'}`}>✕</button>
            </div>

            <div className={`mt-4 divide-y ${theme.cardBorder}`}>
              <div className="py-3 space-y-1">
                <button className={`w-full text-left ${theme.modalText} ${isDarkMode ? 'hover:text-white hover:bg-gray-800' : 'hover:text-black hover:bg-gray-50'} py-2 px-2 rounded-lg transition-colors`}>Configurações</button>
                <button className={`w-full text-left ${theme.modalText} ${isDarkMode ? 'hover:text-white hover:bg-gray-800' : 'hover:text-black hover:bg-gray-50'} py-2 px-2 rounded-lg transition-colors`}>Ajuste do feed inicial</button>
                <button className={`w-full text-left ${theme.modalText} ${isDarkMode ? 'hover:text-white hover:bg-gray-800' : 'hover:text-black hover:bg-gray-50'} py-2 px-2 rounded-lg transition-colors`}>Contas externas conectadas</button>
                <button className={`w-full text-left ${theme.modalText} ${isDarkMode ? 'hover:text-white hover:bg-gray-800' : 'hover:text-black hover:bg-gray-50'} py-2 px-2 rounded-lg transition-colors`}>Central de Denúncias e Violações</button>
              </div>

              <div className="py-3 space-y-1">
                <div className={`text-xs ${theme.modalSubtext} uppercase font-medium px-2`}>Suporte</div>
                <button className={`w-full text-left ${theme.modalText} ${isDarkMode ? 'hover:text-white hover:bg-gray-800' : 'hover:text-black hover:bg-gray-50'} py-2 px-2 rounded-lg transition-colors`}>Central de Ajuda</button>
                <button className={`w-full text-left ${theme.modalText} ${isDarkMode ? 'hover:text-white hover:bg-gray-800' : 'hover:text-black hover:bg-gray-50'} py-2 px-2 rounded-lg transition-colors`}>Remoções</button>
                <button className={`w-full text-left ${theme.modalText} ${isDarkMode ? 'hover:text-white hover:bg-gray-800' : 'hover:text-black hover:bg-gray-50'} py-2 px-2 rounded-lg transition-colors`}>Política de Privacidade</button>
              </div>

              <div className="py-3 flex flex-col gap-2">
                <button onClick={async () => { await handleLogout(); setShowLogout(false); navigate('/login'); }} className="w-full py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors">Logout</button>
                <button onClick={() => setShowLogout(false)} className={`w-full py-2 rounded-lg ${theme.buttonSecondary} transition-colors`}>Cancelar</button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
