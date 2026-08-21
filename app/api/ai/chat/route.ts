import { NextRequest, NextResponse } from 'next/server'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(req: NextRequest) {
  try {
    const { messages, portfolioContext } = (await req.json()) as {
      messages: Message[]
      portfolioContext?: {
        totalDisbursed?: number
        totalOutstanding?: number
        totalCollected?: number
        activeLoansCount?: number
        parLoansCount?: number
        npaLoansCount?: number
        npaAmount?: number
        npaRatio?: string
        collectionEfficiency?: number
        totalMembers?: number
        branches?: { name: string; loans: number; disbursed: number; outstanding: number; npa: number }[]
        atRiskLoans?: { loan_no: string; member: string; branch: string; outstanding: number; dpd: number }[]
      }
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 })
    }

    const lastUserMessage = messages[messages.length - 1]?.content || ''
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY

    // Call Google Gemini API (tries 3.6-flash, flash-latest, 2.5-flash)
    if (apiKey) {
      const systemInstruction = `You are the Executive AI Copilot for "AA2 Microfinance Private Limited", an institutional Microfinance Institution (MFI) in India.
Your mission is to provide accurate, institutional-grade assistance to leadership, branch managers, credit officers, and operations teams.

CORE CAPABILITIES:
- Answer ANY natural language question, financial reasoning, or banking query freely and intelligently.
- Deep analysis of portfolio metrics: PAR 30/60/90, DPD (Days Past Due), Gross NPA ratio, collection efficiency, and branch performance.
- Search, filter, or evaluate borrowers, repayment schedules, and credit health.
- Draft professional, empathetic, or legal collection notices and WhatsApp/SMS messages in fluent Hindi (हिंदी) and English.
- Calculate loan economics, pre-closures, and interest amortizations.

LIVE REAL-TIME PORTFOLIO CONTEXT:
${JSON.stringify(portfolioContext || {}, null, 2)}

COMMUNICATION STANDARDS:
- Always format currency in Indian Rupees (₹) with standard Indian numbering (e.g. ₹2,50,000).
- Maintain an executive, precise, and highly professional banking tone.
- Use clear markdown formatting, bullet points, and bold text for key figures.`

      const contents = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }))

      const candidateModels = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash']
      for (const model of candidateModels) {
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents,
                systemInstruction: {
                  parts: [{ text: systemInstruction }],
                },
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 1500,
                },
              }),
            }
          )

          if (response.ok) {
            const data = await response.json()
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text
            if (text) {
              return NextResponse.json({ reply: text, source: 'gemini' })
            }
          }
        } catch (err) {
          console.warn(`Gemini model ${model} attempt failed:`, err)
        }
      }
    }

    // Secondary fallback responder if network or quota is unreachable
    const reply = generateSmartFallbackReply(lastUserMessage, portfolioContext)
    return NextResponse.json({ reply, source: 'local-copilot' })
  } catch (error) {
    console.error('AI Chat Error:', error)
    return NextResponse.json(
      { error: 'Failed to process AI query', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

function formatInr(val?: number) {
  if (val === undefined || val === null) return '₹0'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val)
}

function generateSmartFallbackReply(
  query: string,
  ctx?: {
    totalDisbursed?: number
    totalOutstanding?: number
    totalCollected?: number
    activeLoansCount?: number
    parLoansCount?: number
    npaLoansCount?: number
    npaAmount?: number
    npaRatio?: string
    collectionEfficiency?: number
    totalMembers?: number
    branches?: { name: string; loans: number; disbursed: number; outstanding: number; npa: number }[]
    atRiskLoans?: { loan_no: string; member: string; branch: string; outstanding: number; dpd: number }[]
  }
): string {
  const q = query.toLowerCase()

  if (q.includes('whatsapp') || q.includes('reminder') || q.includes('hindi') || q.includes('message') || q.includes('notice')) {
    return `### 📲 Repayment Reminder Templates

#### 🇮🇳 Hindi (हिंदी):
> *"नमस्ते [सदस्य का नाम] जी, AA2 माइक्रोफाइनेंस से आपकी मासिक किश्त (EMI) ₹[राशि] देय है। कृपया अपनी किश्त समय पर जमा करें ताकि आपका क्रेडिट स्कोर अच्छा रहे और भविष्य में अधिक ऋण सुविधा मिल सके। धन्यवाद — AA2 माइक्रोफाइनेंस"*

#### 🇬🇧 English:
> *"Dear [Member Name], a gentle reminder from AA2 Microfinance that your loan EMI of ₹[Amount] is due. Kindly ensure timely payment to maintain a healthy credit profile. Thank you — AA2 Microfinance."*`
  }

  if (q.includes('summary') || q.includes('portfolio') || q.includes('npa') || q.includes('kpi') || q.includes('health') || q.includes('overview')) {
    if (!ctx) {
      return `### 📊 AA2 Portfolio Summary\n\nNo live portfolio data available currently. Please refresh the dashboard.`
    }
    return `### 📊 Executive Portfolio Overview

- **Gross Disbursed:** ${formatInr(ctx.totalDisbursed)}
- **Outstanding Principal:** ${formatInr(ctx.totalOutstanding)} across **${ctx.activeLoansCount || 0} active accounts**
- **Total Collections:** ${formatInr(ctx.totalCollected)} (${ctx.collectionEfficiency || 0}% collection efficiency)
- **PAR 30+ Accounts:** **${ctx.parLoansCount || 0} accounts**
- **Gross NPA:** **${ctx.npaLoansCount || 0} accounts** (${formatInr(ctx.npaAmount)} · ${ctx.npaRatio || '0.00'}%)
- **Total Active Members:** **${ctx.totalMembers || 0}**`
  }

  if (q.includes('overdue') || q.includes('par') || q.includes('risk') || q.includes('defaulter') || q.includes('dpd')) {
    if (!ctx?.atRiskLoans || ctx.atRiskLoans.length === 0) {
      return `### ✅ Portfolio Quality\n\nThere are currently **0 high-risk accounts (30+ DPD)** in the portfolio.`
    }
    const list = ctx.atRiskLoans
      .map(
        (l, i) =>
          `${i + 1}. **${l.member}** (\`${l.loan_no}\`) — **${l.dpd} DPD** | Outstanding: **${formatInr(l.outstanding)}** (${l.branch})`
      )
      .join('\n')
    return `### ⚠️ Overdue Accounts (30+ DPD)\n\n${list}`
  }

  if (q.includes('branch') || q.includes('haridwar') || q.includes('khatauli') || q.includes('pataudi')) {
    if (!ctx?.branches || ctx.branches.length === 0) {
      return `### 🏢 Branch Summary\n\nNo branch breakdown data loaded yet.`
    }
    const branchRows = ctx.branches
      .map(
        b =>
          `- **${b.name}:** ${b.loans} loans · Disbursed: ${formatInr(b.disbursed)} · Outstanding: ${formatInr(b.outstanding)} · NPA: ${b.npa}`
      )
      .join('\n')
    return `### 🏢 Branch Performance Breakdown\n\n${branchRows}`
  }

  return `### 🤖 AA2 Executive Copilot

I can assist you with:
- **Portfolio Analytics & NPA tracking**
- **Overdue borrower investigations & DPD reporting**
- **Bilingual Hindi & English collection notifications**
- **Credit underwriting & loan policy queries**

Please enter your question above.`
}
