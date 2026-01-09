const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://giuiknvmpvhuvcybklbh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpdWlrbnZtcHZodXZjeWJrbGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDg0MTgyMiwiZXhwIjoyMDgwNDE3ODIyfQ.52VqUnTMe1fWuNRbwCS6F8ybaPBBenhNsHCHwUhcTl4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    try {
        const { data, error } = await supabase.from('vouchers').select('*').limit(1);
        if (error) {
            console.log('Error selecting from vouchers:', error.message);
        } else if (data && data.length > 0) {
            console.log('Voucher columns:', Object.keys(data[0]).join(', '));
        } else {
            console.log('No vouchers found to check columns.');
        }

        const { data: entries, error: entriesError } = await supabase.from('voucher_entries').select('*').limit(1);
        if (entriesError) {
            console.log('Error selecting from voucher_entries:', entriesError.message);
        } else if (entries && entries.length > 0) {
            console.log('Voucher entries columns:', Object.keys(entries[0]).join(', '));
        }
    } catch (err) {
        console.log('Exception:', err.message);
    }
}

check();
