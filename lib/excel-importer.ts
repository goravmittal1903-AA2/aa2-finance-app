import * as xlsx from 'xlsx'
import type { Customer, Loan, ScheduleRow, Transaction } from '@/lib/types'
import { dpdBucket } from '@/lib/utils'
import { computeLoanEconomics, addDays } from '@/lib/calculations'

export interface ParsedExcelData {
  branchName: string
  customers: Partial<Customer>[]
  loans: Partial<Loan>[]
  schedules: Partial<ScheduleRow>[]
  transactions: Partial<Transaction>[]
}

export function parseExcelDate(val: any, fallback = '2026-05-01'): string {
  if (!val) return fallback
  if (val instanceof Date) {
    const d = new Date(val.getTime() + (12 * 3600 * 1000))
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000 + (12 * 3600 * 1000))
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
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

  const monthMap: Record<string, number> = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 }
  const mMatch = s.match(/^(\d{1,2})[\/\s-]([a-zA-Z]{3,4})(?:[\/\s-](\d{2,4}))?$/)
  if (mMatch) {
    const day = mMatch[1].padStart(2, '0')
    const monStr = mMatch[2].toLowerCase().slice(0, 3)
    const month = monthMap[monStr] ? String(monthMap[monStr]).padStart(2, '0') : '05'
    let year = mMatch[3] || '2026'
    if (year.length === 2) year = '20' + year
    return `${year}-${month}-${day}`
  }

  const dt = new Date(s)
  if (!isNaN(dt.getTime())) {
    const d = new Date(dt.getTime() + (12 * 3600 * 1000))
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  return fallback
}

export function parseBranchExcelWorkbook(buffer: ArrayBuffer, fileName: string): ParsedExcelData {
  const wb = xlsx.read(buffer, { type: 'array', cellFormula: true, cellDates: true })
  
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
    const targetSheet = wb.Sheets[mfSheetName]
    // Dynamically detect exact header row index to prevent 1-row offset shift
    const rawGrid = xlsx.utils.sheet_to_json<any[]>(targetSheet, { header: 1 })
    let headerRowIndex = 0
    for (let i = 0; i < Math.min(rawGrid.length, 15); i++) {
      const rowStr = (rawGrid[i] || []).map(c => String(c || '').toUpperCase()).join(' ')
      if (rowStr.includes('MEMBER') || rowStr.includes('LOAN AMOUNT') || rowStr.includes('PL NO') || rowStr.includes('ACCOUNT NO')) {
        headerRowIndex = i
        break
      }
    }
    const rows = xlsx.utils.sheet_to_json<Record<string, any>>(targetSheet, { range: headerRowIndex })

    // Helper to fetch cell values matching keys (case-insensitive & whitespace/symbol agnostic)
    const gv = (r: Record<string, any>, ...keys: string[]): any => {
      for (const k of keys) {
        if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '') return r[k]
      }
      const rKeys = Object.keys(r)
      for (const k of keys) {
        const target = k.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
        const foundKey = rKeys.find(rk => rk.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') === target)
        if (foundKey && r[foundKey] !== undefined && r[foundKey] !== null && String(r[foundKey]).trim() !== '') {
          return r[foundKey]
        }
      }
      return ''
    }

    const gvStr = (r: Record<string, any>, ...keys: string[]): string => {
      const val = gv(r, ...keys)
      return val !== undefined && val !== null ? String(val).trim() : ''
    }

    rows.forEach((r, idx) => {
      const memberName = gvStr(r, 'MEMBER', 'MemberName', 'MEMBER NAME', 'MEMBERS NAME')
      if (!memberName || ['member name', 'membername', 'total', 'grand total', '-'].includes(memberName.toLowerCase())) return

      const loanAmount = Number(gv(r, 'LOAN AMOUNT', 'LOAN  AMOUNT') || 0)
      if (!loanAmount || loanAmount <= 0) return

      // Comprehensive Member Relation (Father / Husband Name) parsing
      const fatherHusband = gvStr(
        r,
        'Father/HUSBAND  Name', 'Father/HUSBAND Name', 'HUSBAND NAME/FATHER NAME',
        'Father/Husband Name', 'FATHER/HUSBAND NAME', 'FATHER/HUSBAND',
        'HUSBAND NAME', 'FATHER NAME', 'RELATION', 'GUARDIAN NAME'
      )

      const mobileRaw = gvStr(r, 'MOBILE NO.', 'MOBILE', 'MOB.', 'MOBILE NAME').replace(/\D/g, '')
      const mobile = mobileRaw.length >= 10 ? mobileRaw.slice(-10) : mobileRaw
      const aadharRaw = gvStr(r, 'ADHAR NO', 'AADHAR NO.', 'AADHAR NO.(LAST 4 DIGITS)', 'AADHAR').replace(/\D/g, '')
      const aadhar_last4 = aadharRaw.slice(-4)

      const branch = (gvStr(r, 'Branch Name', 'BRANCH', 'BRANCH NAME') || branchName).toUpperCase()
      if (branch) branchName = branch

      const bm = gvStr(r, 'BM Name', 'BM NAME', 'AM Name', 'BRANCH MANAGER')
      const fo = gvStr(r, 'FO Name', 'F0 Name', 'STAFF NAME', 'FIELD OFFICER')
      const village = gvStr(r, 'VILLAGE', 'VILLAGE/ CITY', 'VILLAGE NAME')
      const district = gvStr(r, 'Dist.', 'DISTRICT', 'DIST') || 'HARYANA'

      const emi = Number(gv(r, 'EMI AMOUNT', 'EMI', 'MONTHLY EMI') || 0)
      const paidEmiCount = Number(gv(r, 'PAID EMI') || 0)
      const rawTenure = Number(gv(r, 'TOTAL EMI', 'TENURE', 'NO OF EMI', 'NO. OF EMI') || 0)
      const tenure = Math.max(1, rawTenure || paidEmiCount || 12)
      const totalCollected = Number(gv(r, 'TOTAL RECEIVED AMOUNT', 'TOTAL COLLECTED') || (paidEmiCount > 0 && emi > 0 ? paidEmiCount * emi : 0) || 0)
      const ledgerBal = Number(gv(r, 'Ledger Balance', 'LEDGER BALANCE') || Math.max(0, loanAmount - totalCollected))

      // Auto Close loan if ledger balance is 0 or status is CLOSED
      const statusRaw = gvStr(r, 'Case Status', 'Gr. Status', 'Case Status ', 'Gr. Status ').toUpperCase()
      const isClosed = statusRaw.startsWith('CLOS') || ledgerBal <= 0 || (totalCollected >= loanAmount && loanAmount > 0)
      const status = isClosed ? 'CLOSED' : 'ACTIVE'

      const dpd = Number(gv(r, 'DPD') || 0)
      const disbDateRaw = gv(r, 'DIS. DATE', 'DIS DATE', 'DISB DATE', 'CASH DB DATE')
      const disbDate = parseExcelDate(disbDateRaw, '2026-05-01')

      const cashDbDateRaw = gv(r, 'CASH DB DATE', 'CASH DISB DATE', 'DIS. DATE')
      const cashDbDate = cashDbDateRaw ? parseExcelDate(cashDbDateRaw, disbDate) : disbDate

      const firstEmiDateRaw = gv(r, 'FIRST EMI', 'FIRST EMI DATE', '1ST EMI DATE', 'FIRST EMI ')
      const firstEmiDate = parseExcelDate(firstEmiDateRaw, addDays(disbDate, 7))

      const calculatedCloseDate = addDays(firstEmiDate, Math.max(0, tenure - 1) * 7)
      const closeDateRaw = gv(r, 'CLOSE DATE', 'CLOSING DATE')
      const closeDate = closeDateRaw ? parseExcelDate(closeDateRaw) : (isClosed ? new Date().toISOString().slice(0, 10) : calculatedCloseDate)

      const perEmiInt = Number(gv(r, 'PER EMI INTEREST', 'PRE EMI INTEREST', 'PER INTEREST', 'INTEREST PER EMI') || 0)
      const totalInterestRaw = Number(gv(r, 'TOTAL INTEREST') || (perEmiInt > 0 ? perEmiInt * tenure : 0))

      const fileCharge = Number(gv(r, 'FILE CHARGE') || Math.round(loanAmount * 0.02))

      const amName = gvStr(r, 'AM Name', 'AM NAME', 'AREA MANAGER')
      const rmName = gvStr(r, 'RM Name', 'RM NAME', 'REGIONAL MANAGER')
      const rmStatus = gvStr(r, 'RM Status', 'RM STATUS')
      const grStatus = gvStr(r, 'Gr. Status', 'Group Status', 'GR STATUS')
      const clusterNo = gvStr(r, 'clustar no', 'CLUSTER NO', 'CLUSTER')
      const centerNo = gvStr(r, 'center number', 'CENTER NO', 'CENTER NUMBER', 'CENTER')
      const monthStr = gvStr(r, 'MONTH', 'Month')
      const meetingDay = gvStr(r, 'Instalment/Meeting Day', 'MEETING DAY', 'INSTALLMENT DAY', 'Meeting Day', 'DAY')
      const advanceDateRaw = gv(r, 'ADVANCE DATE', 'ADVANCE DISB DATE')
      const advanceDate = advanceDateRaw ? parseExcelDate(advanceDateRaw) : null

      const pendingAmt = Number(gv(r, 'PENDING AMT.', 'PENDING AMOUNT', 'ARREARS') || 0)
      const dueEmiCount = Number(gv(r, 'DUE EMI') || 0)
      const pendingEmiCount = Number(gv(r, 'PENDING EMI') || Math.max(0, tenure - paidEmiCount))
      const shortAmt = Number(gv(r, 'SHORT AMT.', 'SHORT AMOUNT') || 0)
      const advanceBal = Number(gv(r, 'ADVANCE', 'ADVANCE BAL') || 0)
      const penaltyDays = Number(gv(r, 'PENTALITY OF NUMBERS/total days', 'PENALTY DAYS') || 0)
      const penaltyRate = Number(gv(r, 'PER PENTALITY OF AMOUNT', 'PENALTY RATE', 'PER PENALTY AMOUNT') || 0)
      const totalPenalty = Number(gv(r, 'TOTAL AMOUNT OF PENALITY', 'TOTAL PENALTY') || 0)
      const dpdBucketStr = gvStr(r, 'Days_Delinquent Bracket_At Ist', 'DPD BUCKET', 'Days Delinquent Bracket')
      const npaRaw = gvStr(r, 'NPA').toUpperCase()
      const currentBalWithPenalty = Number(gv(r, 'Current Ledger Bal of Gr.+Penalty') || 0)
      const totalMemOutstanding = Number(gv(r, 'Total Mem. Outstanding') || 0)
      const pendingStatusStr = gvStr(r, 'PENDING')

      // 1. Permanent Member ID Format: MEM10001 (MEM + 5 numeric digits)
      const rawMemId = (r['MEMBER ID'] || r['CUST ID'] || r['CUSTOMER ID'] || r['MEM ID'] || r['MEMBER NO'] || '').toString().trim()
      const customerId = (/^MEM\d{5}$/i.test(rawMemId))
        ? rawMemId.toUpperCase()
        : `MEM${String(10001 + idx).padStart(5, '0')}`

      // 2. Permanent Loan Account No Format: 10-digit numeric number ONLY (e.g. 1000000001)
      const rawLoanNo = (r['PL NO.'] || r['PL NO'] || r['LOAN NO'] || r['LOAN ACCOUNT NO'] || r['ACCOUNT NO'] || r['PL.NO.'] || '').toString().replace(/\D/g, '')
      const loanNo = (rawLoanNo.length === 10)
        ? rawLoanNo
        : String(1000000000 + idx + 1)

      // Member Record (Relation & all hierarchy fields updated correctly)
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
          am_name: amName,
          rm_name: rmName,
          cluster_no: clusterNo,
          center_no: centerNo,
          created_at: new Date().toISOString(),
        })
      }

      // Economics calculation using standard 17 formulas (Weekly frequency)
      const econ = computeLoanEconomics({
        loan_amount: loanAmount,
        file_charge: fileCharge,
        interest_rate: 18,
        tenure,
        frequency: 'Weekly',
        installment_amount: emi > 0 ? emi : null,
      })

      // Loan Record (Weekly frequency with all 48 Excel fields)
      loansMap.set(loanNo, {
        loan_account_no: loanNo,
        customer_id: customerId,
        member_name_cache: memberName,
        branch_code: branch,
        fo_name: fo,
        bm_name: bm,
        am_name: amName,
        rm_name: rmName,
        rm_status: rmStatus,
        product_type: 'Microfinance Personal Loan',
        loan_amount: loanAmount,
        file_charge: econ.file_charge,
        net_disbursement: Number(r['FINAL DISBURSEMENT AMT.']) || econ.net_disbursement,
        interest_rate: 18,
        tenure,
        frequency: 'Weekly',
        installment_amount: econ.installment_amount,
        per_installment_interest: perEmiInt > 0 ? perEmiInt : (econ.per_installment_interest || Math.round(econ.total_interest / tenure)),
        per_emi_interest: perEmiInt > 0 ? perEmiInt : Math.round(econ.total_interest / tenure),
        total_interest: totalInterestRaw || econ.total_interest,
        total_loan: econ.total_loan,
        disbursement_date: disbDate,
        cash_db_date: cashDbDate,
        installment_start_date: firstEmiDate,
        status: status as any,
        dpd: isClosed ? 0 : dpd,
        dpd_bucket: isClosed ? 'Current' : (dpdBucketStr || dpdBucket(dpd)),
        // For closed loans, mark total_collected as full loan amount
        total_collected: isClosed ? econ.total_loan : totalCollected,
        ledger_balance: isClosed ? 0 : Math.max(0, ledgerBal),
        close_date: closeDate,
        paid_emi: paidEmiCount,
        pending_emi: pendingEmiCount,
        due_emi: dueEmiCount,
        pending_amount: pendingAmt,
        short_amount: shortAmt,
        advance_balance: advanceBal,
        advance_date: advanceDate,
        meeting_day: meetingDay,
        center_no: centerNo,
        cluster_no: clusterNo,
        month: monthStr,
        penalty_days: penaltyDays,
        penalty_rate: penaltyRate,
        total_penalty: totalPenalty,
        current_bal_with_penalty: currentBalWithPenalty || (isClosed ? 0 : ledgerBal + totalPenalty),
        total_outstanding: totalMemOutstanding || (isClosed ? 0 : ledgerBal),
        gr_status: grStatus,
        pending_status: pendingStatusStr,
        npa_flag: npaRaw === 'YES' || npaRaw === '1' || dpd >= 90,
        created_at: new Date().toISOString(),
      })

      // Target paid transactions for this loan (derived from explicit PAID EMI column or collected total)
      const hasPaidEmiCol = gvStr(r, 'PAID EMI') !== ''
      let targetPaidCount = paidEmiCount
      if (!hasPaidEmiCol && totalCollected > 0 && emi > 0) {
        targetPaidCount = Math.round(totalCollected / emi)
      } else if (!hasPaidEmiCol && isClosed) {
        targetPaidCount = tenure
      }

      // Repayment Schedule Rows (1..tenure, Weekly 7-day frequency)
      const todayStr = new Date().toISOString().slice(0, 10)
      for (let i = 1; i <= tenure; i++) {
        const estDate = addDays(firstEmiDate, (i - 1) * 7)
        const isPaidInstallment = i <= targetPaidCount
        const rowStatus: 'Paid' | 'Pending' | 'Overdue' | 'Partial' = isPaidInstallment
          ? 'Paid'
          : (estDate < todayStr && !isClosed ? 'Overdue' : 'Pending')

        const emiDueRow = econ.installment_amount
        const paidAmount = isPaidInstallment ? (emi > 0 ? emi : emiDueRow) : 0
        const interestDueRow = Math.round((econ.per_installment_interest || (econ.total_interest / tenure)) * 100) / 100
        const principalDueRow = Math.round(Math.max(0, emiDueRow - interestDueRow) * 100) / 100

        schedules.push({
          id: `${loanNo}-${i}`,
          loan_account_no: loanNo,
          installment_no: i,
          due_date: estDate,
          emi_due: emiDueRow,
          principal_due: principalDueRow,
          interest_due: interestDueRow,
          opening_balance: Math.max(0, econ.total_loan - ((i - 1) * emiDueRow)),
          closing_balance: Math.max(0, econ.total_loan - (i * emiDueRow)),
          status: rowStatus,
          paid_amount: paidAmount,
          paid_date: isPaidInstallment ? estDate : null,
          dpd: rowStatus !== 'Overdue' ? 0 : Math.max(0, Math.round((Date.now() - new Date(estDate).getTime()) / 86400000)),
        })

        if (isPaidInstallment) {
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
            created_by: 'excel_import',
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
