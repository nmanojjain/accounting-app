const { createClient } = require('@supabase/supabase-js');
// dotenv removed

const supabaseUrl = 'https://giuiknvmpvhuvcybklbh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpdWlrbnZtcHZodXZjeWJrbGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDg0MTgyMiwiZXhwIjoyMDgwNDE3ODIyfQ.52VqUnTMe1fWuNRbwCS6F8ybaPBBenhNsHCHwUhcTl4';

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function findCompany() {
    const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .ilike('name', '%Metro%');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Companies found:', data);
    }
}

findCompany();
