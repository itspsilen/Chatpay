import { AppProvider, useApp } from './lib/context'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Landing } from './pages/Landing'
import { SignIn } from './pages/SignIn'
import { WalletSetup } from './pages/WalletSetup'
import { SafetySetup } from './pages/SafetySetup'
import { ModeSelect } from './pages/ModeSelect'
import { ChatPay } from './pages/ChatPay'
import { Settings } from './pages/Settings'
import { Memory } from './pages/Memory'
import { Scheduled } from './pages/Scheduled'

function Router() {
  const { state } = useApp()
  switch (state.route) {
    case 'landing':     return <Landing />
    case 'signin':      return <SignIn />
    case 'wallet-setup': return <WalletSetup />
    case 'safety-setup': return <SafetySetup />
    case 'mode-select': return <ModeSelect />
    case 'chat-pay':    return <ChatPay />
    case 'settings':    return <Settings />
    case 'memory':      return <Memory />
    case 'scheduled':   return <Scheduled />
    default:            return <Landing />
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <div className="min-h-dvh bg-canvas">
          <Router />
        </div>
      </AppProvider>
    </ErrorBoundary>
  )
}
