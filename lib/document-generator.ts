// Document & Certificate Printout Generator for AA2 Finance MFI System

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

/** Opens a browser print window with styled HTML document */
function printDocument(title: string, bodyHtml: string) {
  const printWindow = window.open('', '_blank', 'width=900,height=1000')
  if (!printWindow) {
    alert('Please allow popups to view and print documents.')
    return
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @page { size: A4; margin: 20mm; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; margin: 0; padding: 20px; font-size: 13px; line-height: 1.5; }
          .header { display: flex; align-items: center; justify-content: space-between; border-b: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
          .brand-title { font-size: 20px; font-weight: 800; color: #1e3a8a; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }
          .brand-sub { font-size: 11px; color: #64748b; margin: 2px 0 0 0; }
          .doc-title { font-size: 16px; font-weight: 700; text-align: center; background: #f1f5f9; padding: 8px; border-radius: 6px; border: 1px solid #cbd5e1; margin: 15px 0 25px 0; text-transform: uppercase; letter-spacing: 1px; color: #0f172a; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
          .box { border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; background: #fafafa; }
          .box-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; border-b: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 8px; }
          .row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 12px; }
          .label { color: #64748b; font-weight: 500; }
          .value { font-weight: 700; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px; }
          th { background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; color: #334155; text-transform: uppercase; }
          td { border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 12px; }
          .signatures { display: flex; justify-content: space-between; margin-top: 60px; padding-top: 20px; }
          .sig-box { width: 220px; text-align: center; border-t: 1px solid #94a3b8; padding-top: 6px; font-size: 11px; font-weight: 600; color: #475569; }
          .footer { text-align: center; font-size: 10px; color: #94a3b8; border-t: 1px solid #e2e8f0; padding-top: 15px; margin-top: 40px; }
          .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; background: #dcfce7; color: #15803d; }
          .badge-closed { background: #dbeafe; color: #1e40af; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="brand-title">AA2 MICRO FINANCE</h1>
            <p class="brand-sub">Gorav MF Solution • Registered MFI</p>
          </div>
          <div style="text-align: right;">
            <p style="font-size: 11px; color: #64748b; margin: 0;">Date: <strong>${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></p>
          </div>
        </div>
        ${bodyHtml}
        <div class="footer">
          <p>This is a computer-generated official document from AA2 Finance Platform.</p>
          <p>Head Office: Haridwar • Customer Helpline: 1800-AA2-FINANCE</p>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          }
        </script>
      </body>
    </html>
  `

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}

/** 1. Print Loan Sanction Letter & Agreement */
export function generateSanctionLetter(data: SanctionLetterData) {
  const inr = (v: number) => '₹' + Number(v || 0).toLocaleString('en-IN')
  const body = `
    <div class="doc-title">LOAN SANCTION LETTER & CREDIT AGREEMENT</div>
    <p>Dear <strong>${data.member_name}</strong>,</p>
    <p>We are pleased to inform you that your application for microfinance facility has been sanctioned under the following terms and conditions:</p>
    
    <div class="grid">
      <div class="box">
        <div class="box-title">Borrower Details</div>
        <div class="row"><span class="label">Member Name:</span> <span class="value">${data.member_name}</span></div>
        <div class="row"><span class="label">Customer ID:</span> <span class="value">${data.customer_id}</span></div>
        <div class="row"><span class="label">Father/Husband:</span> <span class="value">${data.father_husband_name || '-'}</span></div>
        <div class="row"><span class="label">Mobile:</span> <span class="value">${data.mobile || '-'}</span></div>
        <div class="row"><span class="label">Branch:</span> <span class="value">${data.branch_code}</span></div>
      </div>
      <div class="box">
        <div class="box-title">Loan Sanction Terms</div>
        <div class="row"><span class="label">Loan Account No:</span> <span class="value">${data.loan_account_no}</span></div>
        <div class="row"><span class="label">Product Type:</span> <span class="value">${data.product_type}</span></div>
        <div class="row"><span class="label">Sanctioned Amount:</span> <span class="value">${inr(data.loan_amount)}</span></div>
        <div class="row"><span class="label">File Processing Charge:</span> <span class="value">${inr(data.file_charge)}</span></div>
        <div class="row"><span class="label">Net Disbursement:</span> <span class="value">${inr(data.net_disbursement)}</span></div>
      </div>
    </div>

    <div class="box" style="margin-bottom: 20px;">
      <div class="box-title">Repayment Structure</div>
      <div class="grid" style="margin-bottom: 0;">
        <div>
          <div class="row"><span class="label">Interest Rate:</span> <span class="value">${data.interest_rate}% p.a.</span></div>
          <div class="row"><span class="label">Tenure:</span> <span class="value">${data.tenure} Installments</span></div>
          <div class="row"><span class="label">Repayment Frequency:</span> <span class="value">${data.frequency}</span></div>
        </div>
        <div>
          <div class="row"><span class="label">Installment Amount (EMI):</span> <span class="value">${inr(data.installment_amount)}</span></div>
          <div class="row"><span class="label">Disbursement Date:</span> <span class="value">${data.disbursement_date}</span></div>
          <div class="row"><span class="label">First EMI Due Date:</span> <span class="value">${data.installment_start_date}</span></div>
        </div>
      </div>
    </div>

    <div style="font-size: 11px; color: #475569; margin-top: 15px;">
      <p><strong>Declaration & Undertaking:</strong> I hereby acknowledge receipt of the loan sanction terms mentioned above. I agree to repay the installments regularly as per the repayment schedule.</p>
    </div>

    <div class="signatures">
      <div class="sig-box">Borrower's Signature / Thumb Impression</div>
      <div class="sig-box">Credit Officer / Branch Manager</div>
    </div>
  `
  printDocument(`Sanction_Letter_${data.loan_account_no}`, body)
}

/** 2. Print Official Loan Repayment Receipt */
export function generatePaymentReceipt(data: PaymentReceiptData) {
  const inr = (v: number) => '₹' + Number(v || 0).toLocaleString('en-IN')
  const body = `
    <div class="doc-title">OFFICIAL REPAYMENT RECEIPT</div>
    
    <div class="grid">
      <div class="box">
        <div class="box-title">Receipt Information</div>
        <div class="row"><span class="label">Receipt No:</span> <span class="value">${data.receipt_no}</span></div>
        <div class="row"><span class="label">Payment Date:</span> <span class="value">${data.txn_date}</span></div>
        <div class="row"><span class="label">Payment Mode:</span> <span class="value">${data.mode}</span></div>
        <div class="row"><span class="label">Reference No:</span> <span class="value">${data.reference_no || '-'}</span></div>
        <div class="row"><span class="label">Entered By:</span> <span class="value">${data.entered_by}</span></div>
      </div>
      <div class="box">
        <div class="box-title">Borrower Details</div>
        <div class="row"><span class="label">Member Name:</span> <span class="value">${data.member_name}</span></div>
        <div class="row"><span class="label">Customer ID:</span> <span class="value">${data.customer_id}</span></div>
        <div class="row"><span class="label">Loan Account No:</span> <span class="value">${data.loan_account_no}</span></div>
        <div class="row"><span class="label">Branch Code:</span> <span class="value">${data.branch_code}</span></div>
      </div>
    </div>

    <div class="box" style="background: #f0fdf4; border-color: #bbf7d0; text-align: center; padding: 20px; margin-bottom: 20px;">
      <div style="font-size: 11px; text-transform: uppercase; color: #166534; font-weight: 700;">Amount Received</div>
      <div style="font-size: 28px; font-weight: 900; color: #15803d; margin: 5px 0;">${inr(data.amount)}</div>
      <div style="font-size: 12px; color: #166534;">Remaining Outstanding Balance: <strong>${inr(data.remaining_outstanding)}</strong></div>
    </div>

    ${data.remarks ? `<p style="font-size: 12px; color: #475569;"><strong>Remarks:</strong> ${data.remarks}</p>` : ''}

    <div class="signatures">
      <div class="sig-box">Borrower's Signature</div>
      <div class="sig-box">Authorized Cashier / Officer</div>
    </div>
  `
  printDocument(`Receipt_${data.receipt_no}`, body)
}

/** 3. Print Foreclosure NOC / Loan Clearance Certificate */
export function generateForeclosureNoc(data: ForeclosureNocData) {
  const inr = (v: number) => '₹' + Number(v || 0).toLocaleString('en-IN')
  const body = `
    <div class="doc-title" style="background: #eff6ff; border-color: #bfdbfe; color: #1e40af;">NO OBJECTION CERTIFICATE & LOAN CLOSURE CERTIFICATE</div>
    
    <div style="text-align: right; font-size: 11px; color: #64748b; margin-bottom: 15px;">
      Certificate No: <strong>${data.certificate_no}</strong> | Issue Date: <strong>${data.issue_date}</strong>
    </div>

    <p style="font-size: 14px; leading: 1.8; margin-bottom: 25px;">
      This is to certify that <strong>${data.member_name}</strong> (Customer ID: <strong>${data.customer_id}</strong>), S/D/W of <strong>${data.father_husband_name || '-'}</strong>, residing at <strong>${data.address || 'Haridwar Branch'}</strong>, has fully settled and repaid all outstanding dues towards Loan Account No: <strong>${data.loan_account_no}</strong>.
    </p>

    <div class="box" style="margin-bottom: 25px;">
      <div class="box-title">Settled Loan Details</div>
      <div class="grid" style="margin-bottom: 0;">
        <div>
          <div class="row"><span class="label">Sanctioned Amount:</span> <span class="value">${inr(data.loan_amount)}</span></div>
          <div class="row"><span class="label">Disbursement Date:</span> <span class="value">${data.disbursement_date}</span></div>
          <div class="row"><span class="label">Branch:</span> <span class="value">${data.branch_code}</span></div>
        </div>
        <div>
          <div class="row"><span class="label">Total Amount Paid:</span> <span class="value">${inr(data.total_paid)}</span></div>
          <div class="row"><span class="label">Closure Date:</span> <span class="value">${data.close_date}</span></div>
          <div class="row"><span class="label">Final Status:</span> <span class="badge badge-closed">CLOSED / SETTLED</span></div>
        </div>
      </div>
    </div>

    <p style="font-size: 12px; color: #334155; line-height: 1.6;">
      AA2 Micro Finance confirms that there are no remaining dues, claims, or liabilities pending against the borrower for this loan account. This certificate is issued upon full loan foreclosure/closure.
    </p>

    <div class="signatures" style="margin-top: 80px;">
      <div class="sig-box">Branch Manager</div>
      <div class="sig-box">Authorized Signatory (AA2 Finance)</div>
    </div>
  `
  printDocument(`NOC_${data.loan_account_no}`, body)
}
