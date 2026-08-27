import * as xlsx from 'xlsx'
import type { Customer, Loan, ScheduleRow, Transaction } from '@/lib/types'
import { dpdBucket } from '@/lib/utils'
import { computeLoanEconomics } from '@/lib/calculations'

export interface ParsedExcelData {
  branchName: string
  customers: Partial<Customer>[]
  loans: Partial<Loan>[]
  schedules: Partial<ScheduleRow>[]
  transactions: Partial<Transaction>[]
}

export function parseExcelDate(val: any, fallback = '2026-05-01'): string {
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000)
    return d.toISOString().slice(0, 10)
  }
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  const s = String(val || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(s)) {
    const parts = s.split(/[\/-]/)
    if (parts.length === 3) {
      let [d, m, y] = parts
      if (y.length === 2) y = '20' + y
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
  }
  return fallback
}

export function parseBranchExcelWorkbook(buffer: ArrayBuffer, fileName: string): ParsedExcelData {
  const wb = xlsx.read(buffer, { type: 'array', cellFormula: true })
  
  let branchName = fileName.replace(/\.[^/.]+$/, '').replace(/_|\d+/g, ' ').trim().toUpperCase() || 'PATAUDI'

  const customersMap = new Map<string, Partial<Customer>>()
  const loansMap = new Map<string, Partial<Loan>>()
  const schedules: Partial<ScheduleRow>[] = []
  const transactions: Partial<Transaction>[] = []

  // Find portfolio/MF sheet
  const mfSheetName = wb.SheetNames.find(s => 
    s.toUpperCase().includes('M.F') || 
    s.toUpperCase().includes('MF') || 
    s.toUpperCase() === 'KHATAULI' || 
    s.toUpperCase() === 'HARIDWAR' ||
    s.toUpperCase() === 'PATAUDI'
  ) || wb.SheetNames[0]

  if (mfSheetName && wb.Sheets[mfSheetName]) {
    const rows = xlsx.utils.sheet_to_json<Record<string, any>>(wb.Sheets[mfSheetName], { range: 1 })

    rows.forEach((r, idx) => {
      const memberName = (r['MEMBER'] || r['MemberName'] || r['MEMBER NAME'] || r['MEMBERS NAME'] || '').toString().trim()
      if (!memberName || memberName.toLowerCase() === 'member name' || memberName.toLowerCase() === 'membername') return

      const loanAmount = Number(r['LOAN AMOUNT'] || r['LOAN  AMOUNT'] || 0)
      if (!loanAmount) return

      const fatherHusband = (r['Father/HUSBAND  Name'] || r['Father/HUSBAND Name'] || r['HUSBAND NAME/FATHER NAME'] || r['Father/Husband Name'] || '').toString().trim()
      const mobileRaw = (r['MOBILE NO.'] || r['MOBILE'] || r['MOB.'] || r['MOBILE NAME '] || '').toString().replace(/\D/g, '')
      const mobile = mobileRaw.length >= 10 ? mobileRaw.slice(-10) : mobileRaw
      const aadharRaw = (r['ADHAR NO'] || r['AADHAR NO.(LAST 4 DIGITS)'] || '').toString().replace(/\D/g, '')
      const aadhar_last4 = aadharRaw.slice(-4)

      const branch = (r['Branch Name'] || branchName).toString().trim().toUpperCase()
      if (branch) branchName = branch

      const bm = (r['BM Name'] || r['AM Name'] || '').toString().trim()
      const fo = (r['FO Name'] || r['F0 Name'] || r['STAFF NAME'] || '').toString().trim()
      const village = (r['VILLAGE'] || r['VILLAGE/ CITY'] || r['VILLAGE NAME'] || '').toString().trim()
      const district = (r['Dist.'] || r['DISTRICT'] || 'HARYANA').toString().trim()

      const emi = Number(r['EMI AMOUNT'] || r['EMI'] || r['MONTHLY EMI'] || 0)
      const tenure = Number(r['TOTAL EMI'] || 12)
      const paidEmiCount = Number(r['PAID EMI'] || 0)
      const totalCollected = Number(r['TOTAL RECEIVED AMOUNT'] || (paidEmiCount * emi) || 0)
      const ledgerBal = Number(r['Ledger Balance'] || Math.max(0, (loanAmount - totalCollected)))
      const statusRaw = (r['Case Status '] || r['Case Status'] || r['Gr. Status'] || 'ACTIVE').toString().trim().toUpperCase()
      const status = statusRaw.startsWith('CLOS') ? 'CLOSE' : 'ACTIVE'
      const dpd = Number(r['DPD'] || 0)
      const disbDate = parseExcelDate(r['DIS. DATE'] || r['DIS.DATE'] || r['DISB DATE'] || r['CASH DB DATE'], '2026-05-01')
      const firstEmiDate = parseExcelDate(r['FIRST EMI '] || r['FIRST EMI DATE'] || r['FIRST EMI'], '2026-05-15')
      const closeDate = r['CLOSE DATE'] ? parseExcelDate(r['CLOSE DATE']) : null
      const fileCharge = Number(r['FILE CHARGE'] || Math.round(loanAmount * 0.02))

      const customerId = mobile ? `CUST-${branch.slice(0,3)}-${mobile.slice(-6)}` : `CUST-${branch.slice(0,3)}-${(idx+1).toString().padStart(4, '0')}`
      const loanNo = `LN-${branch.slice(0,3)}-${(idx+1).toString().padStart(4, '0')}`

      // Member Record
      if (!customersMap.has(customerId)) {
        customersMap.set(customerId, {
          customer_id: customerId,
          full_name: memberName,
          father_husband_name: fatherHusband,
          mobile,
          aadhar_last4,
          village_city: village,
          district,
          branch_code: branch,
          bm_name: bm,
          fo_name: fo,
          created_at: new Date().toISOString(),
        })
      }

      // Economics calculation using standard 17 formulas
      const econ = computeLoanEconomics({
        loan_amount: loanAmount,
        file_charge: fileCharge,
        interest_rate: 18,
        tenure,
        frequency: 'Monthly',
        installment_amount: emi > 0 ? emi : null,
      })

      // Loan Record
      loansMap.set(loanNo, {
        loan_account_no: loanNo,
        customer_id: customerId,
        member_name_cache: memberName,
        branch_code: branch,
        fo_name: fo,
        product_type: 'Microfinance Personal Loan',
        loan_amount: loanAmount,
        file_charge: fileCharge,
        net_disbursement: econ.net_disbursement,
        interest_rate: 18,
        tenure,
        frequency: 'Monthly',
        installment_amount: econ.installment_amount,
        total_interest: econ.total_interest,
        total_loan: econ.total_loan,
        disbursement_date: disbDate,
        installment_start_date: firstEmiDate,
        status: status === 'CLOSE' ? 'CLOSED' : 'ACTIVE',
        dpd,
        dpd_bucket: dpdBucket(dpd),
        total_collected: totalCollected,
        ledger_balance: ledgerBal,
        close_date: closeDate || null,
        created_at: new Date().toISOString(),
      })

      // Repayment Schedule Rows (1..tenure)
      let cumulativePaid = totalCollected
      for (let i = 1; i <= tenure; i++) {
        const estDate = parseExcelDate(r[`EMI_${i}_DATE`] || addMonths(firstEmiDate, i - 1))
        let rowStatus: 'Paid' | 'Pending' | 'Overdue' | 'Partial' = 'Pending'
        let paidAmount = 0

        if (cumulativePaid >= econ.installment_amount) {
          rowStatus = 'Paid'
          paidAmount = econ.installment_amount
          cumulativePaid -= econ.installment_amount
        } else if (cumulativePaid > 0) {
          rowStatus = 'Partial'
          paidAmount = cumulativePaid
          cumulativePaid = 0
        } else if (new Date(estDate) < new Date() && status !== 'CLOSE') {
          rowStatus = 'Overdue'
        }

        schedules.push({
          id: `${loanNo}-${i}`,
          loan_account_no: loanNo,
          installment_no: i,
          due_date: estDate,
          emi_due: econ.installment_amount,
          principal_due: Math.round(loanAmount / tenure),
          interest_due: Math.round(econ.total_interest / tenure),
          opening_balance: Math.max(0, econ.total_loan - ((i - 1) * econ.installment_amount)),
          closing_balance: Math.max(0, econ.total_loan - (i * econ.installment_amount)),
          status: rowStatus,
          paid_amount: paidAmount,
          paid_date: rowStatus === 'Paid' ? estDate : null,
          dpd: rowStatus === 'Overdue' ? Math.max(0, Math.round((Date.now() - new Date(estDate).getTime()) / 86400000)) : 0,
        })

        // Transaction log for paid EMIs
        if (paidAmount > 0) {
          transactions.push({
            txn_id: `TXN-${loanNo}-${i}` as any,
            loan_account_no: loanNo,
            txn_date: estDate,
            txn_type: 'PAYMENT',
            amount: paidAmount,
            mode: 'Cash',
            reference_no: `COLLECT-${loanNo}-${i}`,
            classification: 'REGULAR',
            installment_no: i,
            remarks: `EMI ${i} collection import`,
            entered_by: fo || 'System Import',
            voided: false,
            created_at: new Date().toISOString(),
          })
        }
      }
    })
  }

  return {
    branchName,
    customers: Array.from(customersMap.values()),
    loans: Array.from(loansMap.values()),
    schedules,
    transactions,
  }
}

function addMonths(dateStr: string, months: number): string {
  const parts = dateStr.slice(0, 10).split('-').map(Number)
  if (parts.length < 3 || parts.some(isNaN)) return dateStr
  const [y, m, d] = parts
  const dt = new Date(Date.UTC(y, m - 1 + months, d))
  return dt.toISOString().slice(0, 10)
}
