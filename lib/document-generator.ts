// Document & Certificate Printout Generator for AA2 Finance MFI System
// Generates Sanction Letters, Payment Receipts, NOC, SOA, Repayment Schedule,
// Top-Up Letters, Restructure Agreements, and Foreclosure Receipts

export interface SanctionLetterData {
  loan_account_no: string
  member_name: string
  customer_id: string
  mobile: string
  father_husband_name: string
  address: string
  branch_code: string
  loan_amount: number
  net_disbursement: number
  file_charge: number
  interest_rate: number
  tenure: number
  frequency: string
  installment_amount: number
  disbursement_date: string
  installment_start_date: string
  product_type: string
  penalty_per_day?: number
  district?: string
  state?: string
  fo_name?: string
  bm_name?: string
  total_cost?: number
  schedule?: {
    installment_no: number
    due_date: string
    opening_balance: number
    principal_due: number
    interest_due: number
    emi_due: number
    closing_balance: number
  }[]
}

export interface PaymentReceiptData {
  receipt_no: string
  txn_date: string
  loan_account_no: string
  member_name: string
  customer_id: string
  branch_code: string
  amount: number
  mode: string
  reference_no: string
  installment_no?: number | null
  remarks?: string
  remaining_outstanding: number
  entered_by: string
  payment_category?: string
  classification?: string
  principal_paid?: number
  interest_paid?: number
  penal_paid?: number
  advance_paid?: number
  shortage_amount?: number
  advance_wallet_balance?: number
  arrears_balance?: number
  current_installment_status?: string
  next_due_date?: string | null
  next_due_amount?: number
  narration?: string
  dpd_status?: string | number
}

export interface ForeclosureNocData {
  certificate_no: string
  issue_date: string
  loan_account_no: string
  member_name: string
  customer_id: string
  father_husband_name: string
  address: string
  branch_code: string
  loan_amount: number
  disbursement_date: string
  close_date: string
  total_paid: number
  status: string
}

export interface RepaymentScheduleData {
  loan_account_no: string
  member_name: string
  customer_id: string
  branch_code: string
  loan_amount: number
  interest_rate: number
  tenure: number
  frequency: string
  installment_amount: number
  disbursement_date: string
  installment_start_date: string
  product_type: string
  schedule: {
    installment_no: number
    due_date: string
    opening_balance: number
    principal_due: number
    interest_due: number
    emi_due: number
    closing_balance: number
    paid_amount?: number
    status?: string
  }[]
}

export interface SOAData {
  loan_account_no: string
  member_name: string
  customer_id: string
  father_husband_name: string
  mobile: string
  address: string
  branch_code: string
  loan_amount: number
  interest_rate: number
  tenure: number
  frequency: string
  installment_amount: number
  disbursement_date: string
  file_charge: number
  total_loan: number
  total_collected: number
  ledger_balance: number
  status: string
  product_type: string
  schedule: {
    installment_no: number
    due_date: string
    emi_due: number
    paid_amount: number
    status: string
    dpd: number
  }[]
  advance_balance?: number
  arrears_balance?: number
  transactions: {
    txn_id: string | number
    txn_date: string
    amount: number
    mode: string
    reference_no: string
    classification?: string
    principal_component?: number
    interest_component?: number
    advance_component?: number
    shortage_amount?: number
    narration?: string
  }[]
}

export interface TopUpLetterData {
  loan_account_no: string
  member_name: string
  customer_id: string
  father_husband_name: string
  mobile: string
  address: string
  branch_code: string
  original_loan_amount: number
  outstanding_before_topup: number
  topup_amount: number
  new_total_outstanding: number
  interest_rate: number
  new_tenure: number
  frequency: string
  new_installment_amount: number
  topup_date: string
  first_emi_date: string
  product_type: string
}

export interface RestructureAgreementData {
  loan_account_no: string
  member_name: string
  customer_id: string
  father_husband_name: string
  address: string
  branch_code: string
  original_loan_amount: number
  outstanding_at_restructure: number
  old_tenure: number
  new_tenure: number
  old_installment: number
  new_installment: number
  frequency: string
  restructure_date: string
  first_emi_date: string
  reason: string
}

const INR = (v: number) => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const FDATE = (d: string) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return d }
}

/** Opens a browser print window with styled HTML document */
function printDocument(title: string, bodyHtml: string) {
  const printWindow = window.open('', '_blank', 'width=900,height=1000')
  if (!printWindow) {
    const { toast } = require('@/lib/toast')
    toast.warning('Popup Blocked', 'Please allow popups to view and print documents.')
    return
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @page { size: A4 portrait; margin: 10mm 12mm; }
          * { box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; margin: 0; padding: 0; font-size: 10px; line-height: 1.45; }
          .page { page-break-after: always; break-after: page; min-height: 980px; position: relative; padding-bottom: 35px; box-sizing: border-box; }
          .page:last-child { page-break-after: avoid; break-after: avoid; }
          .header-banner { text-align: center; border-bottom: 2.5px solid #1e3a8a; padding-bottom: 8px; margin-bottom: 10px; }
          .logo-container { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 3px; }
          .brand-logo-img { height: 46px; width: auto; object-fit: contain; }
          .header-brand-title { font-size: 16.5px; font-weight: 900; color: #1e3a8a; margin: 4px 0 1px 0; text-transform: uppercase; letter-spacing: 0.8px; line-height: 1.2; }
          .header-brand-sub { font-size: 8.5px; font-weight: 700; color: #2563eb; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }
          .header-reg-badge { font-size: 8px; font-weight: 600; color: #334155; background: #f1f5f9; border: 1px solid #cbd5e1; padding: 2px 10px; border-radius: 4px; display: inline-block; margin: 4px 0; letter-spacing: 0.3px; }
          .header-address-strip { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; font-size: 8px; color: #475569; border-top: 1px solid #e2e8f0; padding-top: 4px; margin-top: 4px; text-align: left; }
          .doc-title { font-size: 12px; font-weight: 800; text-align: center; background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 6px 10px; border-radius: 5px; color: #ffffff; margin: 8px 0 10px 0; text-transform: uppercase; letter-spacing: 1.2px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .ref-bar { display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #cbd5e1; padding: 5px 12px; border-radius: 5px; margin-bottom: 10px; font-size: 9.5px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
          .box { border: 1px solid #cbd5e1; padding: 7px 10px; border-radius: 5px; background: #ffffff; break-inside: avoid; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
          .box-title { font-size: 8.5px; font-weight: 800; text-transform: uppercase; color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin-bottom: 5px; letter-spacing: 0.5px; }
          .row { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 9.5px; }
          .label { color: #64748b; font-weight: 500; }
          .value { font-weight: 700; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 9px; break-inside: avoid; }
          th { background: #1e3a8a; border: 1px solid #1e3a8a; padding: 5px 6px; text-align: center; font-size: 8px; font-weight: 800; color: #ffffff; text-transform: uppercase; letter-spacing: 0.3px; }
          td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: center; font-size: 9px; }
          td.left { text-align: left; }
          tr:nth-child(even) td { background: #f8fafc; }
          .signatures { display: flex; justify-content: space-between; margin-top: 22px; padding-top: 10px; break-inside: avoid; }
          .sig-box { width: 180px; text-align: center; border-top: 1.5px solid #64748b; padding-top: 4px; font-size: 8.5px; font-weight: 700; color: #334155; }
          .footer { position: absolute; bottom: 0; left: 0; right: 0; text-align: center; font-size: 7.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 4px; }
          .badge { display: inline-block; padding: 2px 5px; border-radius: 3px; font-size: 8px; font-weight: 800; text-transform: uppercase; }
          .badge-green { background: #dcfce7; color: #15803d; }
          .badge-blue { background: #dbeafe; color: #1e40af; }
          .badge-red { background: #fee2e2; color: #b91c1c; }
          .section-title { font-size: 9.5px; font-weight: 800; color: #1e3a8a; text-transform: uppercase; margin: 10px 0 4px 0; border-left: 3px solid #1e3a8a; padding-left: 6px; letter-spacing: 0.5px; }
          .clause-heading { font-size: 9px; font-weight: 800; color: #0f172a; margin: 5px 0 2px 0; }
          .clause-text { font-size: 8.5px; color: #334155; text-align: justify; text-justify: inter-word; line-height: 1.4; margin-bottom: 4px; }
          .page-num { position: absolute; bottom: 0; right: 0; font-size: 8px; font-weight: 700; color: #64748b; }
          .preview-toolbar { position: sticky; top: 0; z-index: 9999; background: #0f172a; color: #ffffff; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-family: sans-serif; border-bottom: 2px solid #2563eb; }
          @media screen {
            body { background: #475569; padding-bottom: 40px; }
            .page {
              width: 210mm;
              min-height: 297mm;
              margin: 25px auto;
              padding: 12mm 15mm 18mm 15mm;
              background: #ffffff;
              box-shadow: 0 8px 25px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.1);
              border-radius: 3px;
              box-sizing: border-box;
              position: relative;
            }
          }
          @media print {
            body { padding: 0; background: transparent; }
            .page { margin: 0; padding-bottom: 35px; width: 100%; box-shadow: none; border-radius: 0; }
            .no-print, .preview-toolbar { display: none !important; visibility: hidden !important; }
          }
        </style>
      </head>
      <body>
        <div class="no-print preview-toolbar">
          <div style="font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 10px;">
            <span>📄 Document Preview Mode</span>
            <span style="font-size: 10px; background: #2563eb; color: #ffffff; padding: 3px 10px; border-radius: 12px; font-weight: 600;">${title}</span>
          </div>
          <div style="display: flex; gap: 10px;">
            <button onclick="window.print()" style="background: #2563eb; color: #ffffff; border: none; padding: 8px 18px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
              🖨️ Print Document
            </button>
            <button onclick="window.close()" style="background: #475569; color: #ffffff; border: none; padding: 8px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
              ❌ Close Preview
            </button>
          </div>
        </div>
        ${bodyHtml}
      </body>
    </html>
  `

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. LOAN SANCTION LETTER & MASTER CREDIT AGREEMENT (4-PAGE PERFECT A4 PRINT)
// ═══════════════════════════════════════════════════════════════════════════════
export function generateSanctionLetter(data: SanctionLetterData) {
  const headerHtml = `
    <div class="header-banner">
      <div class="logo-container">
        <img src="/brand/aa2-microfinance.png" alt="AA2 Microfinance" class="brand-logo-img" onerror="this.style.display='none'" />
        <img src="/brand/aa2-foundation.jpeg" alt="AA2 Foundation" class="brand-logo-img" style="height:44px;" onerror="this.style.display='none'" />
      </div>
      <h1 class="header-brand-title">AA2 MICROFINANCE PRIVATE LIMITED</h1>
      <p class="header-brand-sub">Gorav MF Solution • Registered Microfinance Institution (MFI)</p>
      <div class="header-reg-badge">CIN: U64990UP2023PTC184704 &nbsp;|&nbsp; PAN: AAYCA9551F &nbsp;|&nbsp; TAN: MRTA20479E</div>

      <div class="header-address-strip">
        <div><strong>Regd Office:</strong> Opp. Punjab & Sindh Bank, Dehradun Rd, Gagalheri, Saharanpur, UP 247669</div>
        <div><strong>Corp Office:</strong> Shanti Kunj Dehradun Rd, Gagalheri, Saharanpur, UP 247669</div>
        <div><strong>Tel:</strong> +91-9761585314 &nbsp;|&nbsp; <strong>Email:</strong> info@aa2finance.com</div>
        <div><strong>Web:</strong> www.aa2microfinance.com &nbsp;|&nbsp; aa2mutualhelpfoundation.com</div>
      </div>
    </div>
  `

  const footer = (pageNum: number, totalPages = 4) => `
    <div class="footer">
      <p style="margin:0;">AA2 Microfinance Private Limited • Corporate Office: Gagalheri, Saharanpur, UP 247669 • Helpline: +91-9761585314</p>
      <p style="margin:1px 0 0 0;">Confidential Credit Document • Registered under Companies Act, 2013 • Powered by Gorav MF Solution</p>
      <div class="page-num">Page ${pageNum} of ${totalPages}</div>
    </div>
  `

  const totalInterest = Math.max(0, (data.installment_amount * data.tenure) - data.loan_amount)
  const apr = (((totalInterest + data.file_charge) / data.loan_amount) / (data.tenure / (data.frequency === 'Weekly' ? 52 : 12)) * 100).toFixed(2)

  let body = ''

  // ───────────────────────────────────────────────────────────────────────────
  // PAGE 1: COVER, BORROWER PROFILE & KEY FACT STATEMENT (KFS)
  // ───────────────────────────────────────────────────────────────────────────
  body += `
    <div class="page">
      ${headerHtml}
      <div class="doc-title">SANCTION LETTER & MASTER CREDIT AGREEMENT</div>
      
      <div class="ref-bar">
        <div><strong>Sanction Letter Ref:</strong> <span style="font-family:monospace; font-weight:700; color:#1e40af;">AA2/SL/${data.loan_account_no}</span></div>
        <div><strong>Sanction Date:</strong> <span style="font-weight:700; color:#0f172a;">${FDATE(data.disbursement_date)}</span></div>
      </div>

      <div class="grid">
        <div class="box">
          <div class="box-title">Borrower Particulars</div>
          <div class="row"><span class="label">Full Name:</span> <span class="value">${data.member_name}</span></div>
          <div class="row"><span class="label">Customer ID:</span> <span class="value">${data.customer_id}</span></div>
          <div class="row"><span class="label">Father / Husband:</span> <span class="value">${data.father_husband_name || 'N/A'}</span></div>
          <div class="row"><span class="label">Mobile Number:</span> <span class="value">${data.mobile || 'N/A'}</span></div>
          <div class="row"><span class="label">Village / City:</span> <span class="value">${data.address || 'Gagalheri'}</span></div>
        </div>
        <div class="box">
          <div class="box-title">Sanction & Location Details</div>
          <div class="row"><span class="label">Loan Account No:</span> <span class="value">${data.loan_account_no}</span></div>
          <div class="row"><span class="label">Branch Name:</span> <span class="value">${data.branch_code}</span></div>
          <div class="row"><span class="label">District & State:</span> <span class="value">${data.district || 'Saharanpur'}, ${data.state || 'UP'}</span></div>
          <div class="row"><span class="label">Field Officer (FO):</span> <span class="value">${data.fo_name || 'Assigned Officer'}</span></div>
          <div class="row"><span class="label">Branch Manager (BM):</span> <span class="value">${data.bm_name || 'Branch Manager'}</span></div>
        </div>
      </div>

      <div class="section-title">KEY FACT STATEMENT (KFS) — RBI DIRECTIVES ALIGNED</div>
      <table>
        <thead>
          <tr>
            <th style="width:45%;">Parameter</th>
            <th style="width:55%;">Sanctioned Details & Value</th>
          </tr>
        </thead>
        <tbody>
          <tr><td class="left"><strong>1. Sanctioned Loan Amount</strong></td><td><strong>${INR(data.loan_amount)}</strong></td></tr>
          <tr><td class="left"><strong>2. Processing Fee (Incl. GST)</strong></td><td>${INR(data.file_charge)} (Non-refundable)</td></tr>
          <tr><td class="left"><strong>3. Net Disbursed Amount</strong></td><td><strong>${INR(data.net_disbursement)}</strong></td></tr>
          <tr><td class="left"><strong>4. Total Interest Chargeable</strong></td><td>${INR(totalInterest)}</td></tr>
          <tr><td class="left"><strong>5. Total Repayable Amount</strong></td><td><strong>${INR(data.installment_amount * data.tenure)}</strong></td></tr>
          <tr><td class="left"><strong>6. Tenure & Frequency</strong></td><td>${data.tenure} ${data.frequency} Installments</td></tr>
          <tr><td class="left"><strong>7. Installment Amount</strong></td><td><strong>${INR(data.installment_amount)}</strong></td></tr>
          <tr><td class="left"><strong>8. First Due Date</strong></td><td>${FDATE(data.installment_start_date)}</td></tr>
        </tbody>
      </table>

      <div class="section-title">SCHEDULE OF PENAL & OTHER CHARGES</div>
      <table>
        <thead>
          <tr><th>Charge Type</th><th>Rate / Amount</th><th>Applicability</th></tr>
        </thead>
        <tbody>
          <tr><td class="left"><strong>Late Payment Fee</strong></td><td>${INR(data.penalty_per_day || 10)} / day</td><td>Applied on overdue installments beyond due date</td></tr>
          <tr><td class="left"><strong>Prepayment Penalty</strong></td><td>₹0 (NIL)</td><td>Zero penalty as per RBI microfinance directives</td></tr>
          <tr><td class="left"><strong>NACH / Bounce Fee</strong></td><td>₹250 per bounce</td><td>Charged if bank auto-debit fails due to low balance</td></tr>
        </tbody>
      </table>

      <div class="box" style="background:#f0fdf4; border-color:#bbf7d0; margin-top:8px;">
        <div class="box-title" style="color:#166534;">Grievance Redressal & Nodal Officer Contact</div>
        <p class="clause-text" style="margin:0; color:#15803d;">For complaints or queries: Grievance Officer, AA2 Microfinance Pvt Ltd, Shanti Kunj Dehradun Rd, Gagalheri, Saharanpur, UP 247669. Helpline: +91-9761585314 | Email: info@aa2finance.com | RBI Escalation: https://cms.rbi.org.in</p>
      </div>
      ${footer(1)}
    </div>
  `

  // ───────────────────────────────────────────────────────────────────────────
  // PAGE 2: MASTER CREDIT AGREEMENT — TERMS & COVENANTS (CLAUSES 1–10)
  // ───────────────────────────────────────────────────────────────────────────
  body += `
    <div class="page">
      ${headerHtml}
      <div class="doc-title">MASTER CREDIT AGREEMENT — TERMS & COVENANTS</div>

      <div class="clause-heading">1. SANCTION AND DISBURSEMENT FACILITY</div>
      <p class="clause-text">AA2 Microfinance Private Limited ("Lender") agrees to advance the Loan Amount specified in the Key Fact Statement to the Borrower (${data.member_name}). Disbursement is made directly into the borrower's verified bank account post KYC and household income evaluation as prescribed under RBI Microfinance Directions.</p>

      <div class="clause-heading">2. INTEREST COMPUTATION & PAYMENT WATERFALL</div>
      <p class="clause-text">Interest is levied as specified in the Key Fact Statement over the sanctioned tenure. Payments received shall be credited in the following order: (i) Statutory Charges & Taxes, (ii) Overdue Late Penalties, (iii) Interest Overdue, (iv) Principal Outstanding.</p>

      <div class="clause-heading">3. ZERO PREPAYMENT PENALTY & FORECLOSURE RIGHTS</div>
      <p class="clause-text">The borrower has the full right to prepay or foreclose the loan facility at any time by clearing the outstanding principal and accrued interest. No foreclosure fees or prepayment penalties shall be demanded by the Lender.</p>

      <div class="clause-heading">4. BORROWER REPRESENTATIONS & HOUSEHOLD INCOME LIMITS</div>
      <p class="clause-text">The borrower warrants that annual household income complies with RBI microfinance qualifying criteria (under ₹3,00,000 p.a.). The borrower confirms that all declarations, identity proofs, and bank details provided are genuine and accurate.</p>

      <div class="clause-heading">5. AFFIRMATIVE COVENANTS</div>
      <p class="clause-text">The borrower agrees to: (a) Utilize loan proceeds exclusively for micro-enterprise / income generation activities, (b) Pay all installments on or before due dates, (c) Notify the Lender of any address or contact change within 7 days.</p>

      <div class="clause-heading">6. NEGATIVE COVENANTS</div>
      <p class="clause-text">The borrower shall not: (a) Over-indebt the household beyond RBI borrowing limits, (b) Divert funds for speculative, illegal, or anti-social purposes, (c) Alienate or pledge enterprise assets purchased via loan proceeds without consent.</p>

      <div class="clause-heading">7. INSPECTION AND AUDIT RIGHTS</div>
      <p class="clause-text">Authorized credit officers of the Lender reserve the right to inspect enterprise premises, verify asset creation, and audit repayment register books during regular business hours.</p>

      <div class="clause-heading">8. CREDIT INFORMATION BUREAU REPORTING</div>
      <p class="clause-text">The borrower consents to the Lender sharing credit profile and repayment performance history with Credit Information Companies (CIBIL, Equifax, Experian, CRIF High Mark) in accordance with RBI regulations.</p>

      <div class="clause-heading">9. EVENTS OF DEFAULT & REMEDIES</div>
      <p class="clause-text">Events of Default include non-payment of EMI on due date, submission of false documents, or insolvency. Upon default, the Lender may demand immediate payment of total outstanding dues and initiate recovery as permitted under Indian Law.</p>

      <div class="clause-heading">10. GOVERNING LAW & JURISDICTION</div>
      <p class="clause-text">This credit agreement is governed by the laws of India. Legal courts located in Saharanpur / Haridwar shall have exclusive jurisdiction over legal matters arising under this agreement.</p>
      ${footer(2)}
    </div>
  `

  // ───────────────────────────────────────────────────────────────────────────
  // PAGE 3: SCHEDULE A — REPAYMENT SCHEDULE MATRIX (FULL PAGE TABLE)
  // ───────────────────────────────────────────────────────────────────────────
  let schedTable = ''
  if (data.schedule && data.schedule.length > 0) {
    schedTable = data.schedule.map((s: any) => `
      <tr>
        <td>${s.installment_no}</td>
        <td>${FDATE(s.due_date)}</td>
        <td>${INR(s.opening_balance)}</td>
        <td>${INR(s.principal_due)}</td>
        <td>${INR(s.interest_due)}</td>
        <td><strong>${INR(s.emi_due)}</strong></td>
        <td>${INR(s.closing_balance)}</td>
      </tr>
    `).join('')
  } else {
    let bal = data.total_cost || (data.loan_amount + totalInterest)
    const perInt = Math.round(totalInterest / data.tenure)
    const perEmi = data.installment_amount
    for (let i = 1; i <= Math.min(data.tenure, 25); i++) {
      const prin = perEmi - perInt
      const cBal = Math.max(0, bal - perEmi)
      schedTable += `
        <tr>
          <td>${i}</td>
          <td>Installment ${i}</td>
          <td>${INR(bal)}</td>
          <td>${INR(prin)}</td>
          <td>${INR(perInt)}</td>
          <td><strong>${INR(perEmi)}</strong></td>
          <td>${INR(cBal)}</td>
        </tr>
      `
      bal = cBal
    }
  }

  body += `
    <div class="page">
      ${headerHtml}
      <div class="doc-title">SCHEDULE A — REPAYMENT SCHEDULE MATRIX</div>
      <table style="margin-top:6px;">
        <thead>
          <tr>
            <th>#</th>
            <th>Due Date</th>
            <th>Opening Bal</th>
            <th>Principal</th>
            <th>Interest</th>
            <th>EMI Due</th>
            <th>Closing Bal</th>
          </tr>
        </thead>
        <tbody>
          ${schedTable}
        </tbody>
      </table>
      ${footer(3)}
    </div>
  `

  // ───────────────────────────────────────────────────────────────────────────
  // PAGE 4: JLG RULES, VERNACULAR DECLARATIONS & EXECUTION SIGNATURES
  // ───────────────────────────────────────────────────────────────────────────
  body += `
    <div class="page">
      ${headerHtml}
      <div class="doc-title">JLG GUARANTEE, DECLARATIONS & EXECUTION SIGNATURES</div>

      <div class="section-title">JOINT LIABILITY GROUP (JLG) GUARANTEE & CENTER RULES</div>
      <div class="clause-heading">11. JOINT AND SEVERAL CROSS-GUARANTEE</div>
      <p class="clause-text">For Joint Liability Group (JLG) loan accounts, all members of the group jointly and severally guarantee full repayment of each other's installment dues. In case of default by a peer member, group members commit to covering the shortfall.</p>

      <div class="clause-heading">12. CENTER MEETING DISCIPLINE & DIGITAL MANDATE</div>
      <p class="clause-text">Group members undertake to attend all scheduled Center Meetings punctually. The borrower is issued an official printed receipt for every repayment. Digital payments via UPI/NACH are encouraged.</p>

      <div class="box" style="margin-top:6px;">
        <div class="box-title">Vernacular Borrower Declaration (English)</div>
        <p class="clause-text" style="margin:0;">I hereby declare that all terms and conditions of this Sanction Letter and Master Credit Agreement have been read over and explained to me in Hindi/local language. I have fully understood the interest rates, EMI amounts, fee charges, and repayment obligations. I accept the loan facility willingly without any coercion.</p>
      </div>

      <div class="box" style="margin-top:6px; background:#fff7ed; border-color:#fed7aa;">
        <div class="box-title" style="color:#c2410c;">हिंदी में घोषणा (Local Language Declaration)</div>
        <p class="clause-text" style="margin:0; color:#9a3412;">मैं एतद्द्वारा घोषणा करता/करती हूँ कि इस स्वीकृति पत्र एवं ऋण समझौते के सभी नियमों एवं शर्तों को मुझे मेरी स्थानीय भाषा (हिंदी) में पढ़कर सुनाया और समझाया गया है। मैंने ब्याज दर, मासिक/साप्ताहिक किस्त (EMI), शुल्क एवं भुगतान तिथियों को भली-भांति समझ लिया है और मैं इस ऋण स्वीकृति को अपनी स्वेच्छा से स्वीकार करता/करती हूँ।</p>
      </div>

      <div class="section-title" style="margin-top:8px;">FAIR PRACTICES CODE SUMMARY</div>
      <p class="clause-text">AA2 Microfinance follows a strict Fair Practices Code: (i) Zero harassment recovery policy — collection calls/visits between 07:00 AM and 07:00 PM only, (ii) No hidden fees or mandatory insurance tie-ins, (iii) Full data privacy protection under Indian Law.</p>

      <p class="clause-text" style="margin-top:10px; font-weight:700; color:#0f172a;">IN WITNESS WHEREOF, the parties hereto have executed this Sanction Letter and Credit Agreement on the date first above written.</p>

      <div class="signatures" style="margin-top:20px;">
        <div class="sig-box">Borrower Signature / Thumb Impression<br>(${data.member_name})</div>
        <div class="sig-box">Co-Borrower / Guarantor Signature</div>
        <div class="sig-box">Center Leader Signature</div>
      </div>

      <div class="signatures" style="margin-top:25px;">
        <div class="sig-box">Field Officer (FO) Signature</div>
        <div class="sig-box">Branch Manager (BM) Signature</div>
        <div class="sig-box">For AA2 Microfinance Pvt. Ltd.<br>(Authorized Sanctioning Signatory)</div>
      </div>
      ${footer(4)}
    </div>
  `

  printDocument(`Sanction_Letter_${data.loan_account_no}`, body)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. OFFICIAL REPAYMENT RECEIPT (STANDARD A4 / A5)
// ═══════════════════════════════════════════════════════════════════════════════
export function generatePaymentReceipt(data: PaymentReceiptData) {
  const categoryBadgeClass =
    data.payment_category === 'SHORT'
      ? 'badge-amber'
      : data.payment_category === 'EXCESS' || data.payment_category === 'ADVANCE'
      ? 'badge-blue'
      : data.payment_category === 'OVERDUE_CLEARANCE'
      ? 'badge-purple'
      : 'badge-green'

  const body = `
    <div class="doc-title">OFFICIAL REPAYMENT RECEIPT</div>

    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
      <div>
        <span style="font-size: 11px; color: #64748b;">Receipt No:</span>
        <strong style="font-size: 13px; font-family: monospace; color: #0f172a; margin-left: 4px;">${data.receipt_no}</strong>
      </div>
      <div>
        <span class="badge ${categoryBadgeClass}" style="font-size: 11px; padding: 4px 10px;">
          ${data.classification || 'Repayment Collection'}
        </span>
      </div>
    </div>

    <div class="grid">
      <div class="box">
        <div class="box-title">Receipt Information</div>
        <div class="row"><span class="label">Payment Date:</span> <span class="value">${FDATE(data.txn_date)}</span></div>
        <div class="row"><span class="label">Payment Mode:</span> <span class="value">${data.mode}</span></div>
        <div class="row"><span class="label">Reference No:</span> <span class="value font-mono">${data.reference_no || '-'}</span></div>
        ${data.installment_no ? `<div class="row"><span class="label">Installment No:</span> <span class="value">#${data.installment_no}</span></div>` : ''}
        <div class="row"><span class="label">Collected By:</span> <span class="value">${data.entered_by}</span></div>
      </div>
      <div class="box">
        <div class="box-title">Borrower & Account Details</div>
        <div class="row"><span class="label">Member Name:</span> <span class="value"><strong>${data.member_name}</strong></span></div>
        <div class="row"><span class="label">Customer ID:</span> <span class="value font-mono">${data.customer_id}</span></div>
        <div class="row"><span class="label">Loan Account No:</span> <span class="value font-mono"><strong>${data.loan_account_no}</strong></span></div>
        <div class="row"><span class="label">Branch Code:</span> <span class="value">${data.branch_code}</span></div>
      </div>
    </div>

    <div class="box" style="background: #f8fafc; border-color: #cbd5e1; padding: 14px; margin-bottom: 14px;">
      <div class="box-title" style="margin-bottom: 8px;">Payment & Fund Appropriation Breakdown</div>
      <table style="margin-bottom: 0; font-size: 11px;">
        <thead>
          <tr style="background: #f1f5f9;">
            <th>Total Paid</th>
            <th>Principal Credited</th>
            <th>Interest Credited</th>
            <th>Penal / Fees</th>
            <th>Advance Wallet</th>
            ${(data.shortage_amount || 0) > 0 ? `<th style="color: #b91c1c;">Shortage (Arrears)</th>` : ''}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="font-weight: 800; font-size: 13px; color: #15803d;">${INR(data.amount)}</td>
            <td>${INR(data.principal_paid !== undefined ? data.principal_paid : Math.round(data.amount * 0.8))}</td>
            <td>${INR(data.interest_paid !== undefined ? data.interest_paid : Math.round(data.amount * 0.2))}</td>
            <td>${INR(data.penal_paid || 0)}</td>
            <td>${INR(data.advance_paid || 0)}</td>
            ${(data.shortage_amount || 0) > 0 ? `<td style="font-weight: 800; color: #b91c1c;">${INR(data.shortage_amount || 0)}</td>` : ''}
          </tr>
        </tbody>
      </table>
    </div>

    <div class="grid" style="margin-bottom: 14px;">
      <div class="box" style="background: #eff6ff; border-color: #bfdbfe;">
        <div class="box-title" style="color: #1e40af;">Loan Outstanding & Advance Status</div>
        <div class="row"><span class="label">Remaining Principal Balance:</span> <span class="value" style="font-weight: 800; color: #b91c1c;">${INR(data.remaining_outstanding)}</span></div>
        <div class="row"><span class="label">Advance Wallet Balance:</span> <span class="value" style="font-weight: 700; color: #1e40af;">${INR(data.advance_wallet_balance || 0)}</span></div>
        ${(data.arrears_balance || 0) > 0 ? `<div class="row"><span class="label" style="color: #b91c1c;">Total Overdue Arrears:</span> <span class="value" style="font-weight: 800; color: #b91c1c;">${INR(data.arrears_balance || 0)}</span></div>` : ''}
      </div>
      <div class="box" style="background: #f0fdf4; border-color: #bbf7d0;">
        <div class="box-title" style="color: #166534;">Next Due Schedule</div>
        <div class="row"><span class="label">Next Due Date:</span> <span class="value"><strong>${data.next_due_date ? FDATE(data.next_due_date) : 'Fully Up To Date'}</strong></span></div>
        <div class="row"><span class="label">Net Payable Amount:</span> <span class="value" style="font-weight: 800; color: #166534;">${data.next_due_amount !== undefined ? INR(data.next_due_amount) : 'As per schedule'}</span></div>
        <div class="row"><span class="label">Account Health:</span> <span class="value">${data.dpd_status ? `${data.dpd_status} DPD` : 'Regular (0 DPD)'}</span></div>
      </div>
    </div>

    ${data.narration || data.remarks ? `
      <div class="box" style="background: #fafafa; border-color: #e5e7eb; padding: 10px 14px; margin-bottom: 16px;">
        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #6b7280; margin-bottom: 4px;">Transaction Audit Narration</div>
        <p style="font-size: 11px; color: #374151; margin: 0; line-height: 1.5;">${data.narration || data.remarks}</p>
      </div>
    ` : ''}

    <div class="signatures">
      <div class="sig-box">Borrower's Signature</div>
      <div class="sig-box">Authorized Cashier / Field Officer</div>
    </div>
  `
  printDocument(`Receipt_${data.receipt_no}`, body)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2B. THERMAL POS RECEIPT (58mm / 80mm Bluetooth Field Printer)
// ═══════════════════════════════════════════════════════════════════════════════
export function generateThermalPaymentReceipt(data: PaymentReceiptData) {
  const thermalBody = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Receipt_${data.receipt_no}</title>
        <style>
          @page { size: 80mm auto; margin: 2mm; }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 11px;
            color: #000;
            width: 72mm;
            margin: 0 auto;
            padding: 4px;
            line-height: 1.3;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .line { border-top: 1px dashed #000; margin: 6px 0; }
          .dline { border-top: 1px double #000; margin: 6px 0; }
          .row { display: flex; justify-content: space-between; margin: 2px 0; }
          .big { font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="center bold big">AA2 MICROFINANCE</div>
        <div class="center" style="font-size: 9px;">Private Limited Core Banking</div>
        <div class="center" style="font-size: 9px;">Branch: ${data.branch_code}</div>
        <div class="dline"></div>

        <div class="center bold">REPAYMENT RECEIPT</div>
        <div class="row"><span>Receipt No:</span><span class="bold">${data.receipt_no}</span></div>
        <div class="row"><span>Date & Time:</span><span>${data.txn_date}</span></div>
        <div class="row"><span>Mode:</span><span>${data.mode}</span></div>
        ${data.reference_no ? `<div class="row"><span>Ref:</span><span>${data.reference_no}</span></div>` : ''}
        <div class="line"></div>

        <div class="row"><span>Member:</span><span class="bold">${data.member_name}</span></div>
        <div class="row"><span>Customer ID:</span><span>${data.customer_id}</span></div>
        <div class="row"><span>Loan A/C:</span><span class="bold">${data.loan_account_no}</span></div>
        ${data.installment_no ? `<div class="row"><span>Inst. No:</span><span>#${data.installment_no}</span></div>` : ''}
        <div class="line"></div>

        <div class="row big bold"><span>AMOUNT PAID:</span><span>${INR(data.amount)}</span></div>
        <div class="row"><span>Category:</span><span>${data.classification || 'Repayment'}</span></div>
        <div class="line"></div>

        ${data.principal_paid !== undefined ? `<div class="row"><span>Principal:</span><span>${INR(data.principal_paid)}</span></div>` : ''}
        ${data.interest_paid !== undefined ? `<div class="row"><span>Interest:</span><span>${INR(data.interest_paid)}</span></div>` : ''}
        ${(data.advance_paid || 0) > 0 ? `<div class="row"><span>Adv. Credited:</span><span>${INR(data.advance_paid || 0)}</span></div>` : ''}
        ${(data.shortage_amount || 0) > 0 ? `<div class="row bold"><span>Shortage:</span><span>${INR(data.shortage_amount || 0)}</span></div>` : ''}
        <div class="line"></div>

        <div class="row bold"><span>Outstanding:</span><span>${INR(data.remaining_outstanding)}</span></div>
        ${(data.advance_wallet_balance || 0) > 0 ? `<div class="row"><span>Adv. Balance:</span><span>${INR(data.advance_wallet_balance || 0)}</span></div>` : ''}
        ${data.next_due_date ? `<div class="row"><span>Next Due:</span><span>${FDATE(data.next_due_date)}</span></div>` : ''}
        ${data.next_due_amount !== undefined ? `<div class="row"><span>Next Payable:</span><span>${INR(data.next_due_amount)}</span></div>` : ''}

        <div class="dline"></div>
        <div class="center" style="font-size: 9px;">Collected by: ${data.entered_by}</div>
        <div class="center" style="font-size: 8.5px; margin-top: 4px;">Thank you for banking with AA2!</div>
        <div class="center" style="font-size: 8px;">Keep this receipt for your records.</div>
      </body>
    </html>
  `

  const pw = window.open('', '_blank', 'width=380,height=600')
  if (pw) {
    pw.document.write(thermalBody)
    pw.document.close()
    setTimeout(() => {
      pw.focus()
      pw.print()
    }, 300)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. NO OBJECTION CERTIFICATE (NOC) & LOAN CLOSURE CERTIFICATE
// ═══════════════════════════════════════════════════════════════════════════════
export function generateForeclosureNoc(data: ForeclosureNocData) {
  const body = `
    <div class="doc-title doc-title-green">NO OBJECTION CERTIFICATE & LOAN CLOSURE CERTIFICATE</div>

    <div style="text-align: right; font-size: 10px; color: #64748b; margin-bottom: 12px;">
      Certificate No: <strong>${data.certificate_no}</strong> &nbsp;|&nbsp; Issue Date: <strong>${FDATE(data.issue_date)}</strong>
    </div>

    <p class="text-sm" style="line-height: 1.8; margin-bottom: 20px;">
      This is to certify that <strong>${data.member_name}</strong> (Customer ID: <strong>${data.customer_id}</strong>),
      S/D/W of <strong>${data.father_husband_name || '-'}</strong>,
      residing at <strong>${data.address || 'On Record'}</strong>,
      has fully settled and repaid all outstanding dues towards Loan Account No: <strong>${data.loan_account_no}</strong>.
    </p>

    <div class="box mb-4">
      <div class="box-title">Settled Loan Details</div>
      <div class="grid" style="margin-bottom: 0;">
        <div>
          <div class="row"><span class="label">Sanctioned Amount:</span> <span class="value">${INR(data.loan_amount)}</span></div>
          <div class="row"><span class="label">Disbursement Date:</span> <span class="value">${FDATE(data.disbursement_date)}</span></div>
          <div class="row"><span class="label">Branch:</span> <span class="value">${data.branch_code}</span></div>
        </div>
        <div>
          <div class="row"><span class="label">Total Amount Paid:</span> <span class="value">${INR(data.total_paid)}</span></div>
          <div class="row"><span class="label">Closure Date:</span> <span class="value">${FDATE(data.close_date)}</span></div>
          <div class="row"><span class="label">Final Status:</span> <span class="badge badge-green">CLOSED / SETTLED</span></div>
        </div>
      </div>
    </div>

    <p class="text-sm" style="line-height: 1.7; color: #334155;">
      AA2 Micro Finance hereby confirms that there are <strong>no remaining dues, claims, or liabilities</strong> pending
      against the above-mentioned borrower for this loan account. All securities and hypothecations, if any, stand released
      with immediate effect. This certificate is issued upon full loan foreclosure/closure and may be used for any lawful purpose.
    </p>

    <div class="signatures" style="margin-top: 70px;">
      <div class="sig-box">Branch Manager</div>
      <div class="sig-box">Authorized Signatory<br>(AA2 Micro Finance)</div>
      <div class="sig-box">Company Seal</div>
    </div>
  `
  printDocument(`NOC_${data.loan_account_no}`, body)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. REPAYMENT SCHEDULE DOCUMENT
// ═══════════════════════════════════════════════════════════════════════════════
export function generateRepaymentSchedule(data: RepaymentScheduleData) {
  const totalPrincipal = data.schedule.reduce((s, r) => s + r.principal_due, 0)
  const totalInterest = data.schedule.reduce((s, r) => s + r.interest_due, 0)
  const totalEmi = data.schedule.reduce((s, r) => s + r.emi_due, 0)

  const scheduleRows = data.schedule.map(r => `
    <tr>
      <td>${r.installment_no}</td>
      <td>${FDATE(r.due_date)}</td>
      <td>${INR(r.opening_balance)}</td>
      <td>${INR(r.principal_due)}</td>
      <td>${INR(r.interest_due)}</td>
      <td><strong>${INR(r.emi_due)}</strong></td>
      <td>${INR(r.closing_balance)}</td>
      <td><span class="badge ${r.status === 'Paid' ? 'badge-green' : r.status === 'Overdue' ? 'badge-red' : 'badge-slate'}">${r.status || 'Pending'}</span></td>
    </tr>
  `).join('')

  const body = `
    <div class="doc-title doc-title-blue">REPAYMENT SCHEDULE</div>

    <div class="grid">
      <div class="box">
        <div class="box-title">Borrower Details</div>
        <div class="row"><span class="label">Member Name:</span> <span class="value">${data.member_name}</span></div>
        <div class="row"><span class="label">Customer ID:</span> <span class="value">${data.customer_id}</span></div>
        <div class="row"><span class="label">Branch:</span> <span class="value">${data.branch_code}</span></div>
      </div>
      <div class="box">
        <div class="box-title">Loan Summary</div>
        <div class="row"><span class="label">Loan Account No:</span> <span class="value">${data.loan_account_no}</span></div>
        <div class="row"><span class="label">Product:</span> <span class="value">${data.product_type}</span></div>
        <div class="row"><span class="label">Loan Amount:</span> <span class="value">${INR(data.loan_amount)}</span></div>
        <div class="row"><span class="label">Interest Rate:</span> <span class="value">${data.interest_rate}% p.a.</span></div>
        <div class="row"><span class="label">EMI Amount:</span> <span class="value">${INR(data.installment_amount)}</span></div>
        <div class="row"><span class="label">Tenure:</span> <span class="value">${data.tenure} ${data.frequency} installments</span></div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Due Date</th>
          <th>Opening Bal.</th>
          <th>Principal</th>
          <th>Interest</th>
          <th>EMI Due</th>
          <th>Closing Bal.</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${scheduleRows}
        <tr style="font-weight: 800; background: #f1f5f9;">
          <td colspan="3" style="text-align: right; font-size: 10px;">TOTAL</td>
          <td>${INR(totalPrincipal)}</td>
          <td>${INR(totalInterest)}</td>
          <td>${INR(totalEmi)}</td>
          <td colspan="2"></td>
        </tr>
      </tbody>
    </table>

    <p class="text-xs" style="color: #64748b;">
      Note: EMI amounts are inclusive of principal and interest. Installments must be paid on or before the due date.
      Late payment may attract penalty charges as per the loan agreement.
    </p>

    <div class="signatures">
      <div class="sig-box">Borrower's Signature</div>
      <div class="sig-box">Branch Manager</div>
    </div>
  `
  printDocument(`Repayment_Schedule_${data.loan_account_no}`, body)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. STATEMENT OF ACCOUNT (SOA)
// ═══════════════════════════════════════════════════════════════════════════════
export function generateSOA(data: SOAData) {
  const scheduleRows = data.schedule.map(r => {
    const statusClass = r.status === 'Paid' ? 'badge-green' : r.status === 'Overdue' ? 'badge-red' : 'badge-slate'
    return `
      <tr>
        <td>${r.installment_no}</td>
        <td>${FDATE(r.due_date)}</td>
        <td>${INR(r.emi_due)}</td>
        <td>${INR(r.paid_amount)}</td>
        <td><span class="badge ${statusClass}">${r.status}</span></td>
        <td>${r.dpd > 0 ? `<span class="badge badge-red">${r.dpd} DPD</span>` : '—'}</td>
      </tr>
    `
  }).join('')

  const txnRows = data.transactions.map(t => {
    const pBreakdown = t.principal_component !== undefined
      ? `P: ${INR(t.principal_component)} | I: ${INR(t.interest_component || 0)}`
      : '—'
    const advTag = (t.advance_component || 0) > 0 ? `<br><span style="color: #1e40af; font-size: 9px;">Adv: +${INR(t.advance_component || 0)}</span>` : ''
    const shortTag = (t.shortage_amount || 0) > 0 ? `<br><span style="color: #b91c1c; font-size: 9px;">Short: ${INR(t.shortage_amount || 0)}</span>` : ''

    return `
      <tr>
        <td>${FDATE(t.txn_date)}</td>
        <td class="left font-mono text-[10px]">${t.txn_id}</td>
        <td class="left font-semibold">${t.classification || 'Payment'}</td>
        <td style="font-weight: 800; color: #15803d;">${INR(t.amount)}</td>
        <td style="font-size: 10px; color: #475569;">${pBreakdown}${advTag}${shortTag}</td>
        <td>${t.mode}</td>
        <td class="left font-mono text-[10px]">${t.reference_no || '-'}</td>
        <td class="left" style="font-size: 10px; color: #334155; max-width: 200px;">${t.narration || '-'}</td>
      </tr>
    `
  }).join('')

  const statusClass = data.status === 'ACTIVE' ? 'badge-green' : data.status?.startsWith('CLOS') ? 'badge-blue' : 'badge-amber'

  const body = `
    <div class="doc-title">STATEMENT OF ACCOUNT (SOA)</div>
    <p style="text-align: right; font-size: 10px; color: #64748b;">
      Generated: <strong>${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
    </p>

    <div class="grid">
      <div class="box">
        <div class="box-title">Borrower Profile</div>
        <div class="row"><span class="label">Name:</span> <span class="value"><strong>${data.member_name}</strong></span></div>
        <div class="row"><span class="label">Customer ID:</span> <span class="value font-mono">${data.customer_id}</span></div>
        <div class="row"><span class="label">Father/Husband:</span> <span class="value">${data.father_husband_name || '-'}</span></div>
        <div class="row"><span class="label">Mobile:</span> <span class="value font-mono">${data.mobile || '-'}</span></div>
        <div class="row"><span class="label">Address:</span> <span class="value">${data.address || '-'}</span></div>
        <div class="row"><span class="label">Branch:</span> <span class="value">${data.branch_code}</span></div>
      </div>
      <div class="box">
        <div class="box-title">Loan Account Summary</div>
        <div class="row"><span class="label">Loan A/C No:</span> <span class="value font-mono"><strong>${data.loan_account_no}</strong></span></div>
        <div class="row"><span class="label">Product:</span> <span class="value">${data.product_type}</span></div>
        <div class="row"><span class="label">Sanctioned:</span> <span class="value">${INR(data.loan_amount)}</span></div>
        <div class="row"><span class="label">Rate:</span> <span class="value">${data.interest_rate}% p.a.</span></div>
        <div class="row"><span class="label">EMI Amount:</span> <span class="value">${INR(data.installment_amount)} × ${data.tenure}</span></div>
        <div class="row"><span class="label">Disbursement:</span> <span class="value">${FDATE(data.disbursement_date)}</span></div>
        <div class="row"><span class="label">Status:</span> <span class="badge ${statusClass}">${data.status}</span></div>
      </div>
    </div>

    <div class="box mb-4" style="background: #eff6ff; border-color: #bfdbfe;">
      <div class="grid" style="margin-bottom: 0;">
        <div>
          <div class="row"><span class="label">Total Loan (P+I):</span> <span class="value">${INR(data.total_loan)}</span></div>
          <div class="row"><span class="label">File Charge:</span> <span class="value">${INR(data.file_charge)}</span></div>
          <div class="row"><span class="label">Advance Wallet Balance:</span> <span class="value" style="color: #1e40af; font-weight: 700;">${INR(data.advance_balance || 0)}</span></div>
        </div>
        <div>
          <div class="row"><span class="label">Total Collected:</span> <span class="value" style="color: #15803d; font-weight: 800;">${INR(data.total_collected)}</span></div>
          <div class="row"><span class="label">Outstanding Principal:</span> <span class="value" style="color: #b91c1c; font-weight: 800;">${INR(data.ledger_balance)}</span></div>
          <div class="row"><span class="label">Overdue Arrears:</span> <span class="value" style="color: ${(data.arrears_balance || 0) > 0 ? '#b91c1c' : '#15803d'}; font-weight: 700;">${INR(data.arrears_balance || 0)}</span></div>
        </div>
      </div>
    </div>

    <div class="section-title">Repayment Schedule Ledger</div>
    <table>
      <thead>
        <tr><th>#</th><th>Due Date</th><th>EMI Due</th><th>Paid</th><th>Status</th><th>DPD</th></tr>
      </thead>
      <tbody>${scheduleRows}</tbody>
    </table>

    ${data.transactions.length > 0 ? `
      <div class="section-title">Transaction & Collection Log</div>
      <table>
        <thead>
          <tr style="font-size: 10px;">
            <th>Date</th>
            <th>Txn ID</th>
            <th>Category</th>
            <th>Amount</th>
            <th>Breakdown</th>
            <th>Mode</th>
            <th>Reference</th>
            <th>Transaction Narration</th>
          </tr>
        </thead>
        <tbody>${txnRows}</tbody>
      </table>
    ` : ''}

    <div class="signatures">
      <div class="sig-box">Borrower's Acknowledgement</div>
      <div class="sig-box">Branch Manager / Authorized Signatory</div>
    </div>
  `
  printDocument(`SOA_${data.loan_account_no}`, body)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. TOP-UP LOAN SANCTION LETTER
// ═══════════════════════════════════════════════════════════════════════════════
export function generateTopUpLetter(data: TopUpLetterData) {
  const body = `
    <div class="doc-title">TOP-UP LOAN SANCTION LETTER</div>
    <p style="font-size: 11px; margin-bottom: 12px;">
      <strong>Ref:</strong> AA2/TU/${data.loan_account_no} &nbsp;|&nbsp;
      <strong>Date:</strong> ${FDATE(data.topup_date)}
    </p>

    <p class="text-sm">Dear <strong>${data.member_name}</strong>,</p>
    <p class="text-sm">We are pleased to inform you that a Top-Up facility has been sanctioned on your existing loan account under the following terms:</p>

    <div class="grid">
      <div class="box">
        <div class="box-title">Borrower Details</div>
        <div class="row"><span class="label">Name:</span> <span class="value">${data.member_name}</span></div>
        <div class="row"><span class="label">Customer ID:</span> <span class="value">${data.customer_id}</span></div>
        <div class="row"><span class="label">Father/Husband:</span> <span class="value">${data.father_husband_name || '-'}</span></div>
        <div class="row"><span class="label">Mobile:</span> <span class="value">${data.mobile || '-'}</span></div>
        <div class="row"><span class="label">Branch:</span> <span class="value">${data.branch_code}</span></div>
      </div>
      <div class="box">
        <div class="box-title">Top-Up Sanction Terms</div>
        <div class="row"><span class="label">Loan Account No:</span> <span class="value">${data.loan_account_no}</span></div>
        <div class="row"><span class="label">Product:</span> <span class="value">${data.product_type}</span></div>
        <div class="row"><span class="label">Original Loan:</span> <span class="value">${INR(data.original_loan_amount)}</span></div>
        <div class="row"><span class="label">Outstanding (Pre Top-Up):</span> <span class="value">${INR(data.outstanding_before_topup)}</span></div>
        <div class="row"><span class="label">Top-Up Amount:</span> <span class="value" style="color: #1e40af;">${INR(data.topup_amount)}</span></div>
        <div class="row"><span class="label">New Total Outstanding:</span> <span class="value" style="color: #b91c1c;">${INR(data.new_total_outstanding)}</span></div>
      </div>
    </div>

    <div class="box mb-4">
      <div class="box-title">Revised Repayment Structure</div>
      <div class="grid" style="margin-bottom: 0;">
        <div>
          <div class="row"><span class="label">Interest Rate:</span> <span class="value">${data.interest_rate}% p.a.</span></div>
          <div class="row"><span class="label">New Tenure:</span> <span class="value">${data.new_tenure} Installments (${data.frequency})</span></div>
        </div>
        <div>
          <div class="row"><span class="label">New EMI Amount:</span> <span class="value">${INR(data.new_installment_amount)}</span></div>
          <div class="row"><span class="label">First EMI Date:</span> <span class="value">${FDATE(data.first_emi_date)}</span></div>
        </div>
      </div>
    </div>

    <p class="text-xs" style="color: #475569; line-height: 1.7;">
      The borrower acknowledges that the existing outstanding balance has been adjusted and the Top-Up amount has been added to create a new repayment schedule. All terms and conditions of the original loan agreement continue to apply.
    </p>

    <div class="signatures">
      <div class="sig-box">Borrower's Signature</div>
      <div class="sig-box">Credit Officer / Branch Manager</div>
      <div class="sig-box">Authorized Signatory</div>
    </div>
  `
  printDocument(`TopUp_Letter_${data.loan_account_no}`, body)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. LOAN RESTRUCTURE AGREEMENT
// ═══════════════════════════════════════════════════════════════════════════════
export function generateRestructureAgreement(data: RestructureAgreementData) {
  const body = `
    <div class="doc-title doc-title-blue">LOAN RESTRUCTURE AGREEMENT</div>
    <p style="font-size: 11px; margin-bottom: 12px;">
      <strong>Ref:</strong> AA2/RST/${data.loan_account_no} &nbsp;|&nbsp;
      <strong>Restructure Date:</strong> ${FDATE(data.restructure_date)}
    </p>

    <p class="text-sm">This agreement is entered into between <strong>AA2 Micro Finance Pvt. Ltd.</strong> ("Lender") and <strong>${data.member_name}</strong> ("Borrower") for the restructuring of the existing loan facility.</p>

    <div class="grid">
      <div class="box">
        <div class="box-title">Borrower Details</div>
        <div class="row"><span class="label">Name:</span> <span class="value">${data.member_name}</span></div>
        <div class="row"><span class="label">Customer ID:</span> <span class="value">${data.customer_id}</span></div>
        <div class="row"><span class="label">Father/Husband:</span> <span class="value">${data.father_husband_name || '-'}</span></div>
        <div class="row"><span class="label">Address:</span> <span class="value">${data.address || '-'}</span></div>
        <div class="row"><span class="label">Branch:</span> <span class="value">${data.branch_code}</span></div>
      </div>
      <div class="box">
        <div class="box-title">Restructure Reason</div>
        <p style="font-size: 11px; color: #475569; margin: 0;">${data.reason || 'Borrower has requested restructuring due to financial hardship / repayment difficulty.'}</p>
      </div>
    </div>

    <div class="section-title">Pre-Restructure vs Post-Restructure Comparison</div>
    <table>
      <thead>
        <tr><th>Parameter</th><th>Before Restructure</th><th>After Restructure</th></tr>
      </thead>
      <tbody>
        <tr><td class="left"><strong>Original Loan Amount</strong></td><td>${INR(data.original_loan_amount)}</td><td>${INR(data.original_loan_amount)}</td></tr>
        <tr><td class="left"><strong>Outstanding Balance</strong></td><td colspan="2" style="text-align: center;">${INR(data.outstanding_at_restructure)}</td></tr>
        <tr><td class="left"><strong>Remaining Tenure</strong></td><td>${data.old_tenure} installments</td><td>${data.new_tenure} installments</td></tr>
        <tr><td class="left"><strong>EMI Amount</strong></td><td>${INR(data.old_installment)}</td><td>${INR(data.new_installment)}</td></tr>
        <tr><td class="left"><strong>Frequency</strong></td><td colspan="2" style="text-align: center;">${data.frequency}</td></tr>
        <tr><td class="left"><strong>First EMI Date (New)</strong></td><td>—</td><td>${FDATE(data.first_emi_date)}</td></tr>
      </tbody>
    </table>

    <p class="text-xs" style="color: #475569; line-height: 1.7;">
      The borrower acknowledges that the outstanding balance as on ${FDATE(data.restructure_date)} has been restructured with revised tenure and EMI as stated above. The borrower commits to making timely payments as per the revised repayment schedule. All other terms and conditions of the original loan agreement remain in effect.
    </p>

    <div class="signatures">
      <div class="sig-box">Borrower's Signature</div>
      <div class="sig-box">Credit Officer / Branch Manager</div>
      <div class="sig-box">Authorized Signatory</div>
    </div>
  `
  printDocument(`Restructure_Agreement_${data.loan_account_no}`, body)
}
