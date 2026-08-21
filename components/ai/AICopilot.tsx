'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  ExternalLink,
  PanelRightClose,
  PanelRightOpen,
  ArrowUpRight,
} from 'lucide-react'
import { getPortfolio } from '@/lib/calculations'
import { getAll } from '@/lib/supabase'
import type { Customer, PortfolioRow } from '@/lib/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  followups?: string[]
  source?: string
  timestamp: string
}

export function AICopilot() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isDocked, setIsDocked] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello! I am your portfolio and operations copilot for AA2 Microfinance.\n\nI can analyze our live loans, monitor DPD risk, compare branch collections, or draft customized payment reminders in Hindi and English.\n\nWhat would you like to explore today?`,
      followups: [
        'How is our portfolio performing right now?',
        'Which borrowers are overdue (30+ DPD)?',
        'Draft a payment reminder in Hindi',
      ],
      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    },
  ])

  const [portfolioContext, setPortfolioContext] = useState<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)

  // Initialize Speech Recognition (Web Speech API)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.continuous = false
        recognition.interimResults = false
        recognition.lang = 'hi-IN, en-IN, en-US'

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript
          setInput(prev => (prev ? `${prev} ${transcript}` : transcript))
          setIsListening(false)
        }

        recognition.onerror = () => setIsListening(false)
        recognition.onend = () => setIsListening(false)
        recognitionRef.current = recognition
      }
    }
  }, [])

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Voice recognition is not supported in this browser. Please use Chrome, Edge, or Safari.')
      return
    }

    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      try {
        recognitionRef.current.start()
        setIsListening(true)
      } catch (err) {
        console.warn('Speech start error:', err)
      }
    }
  }

  // Text to Speech (Audio Readout)
  const toggleSpeak = (text: string, id: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

    if (speakingId === id) {
      window.speechSynthesis.cancel()
      setSpeakingId(null)
      return
    }

    window.speechSynthesis.cancel()
    const cleanText = text
      .replace(/\[LOAN:[^\]]+\]/g, 'Loan Account')
      .replace(/\[WHATSAPP\]/g, '')
      .replace(/[#*`>]/g, '')

    const utterance = new SpeechSynthesisUtterance(cleanText)
    utterance.rate = 1.0
    utterance.onend = () => setSpeakingId(null)
    utterance.onerror = () => setSpeakingId(null)

    setSpeakingId(id)
    window.speechSynthesis.speak(utterance)
  }

  // Refresh live portfolio context
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
            followups: data.followups || [],
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
            content: `I encountered an issue processing that query: ${data.error || 'Please try asking again.'}`,
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
          content: 'I could not reach the server. Please check your internet connection and try again.',
          timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    const cleanText = text
      .replace(/\[LOAN:[^\]]+\]/g, match => match.replace('[LOAN:', '').replace(']', ''))
      .replace(/\[WHATSAPP\]/g, '')
      .replace(/^#+\s+/gm, '')
      .replace(/\*\*/g, '')
      .replace(/^>\s?/gm, '')
    navigator.clipboard.writeText(cleanText)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const openWhatsApp = (text: string) => {
    const cleanText = text
      .replace(/\[WHATSAPP\]/g, '')
      .replace(/^>\s?/gm, '')
      .replace(/\*\*/g, '*')
      .trim()
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(cleanText)}`
    window.open(url, '_blank')
  }

  const quickPrompts = [
    { label: 'Portfolio Summary', icon: TrendingUp, query: 'How is our portfolio performing right now? Give me an executive breakdown.' },
    { label: 'Overdue Accounts', icon: AlertTriangle, query: 'Which borrower accounts are currently overdue (30+ DPD)?' },
    { label: 'Branch Comparison', icon: Building2, query: 'How do our branches compare in terms of disbursements and collections?' },
    { label: 'WhatsApp Reminder (Hindi)', icon: MessageSquare, query: 'Draft a polite WhatsApp payment reminder in Hindi for our borrowers.' },
  ]

  // Formatted Message Renderer with Interactive Buttons
  function FormattedMessage({ content, isUser }: { content: string; isUser: boolean }) {
    if (isUser) {
      return <div className="whitespace-pre-wrap font-sans text-xs">{content}</div>
    }

    const lines = content.split('\n')
    const elements: React.ReactNode[] = []

    let inBlockquote = false
    let isWhatsAppBlock = false
    let blockquoteBuffer: string[] = []

    const flushBlockquote = (key: number) => {
      if (blockquoteBuffer.length > 0) {
        const fullBlockText = blockquoteBuffer.join('\n')
        elements.push(
          <div
            key={`bq-${key}`}
            className={`my-2.5 rounded-xl border p-3.5 transition shadow-xs ${
              isWhatsAppBlock
                ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100'
                : 'border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 text-slate-700 dark:text-slate-200'
            }`}
          >
            {isWhatsAppBlock && (
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-200/60 dark:border-emerald-800/60">
                <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" /> WhatsApp Template
                </span>
                <button
                  onClick={() => openWhatsApp(fullBlockText)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-xs transition"
                >
                  Send via WhatsApp <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            )}
            <div className="text-xs italic leading-relaxed space-y-1">
              {blockquoteBuffer.map((bLine, i) => (
                <p key={i}>{renderInline(bLine)}</p>
              ))}
            </div>
          </div>
        )
        blockquoteBuffer = []
        inBlockquote = false
        isWhatsAppBlock = false
      }
    }

    lines.forEach((line, index) => {
      const trimmed = line.trim()

      if (trimmed.startsWith('> [WHATSAPP]')) {
        inBlockquote = true
        isWhatsAppBlock = true
        return
      }

      if (trimmed.startsWith('>')) {
        inBlockquote = true
        blockquoteBuffer.push(trimmed.replace(/^>\s?/, ''))
        return
      } else if (inBlockquote) {
        flushBlockquote(index)
      }

      if (!trimmed) {
        elements.push(<div key={`space-${index}`} className="h-1.5" />)
        return
      }

      // Headers
      if (trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
        const headerText = trimmed.replace(/^#+\s*/, '')
        elements.push(
          <h4
            key={`h-${index}`}
            className="font-bold text-sm text-slate-900 dark:text-white mt-3 mb-1.5 flex items-center gap-1.5"
          >
            {renderInline(headerText)}
          </h4>
        )
        return
      }

      // Bullet points
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const bulletText = trimmed.replace(/^[-*]\s+/, '')
        elements.push(
          <div key={`li-${index}`} className="flex items-start gap-2 my-1 text-slate-700 dark:text-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
            <span className="leading-relaxed">{renderInline(bulletText)}</span>
          </div>
        )
        return
      }

      // Numbered lists
      const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/)
      if (numMatch) {
        elements.push(
          <div key={`num-${index}`} className="flex items-start gap-2 my-1 text-slate-700 dark:text-slate-200">
            <span className="font-bold text-blue-600 dark:text-blue-400 text-xs flex-shrink-0 min-w-[16px]">
              {numMatch[1]}.
            </span>
            <span className="leading-relaxed">{renderInline(numMatch[2])}</span>
          </div>
        )
        return
      }

      // Paragraph
      elements.push(
        <p key={`p-${index}`} className="my-1 text-slate-700 dark:text-slate-200 leading-relaxed">
          {renderInline(line)}
        </p>
      )
    })

    if (inBlockquote) {
      flushBlockquote(lines.length)
    }

    return <div className="space-y-0.5">{elements}</div>
  }

  // Inline formatting with clickable Loan & Member badges
  function renderInline(text: string): React.ReactNode[] {
    const regex = /(\[LOAN:[^\]]+\]|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
    const parts = text.split(regex)

    return parts.map((part, i) => {
      if (!part) return null

      // Clickable Loan Account Pill [LOAN:AA2-1049]
      if (part.startsWith('[LOAN:') && part.endsWith(']')) {
        const loanNo = part.replace('[LOAN:', '').replace(']', '')
        return (
          <button
            key={i}
            onClick={() => router.push(`/loans/${loanNo}`)}
            className="inline-flex items-center gap-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/50 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 font-mono font-bold px-2 py-0.5 rounded text-[11px] mx-1 border border-blue-300 dark:border-blue-700 transition"
            title={`View Loan Account ${loanNo}`}
          >
            {loanNo} <ArrowUpRight className="w-2.5 h-2.5" />
          </button>
        )
      }

      // Bold: **text**
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return (
          <strong key={i} className="font-bold text-slate-900 dark:text-white">
            {part.slice(2, -2)}
          </strong>
        )
      }

      // Italic: *text*
      if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
        return (
          <em key={i} className="italic text-slate-600 dark:text-slate-300">
            {part.slice(1, -1)}
          </em>
        )
      }

      // Monospace: `text`
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return (
          <code
            key={i}
            className="bg-slate-200/80 dark:bg-slate-700/80 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-mono text-[11px]"
          >
            {part.slice(1, -1)}
          </code>
        )
      }

      return part
    })
  }

  return (
    <div
      className={
        isDocked
          ? 'fixed top-[60px] right-0 bottom-0 w-[420px] z-50 shadow-2xl border-l border-slate-200 dark:border-slate-800'
          : 'fixed bottom-6 right-6 z-50'
      }
    >
      {/* Floating Trigger Button */}
      {!isOpen && !isDocked && (
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

      {/* Main Chat Drawer */}
      {(isOpen || isDocked) && (
        <div
          className={`flex flex-col bg-white dark:bg-slate-900 transition-all duration-200 overflow-hidden ${
            isDocked
              ? 'w-full h-full'
              : isExpanded
              ? 'w-[680px] h-[720px] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl'
              : 'w-[400px] sm:w-[450px] h-[590px] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl'
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
                <p className="text-[10px] text-slate-300">Operations & Portfolio Assistant</p>
              </div>
            </div>

            <div className="flex items-center gap-1 text-white/80">
              <button
                onClick={refreshContext}
                title="Refresh Live Data"
                className="p-1.5 hover:bg-white/10 rounded-lg transition text-slate-300 hover:text-white"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsDocked(!isDocked)}
                title={isDocked ? 'Undock to Floating View' : 'Dock to Right Sidebar'}
                className="p-1.5 hover:bg-white/10 rounded-lg transition text-slate-300 hover:text-white"
              >
                {isDocked ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
              </button>
              {!isDocked && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  title={isExpanded ? 'Minimize Window' : 'Expand Window'}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition hidden sm:block text-slate-300 hover:text-white"
                >
                  {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              )}
              <button
                onClick={() => {
                  setIsOpen(false)
                  setIsDocked(false)
                }}
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
              <div key={msg.id} className="space-y-2">
                <div className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-lg bg-blue-600 flex-shrink-0 flex items-center justify-center text-white mt-0.5 shadow-sm">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}
                  <div
                    className={`group relative max-w-[88%] rounded-2xl px-4 py-3 shadow-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-slate-100 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 rounded-bl-none border border-slate-200/60 dark:border-slate-700/60'
                    }`}
                  >
                    <FormattedMessage content={msg.content} isUser={msg.role === 'user'} />

                    <div className="flex items-center justify-between mt-2.5 pt-1.5 border-t border-black/5 dark:border-white/5 text-[10px] opacity-70">
                      <span>{msg.timestamp}</span>
                      {msg.role === 'assistant' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleSpeak(msg.content, msg.id)}
                            className="hover:opacity-100 flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600"
                            title={speakingId === msg.id ? 'Stop audio' : 'Listen to response'}
                          >
                            {speakingId === msg.id ? (
                              <>
                                <VolumeX className="w-3.5 h-3.5 text-red-500 animate-pulse" /> Stop
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3.5 h-3.5" /> Listen
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => copyToClipboard(msg.content, msg.id)}
                            className="hover:opacity-100 flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400"
                            title="Copy clean text"
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
                        </div>
                      )}
                    </div>
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-lg bg-slate-700 flex-shrink-0 flex items-center justify-center text-white mt-0.5">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>

                {/* Dynamic Follow-Up Suggestion Chips */}
                {msg.role === 'assistant' && msg.followups && msg.followups.length > 0 && (
                  <div className="pl-9 flex flex-wrap gap-1.5 pt-1">
                    {msg.followups.map((chip, cIdx) => (
                      <button
                        key={cIdx}
                        onClick={() => handleSend(chip)}
                        disabled={loading}
                        className="bg-blue-50 hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-slate-700 rounded-full px-3 py-1 text-[10.5px] font-medium transition shadow-2xs text-left"
                      >
                        💡 {chip}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5 items-center text-slate-400">
                <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3.5 py-2.5 rounded-2xl rounded-bl-none">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce" />
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:0.4s]" />
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1.5">Reviewing portfolio and typing...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box with Microphone */}
          <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
            <form
              onSubmit={e => {
                e.preventDefault()
                handleSend()
              }}
              className="flex items-center gap-2"
            >
              <button
                type="button"
                onClick={toggleListening}
                className={`p-2.5 rounded-xl transition flex items-center justify-center ${
                  isListening
                    ? 'bg-red-500 text-white animate-pulse shadow-md'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
                title={isListening ? 'Listening... Tap to stop' : 'Tap to speak (Hindi/English)'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={isListening ? 'Listening to your voice...' : 'Type or speak in Hindi, English, Hinglish...'}
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
              <span>{isListening ? '🎙️ Speak clearly into microphone...' : 'AA2 Core Banking AI Copilot'}</span>
              <button
                onClick={() =>
                  setMessages([
                    {
                      id: 'welcome',
                      role: 'assistant',
                      content: `Chat history cleared. How can I help you right now?`,
                      followups: ['Show portfolio summary', 'Which borrowers are overdue?', 'Draft payment reminder'],
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
