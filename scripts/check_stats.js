const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://giuiknvmpvhuvcybklbh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpdWlrbnZtcHZodXZjeWJrbGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDg0MTgyMiwiZXhwIjoyMDgwNDE3ODIyfQ.52VqUnTMe1fWuNRbwCS6F8ybaPBBenhNsHCHwUhcTl4';

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStats() {
    const companyId = '77a1e0a2-6a24-4d32-9057-8f983105eabc';

    const { count: ledgerCount, error: lError } = await supabase
        .from('ledgers')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId);

    const { count: voucherCount, error: vError } = await supabase
        .from('vouchers')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId);

    if (lError) console.error('Ledger Error:', lError);
    if (vError) console.error('Voucher Error:', vError);

    console.log('--- Migration Stats ---');
    console.log(`Company ID: ${companyId}`);
    console.log(`Ledgers: ${ledgerCount}`);
    console.log(`Vouchers: ${voucherCount}`);
}

checkStats();
