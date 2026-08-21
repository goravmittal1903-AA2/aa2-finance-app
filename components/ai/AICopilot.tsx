'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  Minimize2,
  Maximize2,
  Copy,
  Check,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  Building2,
  MessageSquare,
} from 'lucide-react'
import { getPortfolio } from '@/lib/calculations'
import { getAll } from '@/lib/supabase'
import type { Customer, PortfolioRow } from '@/lib/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  source?: string
  timestamp: string
}

export function AICopilot() {
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `👋 **Welcome to AA2 Executive Copilot.**\n\nI am your real-time portfolio intelligence assistant. You can ask me anything about your loans, DPD risk, branch performance, borrower summaries, or draft collection notices in English & Hindi.\n\n*How can I assist you today?*`,
      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    },
  ])

  const [portfolioContext, setPortfolioContext] = useState<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Fetch live portfolio data for AI context
  const refreshContext = async () => {
    try {
      const [portfolio, customers] = await Promise.all([
        getPortfolio(),
        getAll<Customer>('customers'),
      ])

      const active = portfolio.filter(p => p.status === 'ACTIVE')
      const totalDisbursed = portfolio.reduce((s, p) => s + (p.loan_amount || 0), 0)
      const totalCollected = portfolio.reduce((s, p) => s + (p.total_collected || 0), 0)
      const outstanding = active.reduce((s, p) => s + (p.outstanding || 0), 0)
      const parLoans = active.filter(p => p.par_flag).length
      const npaLoans = active.filter(p => p.npa_flag)
      const npaAmount = npaLoans.reduce((s, p) => s + (p.outstanding || 0), 0)
      const collectionEfficiency = totalDisbursed > 0 ? Math.round((totalCollected / totalDisbursed) * 100) : 0

      // Branch breakdown
      const branchMap: Record<string, { disbursed: number; outstanding: number; count: number; npa: number }> = {}
      portfolio.forEach(p => {
        const b = p.branch || 'Head Office'
        branchMap[b] = branchMap[b] || { disbursed: 0, outstanding: 0, count: 0, npa: 0 }
        branchMap[b].disbursed += p.loan_amount || 0
        branchMap[b].outstanding += p.outstanding || 0
        branchMap[b].count++
        if (p.npa_flag) branchMap[b].npa++
      })

      const branches = Object.entries(branchMap).map(([name, v]) => ({
        name,
        loans: v.count,
        disbursed: v.disbursed,
        outstanding: v.outstanding,
        npa: v.npa,
      }))

      // At risk loans
      const atRiskLoans = active
        .filter(p => (p.dpd || 0) >= 30)
        .sort((a, b) => (b.dpd || 0) - (a.dpd || 0))
        .slice(0, 10)
        .map(p => ({
          loan_no: p.loan_account_no,
          member: p.member_name,
          branch: p.branch || 'Head Office',
          outstanding: p.outstanding || 0,
          dpd: p.dpd || 0,
        }))

      setPortfolioContext({
        totalDisbursed,
        totalOutstanding: outstanding,
        totalCollected,
        activeLoansCount: active.length,
        parLoansCount: parLoans,
        npaLoansCount: npaLoans.length,
        npaAmount,
        npaRatio: outstanding > 0 ? ((npaAmount / outstanding) * 100).toFixed(2) : '0.00',
        collectionEfficiency,
        totalMembers: customers.length,
        branches,
        atRiskLoans,
      })
    } catch (e) {
      console.warn('AI context load failed:', e)
    }
  }

  useEffect(() => {
    if (isOpen) {
      refreshContext()
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || input
    if (!textToSend.trim() || loading) return

    const userMsg: Message = {
      id: String(Date.now()),
      role: 'user',
      content: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    }

    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          portfolioContext,
        }),
      })

      const data = await res.json()
      if (res.ok && data.reply) {
        setMessages(prev => [
          ...prev,
          {
            id: String(Date.now() + 1),
            role: 'assistant',
            content: data.reply,
            source: data.source,
            timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          },
        ])
      } else {
        setMessages(prev => [
          ...prev,
          {
            id: String(Date.now() + 1),
            role: 'assistant',
            content: `⚠️ Error: ${data.error || 'Could not process query. Please try again.'}`,
            timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          },
        ])
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: '⚠️ Failed to connect to AI service. Please check your network connection.',
          timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const quickPrompts = [
    { label: 'Portfolio Summary', icon: TrendingUp, query: 'Provide a complete portfolio and NPA executive summary.' },
    { label: 'Top Overdue Accounts', icon: AlertTriangle, query: 'Show all top overdue accounts (30+ DPD) with details.' },
    { label: 'Branch Performance', icon: Building2, query: 'Compare branch performance across all active locations.' },
    { label: 'WhatsApp Reminder (Hindi)', icon: MessageSquare, query: 'Draft a polite WhatsApp payment reminder in Hindi.' },
  ]

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-2.5 bg-gradient-to-r from-blue-700 to-indigo-800 hover:from-blue-800 hover:to-indigo-900 text-white px-4 py-3 rounded-full shadow-2xl hover:shadow-blue-600/30 transition-all duration-300 transform hover:scale-105 active:scale-95 border border-white/10"
        >
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white animate-pulse" />
          </div>
          <span className="font-bold text-sm tracking-wide pr-1">AA2 AI Copilot</span>
        </button>
      )}

      {/* Expanded Chat Drawer */}
      {isOpen && (
        <div
          className={`flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl transition-all duration-200 overflow-hidden ${
            isExpanded ? 'w-[680px] h-[720px]' : 'w-[400px] sm:w-[440px] h-[580px]'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-600/40 border border-blue-400/30 flex items-center justify-center">
                <Bot className="w-5 h-5 text-blue-300" />
              </div>
              <div>
                <h3 className="font-bold text-sm leading-tight text-white">AA2 AI Copilot</h3>
                <p className="text-[10px] text-slate-300">Executive Portfolio Intelligence</p>
              </div>
            </div>

            <div className="flex items-center gap-1 text-white/80">
              <button
                onClick={refreshContext}
                title="Refresh Portfolio Context"
                className="p-1.5 hover:bg-white/10 rounded-lg transition text-slate-300 hover:text-white"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'Minimize Window' : 'Expand Window'}
                className="p-1.5 hover:bg-white/10 rounded-lg transition hidden sm:block text-slate-300 hover:text-white"
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Close"
                className="p-1.5 hover:bg-white/10 rounded-lg transition text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Prompts Bar */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {quickPrompts.map((qp, idx) => {
              const Icon = qp.icon
              return (
                <button
                  key={idx}
                  onClick={() => handleSend(qp.query)}
                  disabled={loading}
                  className="flex items-center gap-1 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700 hover:border-blue-300 rounded-lg px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition shadow-2xs"
                >
                  <Icon className="w-3 h-3 text-blue-500" />
                  {qp.label}
                </button>
              )
            })}
          </div>

          {/* Message History */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-blue-600 flex-shrink-0 flex items-center justify-center text-white mt-0.5 shadow-sm">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div
                  className={`group relative max-w-[85%] rounded-2xl px-4 py-3 shadow-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-slate-100 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 rounded-bl-none border border-slate-200/60 dark:border-slate-700/60'
                  }`}
                >
                  <div className="whitespace-pre-wrap font-sans text-xs">
                    {msg.content}
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-black/5 dark:border-white/5 text-[10px] opacity-60">
                    <span>{msg.timestamp}</span>
                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => copyToClipboard(msg.content, msg.id)}
                        className="hover:opacity-100 flex items-center gap-1 font-medium ml-2 text-blue-600 dark:text-blue-400"
                        title="Copy text"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" /> Copy
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-slate-700 flex-shrink-0 flex items-center justify-center text-white mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5 items-center text-slate-400">
                <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-2xl rounded-bl-none">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce" />
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:0.4s]" />
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1.5">Thinking & analyzing portfolio...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
            <form
              onSubmit={e => {
                e.preventDefault()
                handleSend()
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask anything about loans, overdue, policy, reminder drafts..."
                className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs px-3.5 py-2.5 rounded-xl border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 outline-none transition"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white p-2.5 rounded-xl shadow-md transition flex items-center justify-center"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <div className="flex items-center justify-between px-1 mt-1.5 text-[10px] text-slate-400">
              <span>AA2 Core Banking AI Copilot</span>
              <button
                onClick={() =>
                  setMessages([
                    {
                      id: 'welcome',
                      role: 'assistant',
                      content: `👋 Chat cleared! How can I assist you with your loan operations today?`,
                      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                    },
                  ])
                }
                className="hover:text-slate-600 dark:hover:text-slate-200 transition"
              >
                Clear History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
