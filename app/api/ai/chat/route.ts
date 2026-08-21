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
        allMembersSummary?: { id: string; name: string; phone?: string; loan_no?: string; branch?: string }[]
      }
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 })
    }

    const lastUserMessage = messages[messages.length - 1]?.content || ''
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY

    // Call Google Gemini API (tries 3.6-flash, flash-latest, 2.5-flash)
    if (apiKey) {
      const systemInstruction = `You are a trusted senior colleague and intelligent operations copilot for "AA2 Microfinance Private Limited", an Indian Microfinance Institution (MFI).
You communicate like an experienced, helpful, and articulate human banking operations leader—warm, conversational, and direct.

CORE BEHAVIOR & LANGUAGE RULES:
1. **Language Mirroring:**
   - If the user writes in Hindi (हिंदी), reply in natural, fluent Hindi.
   - If the user writes in Hinglish (e.g., "Haridwar branch ka collection kitna hai?"), reply in conversational, natural Hinglish.
   - If the user writes in English, reply in clean, professional English.
   - If the user writes in any other regional language (Marathi, Bengali, Punjabi, Tamil, Gujarati, etc.), reply fluently in that language.
2. **Interactive Markers:**
   - When mentioning a loan account, format it as: [LOAN:AA2-XXXX] (e.g. [LOAN:AA2-1049]).
   - When drafting a WhatsApp reminder message, enclose the ready-to-send message inside a blockquote like:
     > [WHATSAPP]
     > नमस्ते [नाम] जी...
3. **Follow-up Suggestions:**
   - At the very end of your response, always provide 3 relevant, logical follow-up questions formatted as:
     <<<FOLLOWUPS>>>
     Follow-up Question 1
     Follow-up Question 2
     Follow-up Question 3
     <<<END_FOLLOWUPS>>>
4. **Domain Intelligence:**
   - Deep knowledge of JLG (Joint Liability Groups), Center Meetings, DPD aging, PAR 30/60/90, RBI MFI Master Directions, and Household Income Limits.
   - Format all currency figures in Indian Rupees (₹) with standard Indian comma separation (e.g. ₹1,50,000).

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
              const { cleanReply, followups } = parseAIResponse(text)
              return NextResponse.json({ reply: cleanReply, followups, source: 'gemini' })
            }
          }
        } catch (err) {
          console.warn(`Gemini model ${model} attempt failed:`, err)
        }
      }
    }

    // Secondary fallback responder if no API key is provided
    const { reply, followups } = generateSmartFallbackReply(lastUserMessage, portfolioContext)
    return NextResponse.json({ reply, followups, source: 'local-copilot' })
  } catch (error) {
    console.error('AI Chat Error:', error)
    return NextResponse.json(
      { error: 'Failed to process AI query', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

function parseAIResponse(rawText: string): { cleanReply: string; followups: string[] } {
  let cleanReply = rawText
  const followups: string[] = []

  const followupMatch = rawText.match(/<<<FOLLOWUPS>>>([\s\S]*?)<<<END_FOLLOWUPS>>>/)
  if (followupMatch) {
    cleanReply = rawText.replace(/<<<FOLLOWUPS>>>[\s\S]*?<<<END_FOLLOWUPS>>>/, '').trim()
    const lines = followupMatch[1].split('\n')
    lines.forEach(l => {
      const clean = l.replace(/^[-*•\d.]+\s*/, '').trim()
      if (clean.length > 2 && clean.length < 80) {
        followups.push(clean)
      }
    })
  }

  return { cleanReply, followups: followups.slice(0, 3) }
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
): { reply: string; followups: string[] } {
  const q = query.toLowerCase()

  if (q.includes('whatsapp') || q.includes('reminder') || q.includes('hindi') || q.includes('message') || q.includes('notice') || q.includes('याद')) {
    return {
      reply: `Here are two personalized collection reminder drafts ready for WhatsApp:

Hindi (हिंदी):
> [WHATSAPP]
> नमस्ते [सदस्य का नाम] जी, AA2 माइक्रोफाइनेंस से आपकी मासिक किश्त (EMI) ₹[राशि] देय है। कृपया अपनी किश्त समय पर जमा करें ताकि आपका क्रेडिट स्कोर उत्तम रहे और भविष्य में बड़ा ऋण प्राप्त हो सके। धन्यवाद — AA2 माइक्रोफाइनेंस

English:
> [WHATSAPP]
> Dear [Member Name], gentle reminder from AA2 Microfinance that your monthly loan EMI of ₹[Amount] is due. Kindly make the payment to maintain a strong credit profile. Thank you — AA2 Microfinance.`,
      followups: [
        'How do I calculate foreclosure for an overdue loan?',
        'Show all borrowers overdue by 30+ days',
        'What is our collection efficiency this month?',
      ],
    }
  }

  if (q.includes('summary') || q.includes('portfolio') || q.includes('npa') || q.includes('kpi') || q.includes('health') || q.includes('overview') || q.includes('हाल')) {
    if (!ctx) {
      return {
        reply: `I don't have the live portfolio metrics in context right now. Please refresh the dashboard and try again.`,
        followups: ['Show branch comparison', 'Show top overdue borrowers', 'Draft payment reminder'],
      }
    }
    return {
      reply: `Here is our current portfolio performance breakdown:

- **Total Disbursed:** ${formatInr(ctx.totalDisbursed)}
- **Outstanding Principal:** ${formatInr(ctx.totalOutstanding)} across **${ctx.activeLoansCount || 0} active loans**
- **Total Collections Recorded:** ${formatInr(ctx.totalCollected)} (${ctx.collectionEfficiency || 0}% collection efficiency)
- **Overdue Accounts (PAR 30+):** **${ctx.parLoansCount || 0} loans**
- **Gross NPA (90+ DPD):** **${ctx.npaLoansCount || 0} loans** (${formatInr(ctx.npaAmount)} · ${ctx.npaRatio || '0.00'}%)
- **Total Registered Members:** **${ctx.totalMembers || 0} members**

Overall, collection efficiency is holding solid. Which branch would you like to review in detail?`,
      followups: [
        'Show branch-wise comparison',
        'List top overdue borrowers',
        'Draft WhatsApp reminder in Hindi',
      ],
    }
  }

  if (q.includes('overdue') || q.includes('par') || q.includes('risk') || q.includes('defaulter') || q.includes('dpd') || q.includes('डिफॉल्ट')) {
    if (!ctx?.atRiskLoans || ctx.atRiskLoans.length === 0) {
      return {
        reply: `Great news! There are currently zero high-risk accounts (30+ DPD) in the active portfolio. All collections are running on time.`,
        followups: ['Show portfolio overview', 'Branch performance comparison', 'Calculate loan EMI'],
      }
    }
    const list = ctx.atRiskLoans
      .map(
        (l, i) =>
          `${i + 1}. **${l.member}** ([LOAN:${l.loan_no}]) — **${l.dpd} DPD** | Outstanding: **${formatInr(l.outstanding)}** (${l.branch})`
      )
      .join('\n')
    return {
      reply: `Here are the top accounts requiring field follow-up (30+ DPD):

${list}

You can click any loan account above to open its full repayment schedule and payment history.`,
      followups: [
        'Draft WhatsApp reminder for these borrowers',
        'Show Haridwar branch performance',
        'How to record a recovery payment?',
      ],
    }
  }

  if (q.includes('branch') || q.includes('haridwar') || q.includes('khatauli') || q.includes('pataudi') || q.includes('ब्रांच')) {
    if (!ctx?.branches || ctx.branches.length === 0) {
      return {
        reply: `Branch breakdown data is not loaded yet. Please ensure loan records are synced.`,
        followups: ['Show portfolio overview', 'Show top overdue borrowers', 'Calculate loan EMI'],
      }
    }
    const branchRows = ctx.branches
      .map(
        b =>
          `- **${b.name}:** ${b.loans} loans · Disbursed: ${formatInr(b.disbursed)} · Outstanding: ${formatInr(b.outstanding)} · NPA: ${b.npa}`
      )
      .join('\n')
    return {
      reply: `Here is the performance comparison across our active branches:

${branchRows}

Let me know if you would like specific member details for any of these branches.`,
      followups: [
        'Show top overdue accounts in Haridwar',
        'Show portfolio overview',
        'Draft WhatsApp reminder in Hindi',
      ],
    }
  }

  return {
    reply: `I am here to assist you with any aspect of our microfinance operations.

You can ask me about:
- Real-time portfolio KPIs and Gross NPA ratios
- Overdue borrower investigations and DPD aging
- Generating WhatsApp payment reminders in Hindi or English
- Branch comparisons and loan calculations

Feel free to type or tap the microphone to speak!`,
    followups: [
      'Show portfolio summary',
      'Show top overdue accounts',
      'Compare branch performance',
    ],
  }
}
