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
  transactions: {
    txn_id: string | number
    txn_date: string
    amount: number
    mode: string
    reference_no: string
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
          @page { size: A4; margin: 15mm; }
          * { box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; margin: 0; padding: 15px; font-size: 11px; line-height: 1.5; }
          .page { page-break-after: always; break-after: page; min-height: 950px; position: relative; padding-bottom: 40px; }
          .page:last-child { page-break-after: avoid; break-after: avoid; }
          .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 15px; }
          .header-left { display: flex; align-items: center; gap: 10px; }
          .header-logo { width: 50px; height: 50px; border-radius: 6px; object-fit: contain; }
          .brand-title { font-size: 16px; font-weight: 900; color: #1e3a8a; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }
          .brand-sub { font-size: 9px; color: #64748b; margin: 1px 0 0 0; font-weight: 600; }
          .brand-reg { font-size: 8.5px; color: #475569; margin: 1px 0 0 0; font-weight: 500; }
          .header-right { text-align: right; font-size: 9.5px; color: #475569; line-height: 1.4; }
          .header-right strong { color: #1e293b; }
          .doc-title { font-size: 13px; font-weight: 800; text-align: center; background: linear-gradient(135deg, #eff6ff, #f1f5f9); padding: 7px 10px; border-radius: 6px; border: 1px solid #cbd5e1; margin: 10px 0 15px 0; text-transform: uppercase; letter-spacing: 1.2px; color: #0f172a; }
          .doc-title-blue { background: linear-gradient(135deg, #dbeafe, #eff6ff); border-color: #93c5fd; color: #1e40af; }
          .doc-title-green { background: linear-gradient(135deg, #dcfce7, #f0fdf4); border-color: #86efac; color: #166534; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
          .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 12px; }
          .box { border: 1px solid #e2e8f0; padding: 8px 10px; border-radius: 6px; background: #fafbfc; }
          .box-title { font-size: 9.5px; font-weight: 800; text-transform: uppercase; color: #475569; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin-bottom: 5px; letter-spacing: 0.5px; }
          .row { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 10.5px; }
          .label { color: #64748b; font-weight: 500; }
          .value { font-weight: 700; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 9.5px; }
          th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 5px 6px; text-align: center; font-size: 8.5px; font-weight: 800; color: #334155; text-transform: uppercase; letter-spacing: 0.3px; }
          td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: center; font-size: 9.5px; }
          td.left { text-align: left; }
          tr:nth-child(even) td { background: #f8fafc; }
          .signatures { display: flex; justify-content: space-between; margin-top: 35px; padding-top: 15px; }
          .sig-box { width: 180px; text-align: center; border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 9.5px; font-weight: 700; color: #475569; }
          .footer { position: absolute; bottom: 0; left: 0; right: 0; text-align: center; font-size: 8.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 6px; }
          .badge { display: inline-block; padding: 2px 5px; border-radius: 3px; font-size: 8.5px; font-weight: 800; text-transform: uppercase; }
          .badge-green { background: #dcfce7; color: #15803d; }
          .badge-blue { background: #dbeafe; color: #1e40af; }
          .badge-red { background: #fee2e2; color: #b91c1c; }
          .badge-amber { background: #fef3c7; color: #92400e; }
          .badge-slate { background: #f1f5f9; color: #334155; }
          .amount-big { font-size: 22px; font-weight: 900; color: #15803d; }
          .section-title { font-size: 10.5px; font-weight: 800; color: #1e3a8a; text-transform: uppercase; margin: 12px 0 6px 0; border-bottom: 1px solid #dbeafe; padding-bottom: 3px; letter-spacing: 0.5px; }
          .clause-heading { font-size: 10px; font-weight: 800; color: #0f172a; margin: 8px 0 3px 0; }
          .clause-text { font-size: 9.5px; color: #334155; text-align: justify; line-height: 1.5; margin-bottom: 6px; }
          .page-num { position: absolute; bottom: 0; right: 0; font-size: 8.5px; font-weight: 700; color: #64748b; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        ${bodyHtml}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 400);
          }
        </script>
      </body>
    </html>
  `

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. LOAN SANCTION LETTER & MASTER CREDIT AGREEMENT (12-PAGE MFI SPECIFICATION)
// ═══════════════════════════════════════════════════════════════════════════════
export function generateSanctionLetter(data: SanctionLetterData) {
  const headerHtml = `
    <div class="header">
      <div class="header-left">
        <img src="/brand/aa2-microfinance.png" alt="AA2" class="header-logo" onerror="this.style.display='none'" />
        <img src="/brand/aa2-foundation.jpeg" alt="AA2 Foundation" class="header-logo" style="width:65px;" onerror="this.style.display='none'" />
        <div>
          <h1 class="brand-title">AA2 MICROFINANCE PRIVATE LIMITED</h1>
          <p class="brand-sub">Gorav MF Solution • Registered Microfinance Institution (MFI)</p>
          <p class="brand-reg">CIN: U64990UP2023PTC184704 | PAN: AAYCA9551F | TAN: MRTA20479E</p>
        </div>
      </div>
      <div class="header-right">
        <p style="margin:0;"><strong>Corporate Office:</strong> Shanti Kunj Dehradun Rd, Gagalheri, Saharanpur, UP 247669</p>
        <p style="margin:1px 0 0 0;"><strong>Regd Office:</strong> Opp. Punjab & Sindh Bank, Dehradun Rd, Gagalheri, UP 247669</p>
        <p style="margin:1px 0 0 0;"><strong>Email:</strong> info@aa2finance.com | <strong>Tel:</strong> +91-9761585314</p>
        <p style="margin:1px 0 0 0;"><strong>Web:</strong> www.aa2microfinance.com | aa2mutualhelpfoundation.com</p>
      </div>
    </div>
  `

  const footer = (pageNum: number, totalPages = 12) => `
    <div class="footer">
      <p style="margin:0;">AA2 Microfinance Private Limited • Corporate Office: Saharanpur, UP 247669 • Helpline: +91-9761585314</p>
      <p style="margin:1px 0 0 0;">Confidential & Legally Binding Credit Document • Registered under Companies Act, 2013</p>
      <div class="page-num">Page ${pageNum} of ${totalPages}</div>
    </div>
  `

  const totalInterest = Math.max(0, (data.installment_amount * data.tenure) - data.loan_amount)
  const totalCost = data.loan_amount + totalInterest + data.file_charge
  const apr = (((totalInterest + data.file_charge) / data.loan_amount) / (data.tenure / (data.frequency === 'Weekly' ? 52 : 12)) * 100).toFixed(2)

  let body = ''

  // ───────────────────────────────────────────────────────────────────────────
  // PAGE 1: COVER & KEY FACT STATEMENT (KFS) - PART A
  // ───────────────────────────────────────────────────────────────────────────
  body += `
    <div class="page">
      ${headerHtml}
      <div class="doc-title">SANCTION LETTER & MASTER CREDIT AGREEMENT</div>
      <div style="display:flex; justify-between:space-between; margin-bottom:12px; font-size:10px;">
        <div><strong>Sanction Letter Ref:</strong> AA2/SL/${data.loan_account_no}</div>
        <div><strong>Date of Sanction:</strong> ${FDATE(data.disbursement_date)}</div>
      </div>

      <p class="text-sm">To,<br><strong>${data.member_name}</strong> (Customer ID: <strong>${data.customer_id}</strong>)<br>S/D/W of: <strong>${data.father_husband_name || 'N/A'}</strong><br>Address: ${data.address || 'Gagalheri, Saharanpur, UP 247669'}</p>
      <p class="text-sm">Dear Borrower,</p>
      <p class="clause-text">We are pleased to inform you that <strong>AA2 Microfinance Private Limited</strong> ("Lender") has sanctioned your application for a microfinance credit facility as per the Key Fact Statement (KFS) and terms below:</p>

      <div class="section-title">PART A: KEY FACT STATEMENT (KFS) — RBI DIRECTIVES ALIGNED</div>
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Details & Value</th>
          </tr>
        </thead>
        <tbody>
          <tr><td class="left"><strong>1. Sanctioned Loan Amount</strong></td><td><strong>${INR(data.loan_amount)}</strong></td></tr>
          <tr><td class="left"><strong>2. File Processing Fee (Inclusive of GST)</strong></td><td>${INR(data.file_charge)} (Non-refundable)</td></tr>
          <tr><td class="left"><strong>3. Insurance & Other Upfront Charges</strong></td><td>₹0 (Nil)</td></tr>
          <tr><td class="left"><strong>4. Net Disbursed Amount</strong></td><td><strong>${INR(data.net_disbursement)}</strong></td></tr>
          <tr><td class="left"><strong>5. Total Interest Chargeable</strong></td><td>${INR(totalInterest)}</td></tr>
          <tr><td class="left"><strong>6. Total Repayable Amount (Principal + Interest)</strong></td><td><strong>${INR(data.installment_amount * data.tenure)}</strong></td></tr>
          <tr><td class="left"><strong>7. Flat Interest Rate (% p.a.)</strong></td><td><strong>${data.interest_rate}% p.a.</strong></td></tr>
          <tr><td class="left"><strong>8. Annual Percentage Rate (APR %)</strong></td><td><strong>${apr}% p.a.</strong></td></tr>
          <tr><td class="left"><strong>9. Tenure & Installment Frequency</strong></td><td>${data.tenure} ${data.frequency} Installments</td></tr>
          <tr><td class="left"><strong>10. Installment Amount (EMI)</strong></td><td><strong>${INR(data.installment_amount)}</strong></td></tr>
          <tr><td class="left"><strong>11. First Installment Due Date</strong></td><td>${FDATE(data.installment_start_date)}</td></tr>
          <tr><td class="left"><strong>12. Loan Product Type</strong></td><td>${data.product_type}</td></tr>
        </tbody>
      </table>

      <div class="box mt-4">
        <div class="box-title">Important Microfinance Declaration</div>
        <p class="clause-text" style="margin:0;">This credit facility is extended as a collateral-free microfinance loan in compliance with RBI Directions. The borrower is not subject to any prepayment penalty or hidden charges.</p>
      </div>
      ${footer(1)}
    </div>
  `

  // ───────────────────────────────────────────────────────────────────────────
  // PAGE 2: KEY FACT STATEMENT (KFS) - PART B & SCHEDULE OF CHARGES
  // ───────────────────────────────────────────────────────────────────────────
  body += `
    <div class="page">
      ${headerHtml}
      <div class="doc-title">KEY FACT STATEMENT (KFS) — PART B: CHARGES & GRIEVANCE</div>

      <div class="section-title">SCHEDULE OF PENAL & OTHER CHARGES</div>
      <table>
        <thead>
          <tr><th>Charge Type</th><th>Rate / Amount</th><th>Conditions & Applicability</th></tr>
        </thead>
        <tbody>
          <tr><td class="left"><strong>Overdue Late Payment Fee</strong></td><td>${INR(data.penalty_per_day || 10)} per day</td><td>Applicable on every overdue installment beyond due date</td></tr>
          <tr><td class="left"><strong>Prepayment / Foreclosure Penalty</strong></td><td>₹0 (NIL)</td><td>Zero foreclosure penalty as per RBI MFI directives</td></tr>
          <tr><td class="left"><strong>Cheque / NACH Bounce Charge</strong></td><td>₹250 per bounce</td><td>Charged if bank auto-debit fails due to insufficient balance</td></tr>
          <tr><td class="left"><strong>Legal Recovery Realization Cost</strong></td><td>At actuals</td><td>Applicable only in case of legal recovery proceedings</td></tr>
        </tbody>
      </table>

      <div class="section-title">GRIEVANCE REDRESSAL MECHANISM (RBI ALIGNED)</div>
      <div class="box">
        <p class="clause-text">In case of any queries, grievances, or complaints regarding loan servicing or collection behavior, borrowers may contact our dedicated Grievance Redressal Officer:</p>
        <div class="row"><span class="label">Nodal Grievance Officer:</span> <span class="value">Grievance Redressal Cell, AA2 Microfinance</span></div>
        <div class="row"><span class="label">Office Address:</span> <span class="value">Shanti Kunj Dehradun Road, Gagalheri, Saharanpur, UP 247669</span></div>
        <div class="row"><span class="label">Customer Helpline:</span> <span class="value">+91-9761585314</span></div>
        <div class="row"><span class="label">Email:</span> <span class="value">info@aa2finance.com</span></div>
        <div class="row"><span class="label">RBI Ombudsman Escalation:</span> <span class="value">https://cms.rbi.org.in (If unresolved within 30 days)</span></div>
      </div>
      ${footer(2)}
    </div>
  `

  // ───────────────────────────────────────────────────────────────────────────
  // PAGE 3: BORROWER PROFILE & SANCTION PARTICULARS
  // ───────────────────────────────────────────────────────────────────────────
  body += `
    <div class="page">
      ${headerHtml}
      <div class="doc-title">BORROWER & SANCTION PARTICULARS</div>

      <div class="grid">
        <div class="box">
          <div class="box-title">Borrower Identification</div>
          <div class="row"><span class="label">Full Name:</span> <span class="value">${data.member_name}</span></div>
          <div class="row"><span class="label">Customer ID:</span> <span class="value">${data.customer_id}</span></div>
          <div class="row"><span class="label">Father/Husband Name:</span> <span class="value">${data.father_husband_name || '-'}</span></div>
          <div class="row"><span class="label">Mobile Number:</span> <span class="value">${data.mobile || '-'}</span></div>
          <div class="row"><span class="label">Branch Name:</span> <span class="value">${data.branch_code}</span></div>
        </div>
        <div class="box">
          <div class="box-title">Address & Location</div>
          <div class="row"><span class="label">Village / City:</span> <span class="value">${data.address || 'Gagalheri'}</span></div>
          <div class="row"><span class="label">District:</span> <span class="value">${data.district || 'Saharanpur'}</span></div>
          <div class="row"><span class="label">State:</span> <span class="value">${data.state || 'UTTAR PRADESH'}</span></div>
          <div class="row"><span class="label">Field Officer (FO):</span> <span class="value">${data.fo_name || 'Assigned Officer'}</span></div>
          <div class="row"><span class="label">Branch Manager (BM):</span> <span class="value">${data.bm_name || 'Branch Manager'}</span></div>
        </div>
      </div>

      <div class="box">
        <div class="box-title">Facility Purpose & Disbursement Account</div>
        <div class="row"><span class="label">Stated End-Use Purpose:</span> <span class="value">Income Generation / Micro Enterprise Development</span></div>
        <div class="row"><span class="label">Disbursement Mode:</span> <span class="value">Direct Bank Account Transfer / Authorized NEFT</span></div>
        <div class="row"><span class="label">Sanctioning Authority:</span> <span class="value">Credit Sanction Committee, AA2 Microfinance</span></div>
      </div>
      ${footer(3)}
    </div>
  `

  // ───────────────────────────────────────────────────────────────────────────
  // PAGE 4: MASTER CREDIT AGREEMENT — CLAUSES 1 TO 5
  // ───────────────────────────────────────────────────────────────────────────
  body += `
    <div class="page">
      ${headerHtml}
      <div class="doc-title">MASTER CREDIT AGREEMENT — TERMS (CLAUSES 1–5)</div>

      <div class="clause-heading">1. DEFINITIONS AND INTERPRETATION</div>
      <p class="clause-text">"Loan" means the principal microfinance amount sanctioned under this agreement. "EMI" means the weekly/monthly installment comprising principal and interest components payable on due dates. "Default" means failure to pay any installment on its due date.</p>

      <div class="clause-heading">2. DISBURSEMENT CONDITIONS</div>
      <p class="clause-text">Disbursement is subject to complete execution of documents, KYC verification, household income evaluation as per RBI guidelines, and verification of non-overindebtedness.</p>

      <div class="clause-heading">3. INTEREST CALCULATION METHODOLOGY</div>
      <p class="clause-text">Interest is calculated at the flat annual rate of ${data.interest_rate}% per annum across the sanctioned tenure. The total interest payable is spread equally across all installments.</p>

      <div class="clause-heading">4. REPAYMENT WATERFALL & SCHEDULE</div>
      <p class="clause-text">Payments received from the borrower shall be applied strictly in the following order of priority: (i) Statutory & Legal Fees, (ii) Overdue Penalty Charges, (iii) Interest Overdue, (iv) Principal Overdue.</p>

      <div class="clause-heading">5. ZERO PREPAYMENT PENALTY & FORECLOSURE</div>
      <p class="clause-text">The borrower has the right to prepay or foreclose the loan at any time. No prepayment penalty, foreclosure charge, or termination fee shall be demanded by the Lender.</p>
      ${footer(4)}
    </div>
  `

  // ───────────────────────────────────────────────────────────────────────────
  // PAGE 5: MASTER CREDIT AGREEMENT — CLAUSES 6 TO 10
  // ───────────────────────────────────────────────────────────────────────────
  body += `
    <div class="page">
      ${headerHtml}
      <div class="doc-title">MASTER CREDIT AGREEMENT — COVENANTS (CLAUSES 6–10)</div>

      <div class="clause-heading">6. BORROWER REPRESENTATIONS & WARRANTIES</div>
      <p class="clause-text">The borrower represents that all information, income declarations, and KYC documents submitted are true and correct. Annual household income complies with RBI microfinance limits (under ₹3,00,000 p.a.).</p>

      <div class="clause-heading">7. AFFIRMATIVE COVENANTS</div>
      <p class="clause-text">The borrower covenants to: (a) Utilize funds strictly for income generation/micro-enterprise, (b) Attend center meetings regularly, (c) Inform Lender of any change in residence or contact number within 7 days.</p>

      <div class="clause-heading">8. NEGATIVE COVENANTS</div>
      <p class="clause-text">The borrower agrees not to: (a) Incur indebtedness exceeding RBI microfinance borrowing limits across all lenders, (b) Use loan proceeds for speculative or illegal activities.</p>

      <div class="clause-heading">9. INSPECTION AND AUDIT RIGHTS</div>
      <p class="clause-text">The Lender's officers have the right to inspect enterprise activities, verify asset creation, and audit repayment books during business hours.</p>

      <div class="clause-heading">10. CREDIT BUREAU REPORTING</div>
      <p class="clause-text">The borrower consents to the Lender sharing repayment performance data with credit rating agencies and Credit Information Companies (CIBIL, Equifax, Experian, CRIF High Mark).</p>
      ${footer(5)}
    </div>
  `

  // ───────────────────────────────────────────────────────────────────────────
  // PAGE 6: MASTER CREDIT AGREEMENT — CLAUSES 11 TO 15
  // ───────────────────────────────────────────────────────────────────────────
  body += `
    <div class="page">
      ${headerHtml}
      <div class="doc-title">MASTER CREDIT AGREEMENT — DEFAULT & LEGAL (CLAUSES 11–15)</div>

      <div class="clause-heading">11. EVENTS OF DEFAULT</div>
      <p class="clause-text">Each of the following constitutes an Event of Default: (a) Failure to pay any installment on or before due date, (b) Submission of false KYC or income documents, (c) Insolvency or death of borrower.</p>

      <div class="clause-heading">12. ACCELERATION AND RECOVERY REMEDIES</div>
      <p class="clause-text">Upon an Event of Default, the Lender may declare the entire outstanding loan balance immediately due and payable and initiate lawful recovery proceedings.</p>

      <div class="clause-heading">13. RECOVERY EXPENSES REALIZATION</div>
      <p class="clause-text">All reasonable expenses incurred by the Lender in legal recovery or enforcement of dues shall be recoverable from the borrower.</p>

      <div class="clause-heading">14. RIGHT OF SET-OFF</div>
      <p class="clause-text">The Lender reserves the right to set-off any credits or refunds due to the borrower against overdue loan balances.</p>

      <div class="clause-heading">15. GOVERNING LAW AND JURISDICTION</div>
      <p class="clause-text">This agreement is governed by the laws of India. Courts in Saharanpur / Haridwar shall have exclusive jurisdiction over legal disputes.</p>
      ${footer(6)}
    </div>
  `

  // ───────────────────────────────────────────────────────────────────────────
  // PAGE 7: JOINT LIABILITY GROUP (JLG) CROSS-GUARANTEE CLAUSES 16–18
  // ───────────────────────────────────────────────────────────────────────────
  body += `
    <div class="page">
      ${headerHtml}
      <div class="doc-title">JLG CROSS-GUARANTEE & CENTER RULES (CLAUSES 16–18)</div>

      <div class="clause-heading">16. JOINT AND SEVERAL GROUP GUARANTEE (JLG LOANS)</div>
      <p class="clause-text">For Joint Liability Group (JLG) loans, all group members guarantee repayment of each other's installments jointly and severally. In case a member fails to pay, group members agree to cover the shortfall.</p>

      <div class="clause-heading">17. CENTER MEETING DISCIPLINE</div>
      <p class="clause-text">Group members commit to attending scheduled Center Meetings punctually and abiding by the instructions of the Center Leader and Field Officer.</p>

      <div class="clause-heading">18. CODE OF CONDUCT FOR GROUP MEMBERS</div>
      <p class="clause-text">Members agree to maintain harmony, support peer micro-enterprises, and avoid unauthorized group fund collections.</p>
      ${footer(7)}
    </div>
  `

  // ───────────────────────────────────────────────────────────────────────────
  // PAGE 8: SCHEDULE A — DETAILED REPAYMENT SCHEDULE MATRIX
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
    // Generate synthetic schedule rows if not passed
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
      <table>
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
      ${footer(8)}
    </div>
  `

  // ───────────────────────────────────────────────────────────────────────────
  // PAGE 9: SCHEDULE B — PRODUCT SPECIFIC ANNEXURES & DIGITAL MANDATE
  // ───────────────────────────────────────────────────────────────────────────
  body += `
    <div class="page">
      ${headerHtml}
      <div class="doc-title">SCHEDULE B — PRODUCT ANNEXURE & RECOVERY MANDATE</div>

      <div class="section-title">ANNEXURE B1: PRODUCT SPECIFIC TERMS (${data.product_type})</div>
      <p class="clause-text">The loan facility sanctioned under ${data.product_type} is governed by product rules including tenure limits, interest floor rates, and center meeting guidelines.</p>

      <div class="section-title">ANNEXURE B2: DIGITAL PAYMENT & CASH COLLECTION MANDATE</div>
      <p class="clause-text">The borrower is issued an official printed receipt for every cash collection. Digital payments via UPI, NEFT, and NACH auto-debit are strongly encouraged for speed and security.</p>
      ${footer(9)}
    </div>
  `

  // ───────────────────────────────────────────────────────────────────────────
  // PAGE 10: VERNACULAR BORROWER DECLARATION (ENGLISH & HINDI)
  // ───────────────────────────────────────────────────────────────────────────
  body += `
    <div class="page">
      ${headerHtml}
      <div class="doc-title">VERNACULAR BORROWER DECLARATION / स्थानीय भाषा घोषणा</div>

      <div class="box mt-4">
        <div class="box-title">Declaration in English</div>
        <p class="clause-text">I hereby declare that all terms and conditions of this Sanction Letter and Master Credit Agreement have been read over and explained to me in Hindi/local language. I have fully understood the interest rates, EMI amounts, fee charges, and repayment obligations. I accept the loan facility willingly without any coercion.</p>
      </div>

      <div class="box mt-4" style="background:#fff7ed; border-color:#fed7aa;">
        <div class="box-title" style="color:#c2410c;">हिंदी में घोषणा (Local Language Acknowledgment)</div>
        <p class="clause-text" style="color:#9a3412;">मैं एतद्द्वारा घोषणा करता/करती हूँ कि इस स्वीकृति पत्र एवं ऋण समझौते के सभी नियमों एवं शर्तों को मुझे मेरी स्थानीय भाषा (हिंदी) में पढ़कर सुनाया और समझाया गया है। मैंने ब्याज दर, मासिक/साप्ताहिक किस्त (EMI), शुल्क एवं भुगतान तिथियों को भली-भांति समझ लिया है और मैं इस ऋण स्वीकृति को अपनी स्वेच्छा से स्वीकार करता/करती हूँ।</p>
      </div>
      ${footer(10)}
    </div>
  `

  // ───────────────────────────────────────────────────────────────────────────
  // PAGE 11: EXECUTION & SIGNATURES PAGE
  // ───────────────────────────────────────────────────────────────────────────
  body += `
    <div class="page">
      ${headerHtml}
      <div class="doc-title">EXECUTION AND SIGNATURES PAGE</div>

      <p class="clause-text" style="margin-bottom:25px;">IN WITNESS WHEREOF, the parties hereto have executed this Sanction Letter and Credit Agreement on the date first above written.</p>

      <div class="signatures" style="margin-top:60px;">
        <div class="sig-box">Borrower Signature / Left Thumb Impression<br>(${data.member_name})</div>
        <div class="sig-box">Co-Borrower / Guarantor Signature</div>
        <div class="sig-box">Center Leader Signature</div>
      </div>

      <div class="signatures" style="margin-top:70px;">
        <div class="sig-box">Field Officer (FO) Signature</div>
        <div class="sig-box">Branch Manager (BM) Signature</div>
        <div class="sig-box">For AA2 Microfinance Pvt. Ltd.<br>(Authorized Sanctioning Signatory)</div>
      </div>
      ${footer(11)}
    </div>
  `

  // ───────────────────────────────────────────────────────────────────────────
  // PAGE 12: FAIR PRACTICES CODE & BORROWER RIGHTS CHARTER
  // ───────────────────────────────────────────────────────────────────────────
  body += `
    <div class="page">
      ${headerHtml}
      <div class="doc-title">FAIR PRACTICES CODE & BORROWER RIGHTS CHARTER</div>

      <div class="section-title">AA2 MICROFINANCE FAIR PRACTICES CODE SUMMARY</div>
      <ol style="font-size: 9.5px; color: #334155; padding-left: 16px; line-height: 1.6;">
        <li><strong>No Harassment Policy:</strong> Our staff will treat all borrowers with dignity and respect. Recovery visits are conducted only at designated residential/center meeting places between 07:00 AM and 07:00 PM.</li>
        <li><strong>Transparent Pricing:</strong> No hidden charges, security deposits, or compulsory tie-in insurance products.</li>
        <li><strong>Receipt Guarantee:</strong> An official printed or SMS receipt is generated instantly for every single collection.</li>
        <li><strong>Customer Privacy:</strong> Borrower data is strictly protected as per Indian Privacy Laws and shared only with regulated Credit Bureaus.</li>
      </ol>

      <div class="box mt-4" style="text-align:center; background:#f0fdf4; border-color:#bbf7d0;">
        <div style="font-size:11px; font-weight:800; color:#166534;">CUSTOMER HELPLINE & SUPPORT</div>
        <p style="font-size:10px; color:#15803d; margin:3px 0 0 0;">Phone: +91-9761585314 | Email: info@aa2finance.com</p>
        <p style="font-size:9.5px; color:#166534; margin:2px 0 0 0;">Web: www.aa2microfinance.com | Corporate Office: Gagalheri, Saharanpur, UP 247669</p>
      </div>
      ${footer(12)}
    </div>
  `

  printDocument(`Sanction_Letter_${data.loan_account_no}`, body)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. OFFICIAL REPAYMENT RECEIPT
// ═══════════════════════════════════════════════════════════════════════════════
export function generatePaymentReceipt(data: PaymentReceiptData) {
  const body = `
    <div class="doc-title">OFFICIAL REPAYMENT RECEIPT</div>

    <div class="grid">
      <div class="box">
        <div class="box-title">Receipt Information</div>
        <div class="row"><span class="label">Receipt No:</span> <span class="value">${data.receipt_no}</span></div>
        <div class="row"><span class="label">Payment Date:</span> <span class="value">${FDATE(data.txn_date)}</span></div>
        <div class="row"><span class="label">Payment Mode:</span> <span class="value">${data.mode}</span></div>
        <div class="row"><span class="label">Reference No:</span> <span class="value">${data.reference_no || '-'}</span></div>
        ${data.installment_no ? `<div class="row"><span class="label">Installment No:</span> <span class="value">#${data.installment_no}</span></div>` : ''}
        <div class="row"><span class="label">Entered By:</span> <span class="value">${data.entered_by}</span></div>
      </div>
      <div class="box">
        <div class="box-title">Borrower Details</div>
        <div class="row"><span class="label">Member Name:</span> <span class="value">${data.member_name}</span></div>
        <div class="row"><span class="label">Customer ID:</span> <span class="value">${data.customer_id}</span></div>
        <div class="row"><span class="label">Loan Account No:</span> <span class="value">${data.loan_account_no}</span></div>
        <div class="row"><span class="label">Branch:</span> <span class="value">${data.branch_code}</span></div>
      </div>
    </div>

    <div class="box" style="background: #f0fdf4; border-color: #bbf7d0; text-align: center; padding: 16px; margin-bottom: 16px;">
      <div style="font-size: 10px; text-transform: uppercase; color: #166534; font-weight: 800; letter-spacing: 1px;">Amount Received</div>
      <div class="amount-big" style="margin: 4px 0;">${INR(data.amount)}</div>
      <div style="font-size: 11px; color: #166534;">Remaining Outstanding: <strong>${INR(data.remaining_outstanding)}</strong></div>
    </div>

    ${data.remarks ? `<p style="font-size: 11px; color: #475569;"><strong>Remarks:</strong> ${data.remarks}</p>` : ''}

    <div class="signatures">
      <div class="sig-box">Borrower's Signature</div>
      <div class="sig-box">Authorized Cashier / Officer</div>
    </div>
  `
  printDocument(`Receipt_${data.receipt_no}`, body)
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

  const txnRows = data.transactions.map(t => `
    <tr>
      <td>${FDATE(t.txn_date)}</td>
      <td class="left">${t.txn_id}</td>
      <td>${INR(t.amount)}</td>
      <td>${t.mode}</td>
      <td class="left">${t.reference_no || '-'}</td>
    </tr>
  `).join('')

  const statusClass = data.status === 'ACTIVE' ? 'badge-green' : data.status?.startsWith('CLOS') ? 'badge-blue' : 'badge-amber'

  const body = `
    <div class="doc-title">STATEMENT OF ACCOUNT</div>
    <p style="text-align: right; font-size: 10px; color: #64748b;">
      Generated: <strong>${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
    </p>

    <div class="grid">
      <div class="box">
        <div class="box-title">Borrower Profile</div>
        <div class="row"><span class="label">Name:</span> <span class="value">${data.member_name}</span></div>
        <div class="row"><span class="label">Customer ID:</span> <span class="value">${data.customer_id}</span></div>
        <div class="row"><span class="label">Father/Husband:</span> <span class="value">${data.father_husband_name || '-'}</span></div>
        <div class="row"><span class="label">Mobile:</span> <span class="value">${data.mobile || '-'}</span></div>
        <div class="row"><span class="label">Address:</span> <span class="value">${data.address || '-'}</span></div>
        <div class="row"><span class="label">Branch:</span> <span class="value">${data.branch_code}</span></div>
      </div>
      <div class="box">
        <div class="box-title">Loan Account Summary</div>
        <div class="row"><span class="label">Loan A/C No:</span> <span class="value">${data.loan_account_no}</span></div>
        <div class="row"><span class="label">Product:</span> <span class="value">${data.product_type}</span></div>
        <div class="row"><span class="label">Sanctioned:</span> <span class="value">${INR(data.loan_amount)}</span></div>
        <div class="row"><span class="label">Rate:</span> <span class="value">${data.interest_rate}% p.a.</span></div>
        <div class="row"><span class="label">EMI:</span> <span class="value">${INR(data.installment_amount)} × ${data.tenure}</span></div>
        <div class="row"><span class="label">Disbursement:</span> <span class="value">${FDATE(data.disbursement_date)}</span></div>
        <div class="row"><span class="label">Status:</span> <span class="badge ${statusClass}">${data.status}</span></div>
      </div>
    </div>

    <div class="box mb-4" style="background: #eff6ff; border-color: #bfdbfe;">
      <div class="grid" style="margin-bottom: 0;">
        <div>
          <div class="row"><span class="label">Total Loan (P+I):</span> <span class="value">${INR(data.total_loan)}</span></div>
          <div class="row"><span class="label">File Charge:</span> <span class="value">${INR(data.file_charge)}</span></div>
        </div>
        <div>
          <div class="row"><span class="label">Total Collected:</span> <span class="value" style="color: #15803d;">${INR(data.total_collected)}</span></div>
          <div class="row"><span class="label">Outstanding Balance:</span> <span class="value" style="color: #b91c1c;">${INR(data.ledger_balance)}</span></div>
        </div>
      </div>
    </div>

    <div class="section-title">Repayment Schedule</div>
    <table>
      <thead>
        <tr><th>#</th><th>Due Date</th><th>EMI Due</th><th>Paid</th><th>Status</th><th>DPD</th></tr>
      </thead>
      <tbody>${scheduleRows}</tbody>
    </table>

    ${data.transactions.length > 0 ? `
      <div class="section-title">Transaction History</div>
      <table>
        <thead>
          <tr><th>Date</th><th>Transaction ID</th><th>Amount</th><th>Mode</th><th>Reference</th></tr>
        </thead>
        <tbody>${txnRows}</tbody>
      </table>
    ` : ''}

    <div class="signatures">
      <div class="sig-box">Borrower's Acknowledgement</div>
      <div class="sig-box">Branch Manager</div>
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
