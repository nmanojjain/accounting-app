const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.resolve(__dirname, '../.env.local');
const envConfig = fs.readFileSync(envPath, 'utf8').split('\n').reduce((acc, line) => {
    const [key, value] = line.split('=');
    if (key && value) acc[key.trim()] = value.trim();
    return acc;
}, {});

const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY);

async function fixBalance() {
    // 1. Get the ledger
    const { data: ledgers } = await supabase
        .from('ledgers')
        .select('*')
        .ilike('name', '%Cash with Ravi%');

    if (!ledgers || ledgers.length === 0) {
        console.log('Ledger not found');
        return;
    }
    const ledger = ledgers[0];
    console.log(`Updating ledger: ${ledger.name} (ID: ${ledger.id})`);
    console.log(`Current Stored Balance: ${ledger.current_balance}`);

    // 2. Calculate correct balance from entries
    const { data: entries } = await supabase
        .from('voucher_entries')
        .select('*')
        .eq('ledger_id', ledger.id);

    let calculatedBalance = Number(ledger.opening_balance);
    // Cash-in-hand is Debit nature
    entries.forEach(e => {
        calculatedBalance += (Number(e.debit) - Number(e.credit));
    });

    console.log(`Calculated Correct Balance: ${calculatedBalance}`);

    // 3. Update
    const { error } = await supabase
        .from('ledgers')
        .update({ current_balance: calculatedBalance })
        .eq('id', ledger.id);

    if (error) console.error('Update failed:', error);
    else console.log('Update successful!');
}

fixBalance();
