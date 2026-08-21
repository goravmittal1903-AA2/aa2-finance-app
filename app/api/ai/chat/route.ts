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

    // If Gemini API Key is available, use Google Gemini 1.5 Flash (Free Tier)
    if (apiKey) {
      const systemInstruction = `You are the AI Operations & Portfolio Copilot for "AA2 Microfinance Private Limited", a professional Microfinance Institution (MFI) in India.
Your role is to assist branch managers, field officers, credit underwriters, and leadership with:
- Analyzing portfolio quality, DPD (Days Past Due), PAR (Portfolio at Risk), and NPA ratios.
- Reviewing borrower health, loan collections, and EMI tracking.
- Drafting bilingual (Hindi and English) WhatsApp/SMS collection reminders and notices.
- Providing core banking and microfinance domain expertise (JLG, IL, RBI compliance).

LIVE REAL-TIME PORTFOLIO DATA:
${JSON.stringify(portfolioContext || {}, null, 2)}

GUIDELINES:
- Format all currency in Indian Rupees (₹) with appropriate comma separation (e.g. ₹1,50,000).
- Be concise, professional, and actionable. Use markdown bullet points and bold text where helpful.
- When drafting WhatsApp messages, provide ready-to-copy text in clear, polite Hindi (Devanagari script or conversational Hinglish) and English.`

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
                  temperature: 0.6,
                  maxOutputTokens: 1200,
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
          console.warn(`Gemini model ${model} failed, trying next:`, err)
        }
      }
    }

    // Smart Local Analytics Engine Fallback (100% Free, zero latency, no API key needed)
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

  // 1. WhatsApp / SMS Reminder Request
  if (q.includes('whatsapp') || q.includes('reminder') || q.includes('hindi') || q.includes('message') || q.includes('notice')) {
    return `### 📲 Ready-to-Send WhatsApp Collection Reminders

#### 🇮🇳 Hindi (हिंदी):
> *"नमस्ते [सदस्य का नाम] जी, AA2 माइक्रोफाइनेंस से आपकी मासिक किश्त (EMI) ₹[राशि] देय है। कृपया अपनी किश्त समय पर जमा करें ताकि आपका क्रेडिट स्कोर अच्छा रहे और आगे बड़ा लोन मिल सके। धन्यवाद - AA2 माइक्रोफाइनेंस"*

#### 🇬🇧 English:
> *"Dear [Member Name], gentle reminder from AA2 Microfinance that your loan EMI of ₹[Amount] is due. Please clear your payment to maintain a good credit score. Thank you — AA2 Microfinance."*

*(Tip: You can copy and send this directly via WhatsApp to any overdue borrower!)*`
  }

  // 2. Portfolio / NPA / Health Overview
  if (q.includes('summary') || q.includes('portfolio') || q.includes('npa') || q.includes('kpi') || q.includes('health') || q.includes('overview')) {
    if (!ctx) {
      return `### 📊 AA2 Portfolio Summary\n\nNo live portfolio data available yet. Please refresh the dashboard.`
    }
    return `### 📊 AA2 Microfinance Portfolio Overview

- **Gross Disbursed:** ${formatInr(ctx.totalDisbursed)}
- **Outstanding Principal:** ${formatInr(ctx.totalOutstanding)} across **${ctx.activeLoansCount || 0} active loans**
- **Total Collections:** ${formatInr(ctx.totalCollected)} (${ctx.collectionEfficiency || 0}% efficiency)
- **PAR 30+ Accounts:** **${ctx.parLoansCount || 0} accounts** overdue > 30 days
- **Gross NPA:** **${ctx.npaLoansCount || 0} accounts** (${formatInr(ctx.npaAmount)} · ${ctx.npaRatio || '0.00'}%)
- **Total Registered Members:** **${ctx.totalMembers || 0}**

*Portfolio status is healthy with regular daily collections tracking.*`
  }

  // 3. Overdue / At-Risk / DPD Queries
  if (q.includes('overdue') || q.includes('par') || q.includes('risk') || q.includes('defaulter') || q.includes('dpd')) {
    if (!ctx?.atRiskLoans || ctx.atRiskLoans.length === 0) {
      return `### ✅ Portfolio Quality Update\n\nGreat news! There are currently **0 high-risk accounts (30+ DPD)** in the portfolio.`
    }
    const list = ctx.atRiskLoans
      .map(
        (l, i) =>
          `${i + 1}. **${l.member}** (\`${l.loan_no}\`) — **${l.dpd} DPD** | Outstanding: **${formatInr(l.outstanding)}** (${l.branch})`
      )
      .join('\n')
    return `### ⚠️ Top Overdue & At-Risk Accounts (30+ DPD)\n\n${list}\n\n**Recommended Action:** Field officers should prioritize center visits and send WhatsApp reminders for these accounts.`
  }

  // 4. Branch Specific Queries
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
    return `### 🏢 Branch Performance Breakdown\n\n${branchRows}\n\n*All branches are operational and synced with HQ.*`
  }

  // 5. Foreclosure / Pre-closure calculation inquiry
  if (q.includes('foreclosure') || q.includes('close') || q.includes('preclose') || q.includes('settlement')) {
    return `### 📑 Foreclosure & Settlement Guidance

To generate an accurate foreclosure quote and NOC:
1. Navigate to the **Loans** menu and select the specific loan account.
2. Click **"Foreclosure Quote"** in the action menu.
3. The system automatically calculates:
   - Remaining Principal Balance
   - Accrued Interest till today
   - Rebate on future interest
   - Instant downloadable **No Objection Certificate (NOC)** PDF.`
  }

  // Default Guidance Response
  return `### 🤖 AA2 AI Copilot at your service!

I can help you with:
1. **📊 Portfolio Health & NPA Analysis:** Type *"Show portfolio summary"* or *"What is our NPA %?"*
2. **⚠️ Overdue Accounts:** Type *"Show top overdue borrowers"*
3. **🏢 Branch Comparison:** Type *"Branch performance breakdown"*
4. **💬 WhatsApp Reminders:** Type *"Draft reminder in Hindi"*

> [!TIP]
> *To enable open-ended natural conversation, you can also add your free **GEMINI_API_KEY** from [aistudio.google.com](https://aistudio.google.com) to your .env.local file!*`
}
