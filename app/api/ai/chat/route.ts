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
      const systemInstruction = `You are a trusted senior colleague and operations copilot for "AA2 Microfinance Private Limited", an Indian Microfinance Institution.
You speak like an intelligent, articulate, and friendly human banking professional—not a generic robot.

YOUR APPROACH:
- Be warm, direct, and conversational. Speak directly to the user as a colleague.
- Answer any question freely with clear reasoning, practical advice, and domain expertise.
- Understand Indian microfinance deeply: JLG center meetings, field collections, DPD buckets, PAR 30/60/90, RBI guidelines, and household credit limits.
- When asked to draft messages or notices in Hindi or English, write fluent, natural, polite, and culturally appropriate text that field officers can send right away.
- When discussing numbers, cite the live portfolio data accurately and format all currency as Indian Rupees (e.g. ₹1,25,000).

LIVE PORTFOLIO METRICS FOR CONTEXT:
${JSON.stringify(portfolioContext || {}, null, 2)}`

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
    return `Here are two polite and effective reminder templates ready to send:

Hindi:
> नमस्ते [सदस्य का नाम] जी, AA2 माइक्रोफाइनेंस से आपकी मासिक किश्त (EMI) ₹[राशि] देय है। कृपया अपनी किश्त समय पर जमा करें ताकि आपका क्रेडिट स्कोर अच्छा रहे और आगे बड़ा लोन मिल सके। धन्यवाद — AA2 माइक्रोफाइनेंस

English:
> Dear [Member Name], gentle reminder from AA2 Microfinance that your loan EMI of ₹[Amount] is due. Kindly clear your payment to maintain a healthy credit score. Thank you — AA2 Microfinance.`
  }

  if (q.includes('summary') || q.includes('portfolio') || q.includes('npa') || q.includes('kpi') || q.includes('health') || q.includes('overview')) {
    if (!ctx) {
      return `I don't have the live portfolio metrics in context right now. Please refresh the dashboard and ask again.`
    }
    return `Here is a summary of our current portfolio:

- **Total Disbursed:** ${formatInr(ctx.totalDisbursed)}
- **Outstanding Principal:** ${formatInr(ctx.totalOutstanding)} across **${ctx.activeLoansCount || 0} active loans**
- **Collections Recorded:** ${formatInr(ctx.totalCollected)} (${ctx.collectionEfficiency || 0}% collection efficiency)
- **Overdue Accounts (PAR 30+):** **${ctx.parLoansCount || 0} loans**
- **Gross NPA:** **${ctx.npaLoansCount || 0} loans** (${formatInr(ctx.npaAmount)} · ${ctx.npaRatio || '0.00'}%)
- **Active Members:** **${ctx.totalMembers || 0} members**

Overall, portfolio collection efficiency is steady. Let me know if you want a deeper dive into any specific branch or risk category!`
  }

  if (q.includes('overdue') || q.includes('par') || q.includes('risk') || q.includes('defaulter') || q.includes('dpd')) {
    if (!ctx?.atRiskLoans || ctx.atRiskLoans.length === 0) {
      return `Good news! We currently have zero high-risk accounts (30+ DPD) in the active portfolio.`
    }
    const list = ctx.atRiskLoans
      .map(
        (l, i) =>
          `${i + 1}. **${l.member}** (\`${l.loan_no}\`) — **${l.dpd} DPD** | Outstanding: **${formatInr(l.outstanding)}** (${l.branch})`
      )
      .join('\n')
    return `Here are the top accounts requiring immediate follow-up (30+ DPD):

${list}

I recommend having the respective field officers prioritize center visits for these accounts.`
  }

  if (q.includes('branch') || q.includes('haridwar') || q.includes('khatauli') || q.includes('pataudi')) {
    if (!ctx?.branches || ctx.branches.length === 0) {
      return `I don't see branch breakdown data loaded yet. Please ensure loan records are synced.`
    }
    const branchRows = ctx.branches
      .map(
        b =>
          `- **${b.name}:** ${b.loans} loans · Disbursed: ${formatInr(b.disbursed)} · Outstanding: ${formatInr(b.outstanding)} · NPA: ${b.npa}`
      )
      .join('\n')
    return `Here is how our active branches compare:

${branchRows}`
  }

  return `I'm here to help you manage and analyze our microfinance operations.

You can ask me about:
- Live portfolio performance and NPA ratios
- Overdue borrower investigations and DPD tracking
- Drafting WhatsApp or SMS payment reminders in Hindi or English
- Core banking calculations, foreclosure quotes, or credit rules

What would you like to review?`
}
