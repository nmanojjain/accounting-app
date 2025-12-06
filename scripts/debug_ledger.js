const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.resolve(__dirname, '../.env.local');
const envConfig = fs.readFileSync(envPath, 'utf8').split('\n').reduce((acc, line) => {
    const [key, value] = line.split('=');
    if (key && value) acc[key.trim()] = value.trim();
    return acc;
}, {});

console.log('Loaded Env:', {
    URL: envConfig.NEXT_PUBLIC_SUPABASE_URL,
    KEY_EXISTS: !!envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
});

const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY);

async function debugLedger() {
    const { data: ledgers, error: ledgerError } = await supabase
        .from('ledgers')
        .select('*')
        .ilike('name', '%Cash with Ravi%');

    if (ledgerError) {
        console.error('Error fetching ledger:', ledgerError);
        return;
    }

    if (ledgers.length === 0) {
        console.log('Ledger not found');
        return;
    }

    const ledger = ledgers[0];
    console.log('--- Ledger Details ---');
    console.log(`ID: ${ledger.id}`);
    console.log(`Name: ${ledger.name}`);
    console.log(`Group: ${ledger.group_name}`);
    console.log(`Opening Balance: ${ledger.opening_balance}`);
    console.log(`Current Balance (Stored): ${ledger.current_balance}`);

    const { data: entries, error: entriesError } = await supabase
        .from('voucher_entries')
        .select('*, voucher:vouchers(date, voucher_type)')
        .eq('ledger_id', ledger.id);

    if (entriesError) {
        console.error('Error fetching entries:', entriesError);
        return;
    }

    console.log('\n--- Voucher Entries ---');
    let runningBalance = Number(ledger.opening_balance);
    const isDebitNature = ['Asset', 'Expense', 'Cash-in-hand', 'Bank Accounts'].includes(ledger.group_name); // Assuming Cash-in-hand is Asset

    console.log(`Initial Balance: ${runningBalance}`);

    entries.forEach(entry => {
        const debit = Number(entry.debit) || 0;
        const credit = Number(entry.credit) || 0;

        let change = 0;
        if (isDebitNature) {
            change = debit - credit;
        } else {
            change = credit - debit;
        }

        runningBalance += change;
        console.log(`Date: ${entry.voucher?.date} | Type: ${entry.voucher?.voucher_type} | Dr: ${debit} | Cr: ${credit} | Change: ${change} | New Bal: ${runningBalance}`);
    });

    console.log(`\nCalculated Balance: ${runningBalance}`);
    console.log(`Difference: ${Number(ledger.current_balance) - runningBalance}`);
}

debugLedger();
