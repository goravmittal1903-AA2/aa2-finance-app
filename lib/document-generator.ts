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
          @page { size: A4; margin: 18mm; }
          * { box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; margin: 0; padding: 20px; font-size: 12px; line-height: 1.5; }
          .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 18px; }
          .header-left { display: flex; align-items: center; gap: 12px; }
          .header-logo { width: 55px; height: 55px; border-radius: 8px; object-fit: contain; }
          .brand-title { font-size: 18px; font-weight: 900; color: #1e3a8a; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }
          .brand-sub { font-size: 10px; color: #64748b; margin: 2px 0 0 0; font-weight: 600; }
          .brand-reg { font-size: 9px; color: #94a3b8; margin: 1px 0 0 0; }
          .header-right { text-align: right; font-size: 10px; color: #64748b; }
          .header-right strong { color: #334155; }
          .doc-title { font-size: 14px; font-weight: 800; text-align: center; background: linear-gradient(135deg, #eff6ff, #f1f5f9); padding: 8px 12px; border-radius: 6px; border: 1px solid #cbd5e1; margin: 12px 0 18px 0; text-transform: uppercase; letter-spacing: 1.5px; color: #0f172a; }
          .doc-title-blue { background: linear-gradient(135deg, #dbeafe, #eff6ff); border-color: #93c5fd; color: #1e40af; }
          .doc-title-green { background: linear-gradient(135deg, #dcfce7, #f0fdf4); border-color: #86efac; color: #166534; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
          .box { border: 1px solid #e2e8f0; padding: 10px 12px; border-radius: 6px; background: #fafbfc; }
          .box-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px; letter-spacing: 0.5px; }
          .row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 11px; }
          .label { color: #64748b; font-weight: 500; }
          .value { font-weight: 700; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10px; }
          th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 5px 6px; text-align: center; font-size: 9px; font-weight: 800; color: #334155; text-transform: uppercase; letter-spacing: 0.3px; }
          td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: center; font-size: 10px; }
          td.left { text-align: left; }
          tr:nth-child(even) td { background: #f8fafc; }
          .signatures { display: flex; justify-content: space-between; margin-top: 50px; padding-top: 18px; }
          .sig-box { width: 200px; text-align: center; border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 10px; font-weight: 700; color: #475569; }
          .footer { text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 30px; }
          .badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 800; text-transform: uppercase; }
          .badge-green { background: #dcfce7; color: #15803d; }
          .badge-blue { background: #dbeafe; color: #1e40af; }
          .badge-red { background: #fee2e2; color: #b91c1c; }
          .badge-amber { background: #fef3c7; color: #92400e; }
          .badge-slate { background: #f1f5f9; color: #334155; }
          .amount-big { font-size: 24px; font-weight: 900; color: #15803d; }
          .section-title { font-size: 11px; font-weight: 800; color: #1e3a8a; text-transform: uppercase; margin: 16px 0 8px 0; border-bottom: 1px solid #dbeafe; padding-bottom: 4px; letter-spacing: 0.5px; }
          .text-sm { font-size: 11px; }
          .text-xs { font-size: 10px; }
          .mt-4 { margin-top: 16px; }
          .mb-4 { margin-bottom: 16px; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .text-bold { font-weight: 700; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            <img src="/brand/aa2-microfinance.png" alt="AA2" class="header-logo" onerror="this.style.display='none'" />
            <div>
              <h1 class="brand-title">AA2 MICRO FINANCE</h1>
              <p class="brand-sub">Gorav MF Solution • Registered MFI</p>
              <p class="brand-reg">CIN: U65100UK2024PTC020XXX</p>
            </div>
          </div>
          <div class="header-right">
            <p style="margin: 0;"><strong>Head Office:</strong> Haridwar, Uttarakhand</p>
            <p style="margin: 2px 0 0 0;"><strong>Helpline:</strong> 1800-AA2-FINANCE</p>
            <p style="margin: 2px 0 0 0;">Date: <strong>${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></p>
          </div>
        </div>
        ${bodyHtml}
        <div class="footer">
          <p style="margin: 0;">This is a computer-generated official document from AA2 Finance Platform. No signature required for digital copies.</p>
          <p style="margin: 3px 0 0 0;">© 2026 AA2 Micro Finance Pvt. Ltd. • Head Office: Haridwar, Uttarakhand • Helpline: 1800-AA2-FINANCE • Powered by Gorav MF Solution</p>
        </div>
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
// 1. LOAN SANCTION LETTER & CREDIT AGREEMENT
// ═══════════════════════════════════════════════════════════════════════════════
export function generateSanctionLetter(data: SanctionLetterData) {
  const body = `
    <div class="doc-title">LOAN SANCTION LETTER & CREDIT AGREEMENT</div>
    <p style="font-size: 12px; margin-bottom: 15px;">
      <strong>Ref:</strong> AA2/SL/${data.loan_account_no} &nbsp;&nbsp;|&nbsp;&nbsp;
      <strong>Date:</strong> ${FDATE(data.disbursement_date)}
    </p>

    <p class="text-sm">Dear <strong>${data.member_name}</strong>,</p>
    <p class="text-sm">We are pleased to inform you that your application for microfinance facility has been sanctioned under the following terms and conditions:</p>

    <div class="grid">
      <div class="box">
        <div class="box-title">Borrower Details</div>
        <div class="row"><span class="label">Member Name:</span> <span class="value">${data.member_name}</span></div>
        <div class="row"><span class="label">Customer ID:</span> <span class="value">${data.customer_id}</span></div>
        <div class="row"><span class="label">Father/Husband:</span> <span class="value">${data.father_husband_name || '-'}</span></div>
        <div class="row"><span class="label">Mobile:</span> <span class="value">${data.mobile || '-'}</span></div>
        <div class="row"><span class="label">Address:</span> <span class="value">${data.address || '-'}</span></div>
        <div class="row"><span class="label">Branch:</span> <span class="value">${data.branch_code}</span></div>
      </div>
      <div class="box">
        <div class="box-title">Loan Sanction Terms</div>
        <div class="row"><span class="label">Loan Account No:</span> <span class="value">${data.loan_account_no}</span></div>
        <div class="row"><span class="label">Product Type:</span> <span class="value">${data.product_type}</span></div>
        <div class="row"><span class="label">Sanctioned Amount:</span> <span class="value">${INR(data.loan_amount)}</span></div>
        <div class="row"><span class="label">File Processing Charge:</span> <span class="value">${INR(data.file_charge)}</span></div>
        <div class="row"><span class="label">Net Disbursement:</span> <span class="value">${INR(data.net_disbursement)}</span></div>
      </div>
    </div>

    <div class="box mb-4">
      <div class="box-title">Repayment Structure</div>
      <div class="grid" style="margin-bottom: 0;">
        <div>
          <div class="row"><span class="label">Interest Rate:</span> <span class="value">${data.interest_rate}% p.a. (Flat)</span></div>
          <div class="row"><span class="label">Tenure:</span> <span class="value">${data.tenure} Installments</span></div>
          <div class="row"><span class="label">Repayment Frequency:</span> <span class="value">${data.frequency}</span></div>
        </div>
        <div>
          <div class="row"><span class="label">EMI Amount:</span> <span class="value">${INR(data.installment_amount)}</span></div>
          <div class="row"><span class="label">Disbursement Date:</span> <span class="value">${FDATE(data.disbursement_date)}</span></div>
          <div class="row"><span class="label">First EMI Due Date:</span> <span class="value">${FDATE(data.installment_start_date)}</span></div>
        </div>
      </div>
    </div>

    <div class="section-title">Terms & Conditions</div>
    <ol style="font-size: 10px; color: #475569; padding-left: 18px; line-height: 1.7;">
      <li>The borrower shall repay the installments on or before the due date as per the repayment schedule.</li>
      <li>Late payment penalty of ${INR(data.penalty_per_day || 0)}/day will be levied on overdue installments.</li>
      <li>The borrower acknowledges that the File Processing Charge of ${INR(data.file_charge)} is non-refundable.</li>
      <li>The loan can be foreclosed at any time by paying the outstanding principal and accrued interest.</li>
      <li>AA2 Micro Finance reserves the right to initiate recovery proceedings in case of default.</li>
    </ol>

    <div style="font-size: 10px; color: #475569; margin-top: 12px; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px; background: #f8fafc;">
      <strong>Declaration & Undertaking:</strong> I hereby acknowledge receipt of the loan sanction terms mentioned above. I agree to repay the installments regularly as per the repayment schedule. I confirm that the details provided are true and correct.
    </div>

    <div class="signatures">
      <div class="sig-box">Borrower's Signature / Thumb Impression</div>
      <div class="sig-box">Credit Officer / Branch Manager</div>
      <div class="sig-box">Authorized Signatory (AA2 Finance)</div>
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
