const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://eslqcwvaulnuewglptyx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzbHFjd3ZhdWxudWV3Z2xwdHl4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjkwNTY0OSwiZXhwIjoyMDk4NDgxNjQ5fQ.UwFyWcb9OZtv_TnpTN4DT-geo7vIJKgmxzNIG4uxjQI';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

function excelToDate(val, fallback = '2026-06-01') {
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return fallback;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function uploadInChunks(tableName, items, chunkSize = 50) {
  console.log(`Uploading ${items.length} items to table '${tableName}'...`);
  let inserted = 0;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error } = await supabase.from(tableName).upsert(chunk);
      if (!error) {
        success = true;
        inserted += chunk.length;
        break;
      }
      console.warn(`  [${tableName}] Attempt ${attempt} failed: ${error.message}`);
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!success) {
      console.error(`❌ [${tableName}] Failed inserting chunk ${i} to ${i + chunk.length}`);
    }
    await new Promise(r => setTimeout(r, 50));
  }
  console.log(`✅ Finished '${tableName}': ${inserted}/${items.length} records saved.`);
}

function parseBranchSheet(filename, sheetName) {
  const wb = xlsx.readFile(filename);
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  const rows = xlsx.utils.sheet_to_json(sheet, { range: 1 });
  
  const parsed = [];
  rows.forEach((r) => {
    const memberName = (r['MEMBER'] || r['MemberName'] || r['MEMBER NAME'] || r['MEMBERS NAME'] || '').toString().trim();
    if (!memberName || memberName.toLowerCase() === 'member name' || memberName.toLowerCase() === 'membername') return;
    
    const amount = Number(r['LOAN AMOUNT'] || r['LOAN  AMOUNT'] || 0);
    if (!amount) return;

    const fatherHusband = (r['Father/HUSBAND  Name'] || r['Father/HUSBAND Name'] || r['HUSBAND NAME/FATHER NAME'] || r['Father/Husband Name'] || '').toString().trim();
    const mobileRaw = (r['MOBILE NO.'] || r['MOBILE'] || r['MOB.'] || r['MOBILE NAME '] || '').toString().replace(/\D/g, '');
    const mobile = mobileRaw.length >= 10 ? mobileRaw.slice(-10) : mobileRaw;
    const aadharRaw = (r['ADHAR NO'] || r['AADHAR NO.(LAST 4 DIGITS)'] || '').toString().replace(/\D/g, '');
    const aadhar_last4 = aadharRaw.slice(-4);
    
    const branch = (r['Branch Name'] || filename.replace('.xlsx','')).toString().trim().toUpperCase();
    const bm = (r['BM Name'] || r['AM Name'] || '').toString().trim();
    const fo = (r['FO Name'] || r['F0 Name'] || r['STAFF NAME'] || '').toString().trim();
    const village = (r['VILLAGE'] || r['VILLAGE/ CITY'] || r['VILLAGE NAME'] || '').toString().trim();
    const district = (r['Dist.'] || r['DISTRICT'] || (branch === 'PATAUDI' ? 'HARYANA' : 'UTTARAKHAND')).toString().trim();
    
    const emi = Number(r['EMI AMOUNT'] || r['EMI'] || r['MONTHLY EMI'] || 0);
    const tenure = Number(r['TOTAL EMI'] || 12);
    const paidEmiCount = Number(r['PAID EMI'] || 0);
    const totalCollected = Number(r['TOTAL RECEIVED AMOUNT'] || (paidEmiCount * emi) || 0);
    const ledgerBal = Number(r['Ledger Balance'] || Math.max(0, (amount - totalCollected)));
    const statusRaw = (r['Case Status '] || r['Case Status'] || r['Gr. Status'] || 'ACTIVE').toString().trim().toUpperCase();
    const status = statusRaw.startsWith('CLOS') ? 'CLOSE' : 'ACTIVE';
    const dpd = Number(r['DPD'] || 0);
    const disbDate = excelToDate(r['DIS. DATE'] || r['DIS.DATE'] || r['DISB DATE'] || r['CASH DB DATE'], '2026-05-01');
    const firstEmiDate = excelToDate(r['FIRST EMI '] || r['FIRST EMI DATE'] || r['FIRST EMI'], '2026-05-15');
    const closeDate = r['CLOSE DATE'] ? excelToDate(r['CLOSE DATE']) : null;
    const fileCharge = Number(r['FILE CHARGE'] || 0);

    parsed.push({
      branch,
      memberName,
      fatherHusband,
      mobile,
      aadhar_last4,
      village,
      district,
      bm,
      fo,
      amount,
      fileCharge,
      emi,
      tenure,
      paidEmiCount,
      totalCollected,
      ledgerBal,
      status,
      dpd,
      disbDate,
      firstEmiDate,
      closeDate
    });
  });
  return parsed;
}

async function runImport() {
  console.log('🚀 Starting System Data Clean & Official Excel Import...');

  // Step 1: Parse all 3 files
  const haridwar = parseBranchSheet('Haridwar.xlsx', 'HARIDWAR');
  const khatauli = parseBranchSheet('KHATAULI.xlsx', 'KHATAULI');
  const pataudi = parseBranchSheet('PATAUDI.xlsx', 'PATAUDI M.F');
  
  const allRecords = [...haridwar, ...khatauli, ...pataudi];
  console.log(`Parsed ${allRecords.length} records (${haridwar.length} Haridwar, ${khatauli.length} Khatauli, ${pataudi.length} Pataudi).`);

  // Step 2: Clear existing test data from Supabase tables
  console.log('🧹 Wiping existing test data from Supabase...');
  const tablesToClear = ['customers', 'loans', 'repayment_schedule', 'transactions', 'documents', 'loan_documents', 'grievances', 'trash'];
  for (const tbl of tablesToClear) {
    const { error } = await supabase.from(tbl).delete().neq('id', '___non_existent_id___');
    if (error) console.warn(`Warning clearing ${tbl}:`, error.message);
  }
  console.log('✅ Existing test data cleared.');

  // Step 3: Seed Customers, Loans, Repayment Schedules & Payment Transactions
  console.log('🌱 Preparing official members and sanctioned loans payload...');

  const customerPayloads = [];
  const loanPayloads = [];
  const schedulePayloads = [];
  const txnPayloads = [];

  let memberCounter = 10001;
  let loanCounter = 1000000001;

  for (let i = 0; i < allRecords.length; i++) {
    const rec = allRecords[i];
    const customerId = `MEM${memberCounter++}`;
    const loanAccNo = String(loanCounter++);

    const now = new Date().toISOString();
    const state = rec.branch === 'PATAUDI' ? 'HARYANA' : 'UTTARAKHAND';
    const pct = rec.amount > 0 ? (rec.fileCharge / rec.amount) * 100 : 0;
    const netDisb = rec.amount - rec.fileCharge;
    const totalLoan = rec.emi * rec.tenure;
    const totalInterest = Math.max(0, totalLoan - rec.amount);
    const perInstInterest = Math.round((totalInterest / rec.tenure) * 100) / 100;

    // Customer
    const custData = {
      customer_id: customerId,
      full_name: rec.memberName,
      father_husband_name: rec.fatherHusband,
      gender: 'Female',
      dob: '1990-01-01',
      mobile: rec.mobile,
      aadhar_last4: rec.aadhar_last4,
      village_city: rec.village,
      district: rec.district,
      state: state,
      branch_code: rec.branch,
      bm_name: rec.bm,
      fo_name: rec.fo,
      address_current: `${rec.village}, ${rec.district}, ${state}`,
      created_at: rec.disbDate + 'T00:00:00.000Z',
      created_by: 'Management@aa2finance.com',
      updated_at: now,
      updated_by: 'Management@aa2finance.com',
    };
    customerPayloads.push({ id: customerId, data: custData });

    // Loan
    const loanData = {
      loan_account_no: loanAccNo,
      customer_id: customerId,
      member_name_cache: rec.memberName,
      member_name: rec.memberName,
      branch_code: rec.branch,
      fo_name: rec.fo,
      bm_name: rec.bm,
      state: state,
      district: rec.district,
      case_id: `PL-${i + 1}`,
      product_type: 'Individual Loan (IL)',
      frequency: rec.tenure >= 24 ? 'Weekly' : 'Monthly',
      loan_amount: rec.amount,
      file_charge: rec.fileCharge,
      file_charge_pct: Number(pct.toFixed(2)),
      net_disbursement: netDisb,
      interest_rate: 24,
      tenure: rec.tenure,
      installment_amount: rec.emi,
      total_interest: totalInterest,
      total_loan: totalLoan,
      per_installment_interest: perInstInterest,
      disbursement_date: rec.disbDate,
      installment_start_date: rec.firstEmiDate,
      penalty_per_day: 0,
      repayment_mode: 'Cash Collection',
      status: rec.status,
      disbursed: true,
      close_date: rec.closeDate,
      closure_amount: rec.status === 'CLOSE' ? totalLoan : null,
      closure_type: rec.status === 'CLOSE' ? 'FULL_REPAYMENT' : null,
      imported: true,
      total_collected: rec.status === 'CLOSE' ? totalLoan : rec.totalCollected,
      ledger_balance: rec.status === 'CLOSE' ? 0 : rec.ledgerBal,
      npa_flag: rec.dpd >= 90,
      dpd: rec.dpd,
      dpd_bucket: rec.dpd >= 90 ? '90+ (NPA)' : rec.dpd >= 30 ? '31–60 DPD' : rec.dpd > 0 ? '1–30 DPD' : 'Current',
      created_at: rec.disbDate + 'T00:00:00.000Z',
      created_by: 'Management@aa2finance.com',
      updated_at: now,
      updated_by: 'Management@aa2finance.com',
    };
    loanPayloads.push({ id: loanAccNo, data: loanData });

    // Schedule Rows & Transactions
    let opening = totalLoan;
    let dueDate = rec.firstEmiDate;
    const isClosed = rec.status === 'CLOSE';
    const paidCount = isClosed ? rec.tenure : Math.min(rec.tenure, rec.paidEmiCount);

    for (let instNo = 1; instNo <= rec.tenure; instNo++) {
      const isPaid = instNo <= paidCount;
      const paidAmt = isPaid ? rec.emi : 0;
      const closing = Math.max(0, opening - rec.emi);
      const isOverdue = !isPaid && dueDate < '2026-08-17';

      const schedRow = {
        id: `${loanAccNo}_${instNo}`,
        loan_account_no: loanAccNo,
        installment_no: instNo,
        due_date: dueDate,
        opening_balance: opening,
        principal_due: rec.emi - perInstInterest,
        interest_due: perInstInterest,
        emi_due: rec.emi,
        closing_balance: closing,
        paid_amount: paidAmt,
        paid_date: isPaid ? dueDate : null,
        status: isPaid ? 'Paid' : isOverdue ? 'Overdue' : 'Pending',
        dpd: isOverdue ? rec.dpd || 15 : 0,
      };
      schedulePayloads.push({ id: schedRow.id, data: schedRow });

      if (isPaid) {
        const txnId = Date.now() + i * 1000 + instNo;
        const txnData = {
          txn_id: txnId,
          loan_account_no: loanAccNo,
          amount: rec.emi,
          txn_date: dueDate,
          mode: 'Cash',
          reference_no: `EMIPAY-${loanAccNo}-${instNo}`,
          remarks: `EMI Installment #${instNo} collection`,
          installment_no: instNo,
          txn_type: 'PAYMENT',
          classification: 'EMI Payment',
          created_at: dueDate + 'T10:00:00.000Z',
          entered_by: 'Management@aa2finance.com',
          voided: false,
        };
        txnPayloads.push({ id: String(txnId), data: txnData });
      }

      opening = closing;
      dueDate = addDays(dueDate, 7); // weekly step
    }
  }

  // Step 4: Batch Upsert
  await uploadInChunks('customers', customerPayloads, 50);
  await uploadInChunks('loans', loanPayloads, 50);
  await uploadInChunks('repayment_schedule', schedulePayloads, 50);
  await uploadInChunks('transactions', txnPayloads, 50);

  console.log('🎉 OFFICIAL EXCEL IMPORT COMPLETE!');
  console.log(`Summary:\n - Members Onboarded: ${customerPayloads.length}\n - Loans Sanctioned: ${loanPayloads.length}\n - Schedule Installments: ${schedulePayloads.length}\n - Payment Transactions: ${txnPayloads.length}`);
}

runImport().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
