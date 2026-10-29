import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Brain, Trash2 } from 'lucide-react'
import { useApp } from '../lib/context'
import { Button } from '../components/ui/Button'
import { deleteMemory, deleteAllMemories } from '../lib/storage'
import { toast } from 'sonner'

export function Memory() {
  const { state, dispatch, navigate } = useApp()
  const [confirmClear, setConfirmClear] = useState(false)

  const handleForget = async (id: string) => {
    if (!state.user) return
    await deleteMemory(state.user.id, id, state.user.isDemoMode)
    dispatch({ type: 'REMOVE_MEMORY', payload: id })
    toast.success('Memory removed')
  }

  const handleForgetAll = async () => {
    if (!state.user) return
    await deleteAllMemories(state.user.id, state.user.isDemoMode)
    dispatch({ type: 'CLEAR_MEMORIES' })
    setConfirmClear(false)
    toast.success('All memories cleared')
  }

  return (
    <div className="min-h-dvh bg-canvas flex flex-col">
      <div className="sticky top-0 z-10 bg-canvas/90 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('settings')} className="text-muted hover:text-white transition-colors p-1">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <Brain size={16} className="text-accent" />
          <span className="font-display font-semibold text-white">Agent Memory</span>
        </div>
        {state.memories.length > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Forget everything
          </button>
        )}
      </div>

      <div className="flex-1 px-4 py-6 max-w-sm mx-auto w-full">
        {state.memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-surface flex items-center justify-center">
              <Brain size={28} className="text-muted" />
            </div>
            <p className="font-medium text-white">No memories yet</p>
            <p className="text-sm text-muted">
              ChatPay saves useful preferences here — like your favorite tokens and risk settings — as you chat.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted">{state.memories.length} item{state.memories.length !== 1 ? 's' : ''}</p>
            <AnimatePresence>
              {state.memories.map((mem) => (
                <motion.div
                  key={mem.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8, height: 0 }}
                  className="bg-card border border-border rounded-xl p-4 flex items-start gap-3"
                >
                  <div className="flex-1">
                    <p className="text-sm text-white">{mem.text}</p>
                    <p className="text-xs text-muted mt-1">
                      {new Date(mem.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => { void handleForget(mem.id) }}
                    className="text-muted hover:text-red-400 transition-colors p-1 flex-shrink-0"
                  >
                    <Trash2 size={15} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Confirm clear modal */}
      <AnimatePresence>
        {confirmClear && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={() => setConfirmClear(false)}
            />
            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-card border border-border rounded-2xl p-6 space-y-4 max-w-sm mx-auto"
            >
              <h3 className="font-display font-semibold text-white">Forget everything?</h3>
              <p className="text-sm text-muted">All {state.memories.length} memories will be deleted and cannot be recovered.</p>
              <div className="flex gap-3">
                <Button variant="ghost" size="md" className="flex-1" onClick={() => setConfirmClear(false)}>
                  Cancel
                </Button>
                <Button variant="danger" size="md" className="flex-1" onClick={() => { void handleForgetAll() }}>
                  Forget all
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
