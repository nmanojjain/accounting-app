'use server';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Helper to create an authenticated Supabase client
async function createAuthClient() {
    const cookieStore = await cookies();

    return createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        cookieStore.set(name, value, options)
                    );
                } catch {
                    // The `setAll` method was called from a Server Component.
                    // This can be ignored if you have middleware refreshing
                    // user sessions.
                }
            },
        },
    });
}

// Helper to check if current user is Admin
async function checkAdmin(supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userData?.role !== 'admin') {
        return { error: 'Unauthorized: Only Admins can perform this action.' };
    }
    return { success: true, user };
}

// Helper to validate if user has access to the company
async function validateCompanyAccess(supabase, companyId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    // Check if Admin
    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userData?.role === 'admin') return { success: true, user };

    // Check if Operator has access
    const adminClient = getAdminClient();
    const { data: access } = await adminClient
        .from('user_company_access')
        .select('id')
        .eq('user_id', user.id)
        .eq('company_id', companyId)
        .single();

    if (!access) {
        return { error: 'Unauthorized: You do not have access to this company.' };
    }

    return { success: true, user };
}



// Helper to getting admin client for bypassing RLS
const getAdminClient = () => {
    return createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
};

export async function getAccessibleCompanies() {
    const supabase = await createAuthClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return [];

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();

    // Use Admin Client to bypass RLS for fetching companies
    const adminClient = getAdminClient();

    if (userData?.role === 'admin') {
        const { data } = await adminClient.from('companies').select('*').order('created_at', { ascending: false });
        return data || [];
    } else {
        // Operator: Fetch assigned companies
        const { data } = await adminClient
            .from('user_company_access')
            .select(`
                company:companies (*)
            `)
            .eq('user_id', user.id);

        if (data) {
            return data.map(item => item.company).filter(Boolean);
        }
        return [];
    }
}

export async function getLedgers(companyId) {
    const supabase = await createAuthClient();

    // Use the helper to validate access first (Secure check)
    const access = await validateCompanyAccess(supabase, companyId);
    if (access.error) return [];

    // Use Admin Client to bypass RLS for fetching ledgers
    // We already validated access above
    const adminClient = getAdminClient();

    const { data } = await adminClient
        .from('ledgers')
        .select('*')
        .eq('company_id', companyId)
        .order('name');

    return data || [];
}

export async function createCompany(formData) {
    const supabase = await createAuthClient();

    // Strict Admin Check
    const adminCheck = await checkAdmin(supabase);
    if (adminCheck.error) return { error: adminCheck.error };

    const name = formData.get('name');
    const financial_year = formData.get('financial_year');

    const { data, error } = await supabase
        .from('companies')
        .insert([{ name, financial_year }])
        .select();

    if (error) {
        console.error('Supabase Insert Error:', error);
        return { error: error.message };
    }
    return { success: true, data };
}

export async function createOperator(formData) {
    const supabase = await createAuthClient();

    // Strict Admin Check before doing anything content-sensitive
    const adminCheck = await checkAdmin(supabase);
    if (adminCheck.error) return { error: adminCheck.error };

    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseServiceKey) {
        return { error: "SUPABASE_SERVICE_ROLE_KEY is missing in .env.local." };
    }

    // Create Admin Client with Service Key for Auth Admin operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    const email = formData.get('email');
    const password = formData.get('password');
    const role = 'operator';

    // 1. Create Auth User
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
    });

    let userId = authUser?.user?.id;

    if (authError) {
        if (authError.message.includes('already registered')) {
            const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
            const existingUser = users.find(u => u.email === email);
            if (existingUser) {
                userId = existingUser.id;
            } else {
                return { error: authError.message };
            }
        } else {
            return { error: authError.message };
        }
    }

    // 2. Create/Ensure Public Profile
    if (userId) {
        const { data: existingProfile } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('id', userId)
            .single();

        if (!existingProfile) {
            const { error: profileError } = await supabaseAdmin
                .from('users')
                .insert([{
                    id: userId,
                    email: email,
                    role: role
                }]);

            if (profileError) {
                return { error: 'Profile failed: ' + profileError.message };
            }
        } else {
            return { success: true, message: 'User already exists, profile verified.' };
        }
    }

    return { success: true };
}

export async function syncUsers() {
    const supabase = await createAuthClient();

    // Strict Admin Check
    const adminCheck = await checkAdmin(supabase);
    if (adminCheck.error) return { error: adminCheck.error };

    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseServiceKey) return { error: "Service Key missing" };

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    // 1. Fetch all Auth Users
    const { data: { users }, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    if (authError) return { error: authError.message };

    let syncedCount = 0;

    // 2. Upsert into public.users
    for (const user of users) {
        const { data: existing } = await supabaseAdmin.from('users').select('id').eq('id', user.id).single();
        if (!existing) {
            await supabaseAdmin.from('users').insert({
                id: user.id,
                email: user.email,
                role: 'operator'
            });
            syncedCount++;
        }
    }

    return { success: true, count: syncedCount };
}

export async function createLedger(formData) {
    const supabase = await createAuthClient();
    const company_id = formData.get('company_id');
    const name = formData.get('name');
    const group_name = formData.get('group_name');
    const sub_group = formData.get('sub_group');
    const opening_balance = formData.get('opening_balance');
    const assigned_operator_id = formData.get('assigned_operator_id');
    const is_cash_ledger = formData.get('is_cash_ledger') === 'true';

    // Validate Access (Operator can create ledgers for assigned company)
    const accessCheck = await validateCompanyAccess(supabase, company_id);
    if (accessCheck.error) return { error: accessCheck.error };

    // Use Admin Client to bypass RLS for creation if needed (or ensure RLS allows it)
    // Since user is getting RLS error, let's use Admin Client here as we already validated access.
    const adminClient = getAdminClient();

    const { error } = await adminClient
        .from('ledgers')
        .insert([{
            company_id,
            name,
            group_name,
            sub_group,
            opening_balance: opening_balance || 0,
            current_balance: opening_balance || 0,
            assigned_operator_id: assigned_operator_id || null,
            is_cash_ledger
        }]);

    if (error) return { error: error.message };
    return { success: true };
}

// ... (createVoucher, transferCash, deleteLedger, assignCompany, revokeCompany, deleteCompany, updateCompany omitted for brevity if unchanged)

export async function updateLedger(formData) {
    const supabase = await createAuthClient();
    const adminCheck = await checkAdmin(supabase);
    if (adminCheck.error) return { error: adminCheck.error };

    const id = formData.get('id');
    const name = formData.get('name');
    const group_name = formData.get('group_name');
    const sub_group = formData.get('sub_group');

    // We only allow updating Name and Group. Updating Opening Balance is risky if transactions exist.
    const { error } = await supabase
        .from('ledgers')
        .update({ name, group_name, sub_group })
        .eq('id', id);

    if (error) return { error: error.message };
    return { success: true };
}

export async function createVoucher(formData, entries) {
    const supabase = await createAuthClient();
    const company_id = formData.get('company_id');
    const voucher_type = formData.get('voucher_type');
    const date = formData.get('date');
    const narration = formData.get('narration');

    // 1. Date Validation
    const minDate = '2025-04-01';
    const maxDate = '2026-03-31';
    if (date < minDate || date > maxDate) {
        return { error: 'Date must be within Financial Year (01-04-2025 to 31-03-2026)' };
    }

    // Validate Access (Operator can create vouchers for assigned company)
    const accessCheck = await validateCompanyAccess(supabase, company_id);
    if (accessCheck.error) return { error: accessCheck.error };

    // Use Admin Client to bypass RLS for writing
    const adminClient = getAdminClient();

    // 2. Negative Cash Balance Check (Pre-Validation)
    // Identify Cash Ledgers involved
    for (const entry of entries) {
        const { data: ledger } = await adminClient
            .from('ledgers')
            .select('id, name, group_name, current_balance')
            .eq('id', entry.ledger_id)
            .single();

        if (ledger && ledger.group_name === 'Cash-in-hand') {
            const currentBal = Number(ledger.current_balance);
            const debit = Number(entry.debit || 0);
            const credit = Number(entry.credit || 0);

            // Cash is Debit Nature (Asset)
            // New Balance = Current + Debit - Credit
            const newBal = currentBal + debit - credit;

            if (newBal < 0) {
                return { error: `Transaction rejected: Cash ledger '${ledger.name}' would have a negative balance (${newBal}).` };
            }
        }
    }

    const { data: voucher, error: voucherError } = await adminClient
        .from('vouchers')
        .insert([{
            company_id,
            voucher_type,
            date,
            narration,
            created_by: accessCheck.user.id
        }])
        .select()
        .single();

    if (voucherError) return { error: voucherError.message };

    const voucherEntries = entries.map(entry => ({
        voucher_id: voucher.id,
        ledger_id: entry.ledger_id,
        debit: entry.debit || 0,
        credit: entry.credit || 0
    }));

    const { error: entriesError } = await adminClient
        .from('voucher_entries')
        .insert(voucherEntries);

    if (entriesError) return { error: entriesError.message };

    for (const entry of voucherEntries) {
        const { data: ledger } = await adminClient
            .from('ledgers')
            .select('current_balance, group_name')
            .eq('id', entry.ledger_id)
            .single();

        if (ledger) {
            let newBalance = Number(ledger.current_balance);
            const isDebitNature = ['Asset', 'Expense', 'Cash-in-hand', 'Bank Accounts'].includes(ledger.group_name);

            if (isDebitNature) {
                newBalance += (Number(entry.debit) - Number(entry.credit));
            } else {
                newBalance += (Number(entry.credit) - Number(entry.debit));
            }

            await adminClient
                .from('ledgers')
                .update({ current_balance: newBalance })
                .eq('id', entry.ledger_id);
        }
    }

    return { success: true };
}

export async function transferCash(formData) {
    const supabase = await createAuthClient();
    const operator_ledger_id = formData.get('operator_ledger_id');
    const main_cash_ledger_id = formData.get('main_cash_ledger_id');
    const amount = formData.get('amount');
    const company_id = formData.get('company_id');

    // Validate Access
    const accessCheck = await validateCompanyAccess(supabase, company_id);
    if (accessCheck.error) return { error: accessCheck.error };

    const entries = [
        { ledger_id: main_cash_ledger_id, debit: amount, credit: 0 },
        { ledger_id: operator_ledger_id, debit: 0, credit: amount }
    ];

    const { data: voucher, error: voucherError } = await supabase
        .from('vouchers')
        .insert([{
            company_id,
            voucher_type: 'journal',
            date: new Date().toISOString().split('T')[0],
            narration: 'Cash Transfer from Operator to Main',
            created_by: accessCheck.user.id
        }])
        .select()
        .single();

    if (voucherError) return { error: voucherError.message };

    const voucherEntries = entries.map(entry => ({
        voucher_id: voucher.id,
        ledger_id: entry.ledger_id,
        debit: entry.debit,
        credit: entry.credit
    }));

    const { error: entriesError } = await supabase
        .from('voucher_entries')
        .insert(voucherEntries);

    if (entriesError) return { error: entriesError.message };

    const { data: mainLedger } = await supabase.from('ledgers').select('current_balance').eq('id', main_cash_ledger_id).single();
    if (mainLedger) {
        await supabase.from('ledgers').update({ current_balance: Number(mainLedger.current_balance) + Number(amount) }).eq('id', main_cash_ledger_id);
    }

    const { data: opLedger } = await supabase.from('ledgers').select('current_balance').eq('id', operator_ledger_id).single();
    if (opLedger) {
        await supabase.from('ledgers').update({ current_balance: Number(opLedger.current_balance) - Number(amount) }).eq('id', operator_ledger_id);
    }

    return { success: true };
}

export async function deleteLedger(ledgerId) {
    const supabase = await createAuthClient();

    // Strict Admin Check
    const adminCheck = await checkAdmin(supabase);
    if (adminCheck.error) return { error: adminCheck.error };

    // 2. Check for Entries
    const { count, error: countError } = await supabase
        .from('voucher_entries')
        .select('*', { count: 'exact', head: true })
        .eq('ledger_id', ledgerId);

    if (countError) return { error: countError.message };
    if (count > 0) {
        return { error: 'Cannot delete ledger with existing transactions.' };
    }

    // 3. Delete
    const { error: deleteError } = await supabase
        .from('ledgers')
        .delete()
        .eq('id', ledgerId);

    if (deleteError) return { error: deleteError.message };

    return { success: true };
}

export async function assignCompany(userId, companyId) {
    const supabase = await createAuthClient();

    // Strict Admin Check
    const adminCheck = await checkAdmin(supabase);
    if (adminCheck.error) return { error: adminCheck.error };

    const { error } = await supabase
        .from('user_company_access')
        .insert([{ user_id: userId, company_id: companyId }]);

    if (error) {
        if (error.code === '23505') return { error: 'User already assigned to this company.' };
        return { error: error.message };
    }
    return { success: true };
}

export async function revokeCompany(userId, companyId) {
    const supabase = await createAuthClient();

    // Strict Admin Check
    const adminCheck = await checkAdmin(supabase);
    if (adminCheck.error) return { error: adminCheck.error };

    const { error } = await supabase
        .from('user_company_access')
        .delete()
        .eq('user_id', userId)
        .eq('company_id', companyId);

    if (error) return { error: error.message };
    return { success: true };
}

// --- Admin Features: Edit/Delete ---

export async function deleteCompany(companyId) {
    const supabase = await createAuthClient();
    const adminCheck = await checkAdmin(supabase);
    if (adminCheck.error) return { error: adminCheck.error };

    // Cascade delete is usually handled by DB Reference, but let's manual check/delete if needed
    // Assuming DB has ON DELETE CASCADE. If not, we might error.
    // For safety, let's try to delete.

    const { error } = await supabase.from('companies').delete().eq('id', companyId);
    if (error) return { error: error.message };
    return { success: true };
}

export async function updateCompany(formData) {
    const supabase = await createAuthClient();
    const adminCheck = await checkAdmin(supabase);
    if (adminCheck.error) return { error: adminCheck.error };

    const id = formData.get('id');
    const name = formData.get('name');
    const financial_year = formData.get('financial_year');

    const { error } = await supabase
        .from('companies')
        .update({ name, financial_year })
        .eq('id', id);

    if (error) return { error: error.message };
    return { success: true };
}



export async function deleteVoucher(voucherId) {
    const supabase = await createAuthClient();
    const adminCheck = await checkAdmin(supabase);
    if (adminCheck.error) return { error: adminCheck.error };

    // 1. Fetch Entries to Reverse Balances
    const { data: entries, error: fetchError } = await supabase
        .from('voucher_entries')
        .select('*')
        .eq('voucher_id', voucherId);

    if (fetchError) return { error: fetchError.message };

    // 2. Reverse Balances
    for (const entry of entries) {
        const { data: ledger } = await supabase.from('ledgers').select('current_balance, group_name, id').eq('id', entry.ledger_id).single();
        if (ledger) {
            let newBalance = Number(ledger.current_balance);
            const isDebitNature = ['Asset', 'Expense'].includes(ledger.group_name);

            // To Reverse:
            // If it was a Debit entry (added to debit nature, sub from credit), we do opposite.
            // Debit Entry: Deduct from Debit Nature, Add to Credit Nature.
            // Credit Entry: Add to Debit Nature, Deduct from Credit Nature.

            if (isDebitNature) {
                // Was: newBalance += (Debit - Credit)
                // Now: newBalance -= (Debit - Credit) => newBalance += (Credit - Debit)
                newBalance += (Number(entry.credit) - Number(entry.debit));
            } else {
                // Was: newBalance += (Credit - Debit)
                // Now: newBalance -= (Credit - Debit) => newBalance += (Debit - Credit)
                newBalance += (Number(entry.debit) - Number(entry.credit));
            }

            await supabase.from('ledgers').update({ current_balance: newBalance }).eq('id', ledger.id);
        }
    }

    // 3. Delete Voucher (Cascade should delete entries, but if not we delete entries first)
    // Assuming Cascade is NOT set for safety or we rely on it. Let's delete entries first to be safe.
    await supabase.from('voucher_entries').delete().eq('voucher_id', voucherId);

    const { error: deleteError } = await supabase.from('vouchers').delete().eq('id', voucherId);
    if (deleteError) return { error: deleteError.message };

    return { success: true };
}

export async function updateVoucher(formData, newEntries) {
    const supabase = await createAuthClient();
    const adminCheck = await checkAdmin(supabase);
    if (adminCheck.error) return { error: adminCheck.error };

    const voucherId = formData.get('voucher_id');
    const company_id = formData.get('company_id');
    const voucher_type = formData.get('voucher_type');
    const date = formData.get('date');
    const narration = formData.get('narration');

    // 1. Date Validation
    const minDate = '2025-04-01';
    const maxDate = '2026-03-31';
    if (date < minDate || date > maxDate) {
        return { error: 'Date must be within Financial Year (01-04-2025 to 31-03-2026)' };
    }

    const adminClient = getAdminClient();

    // 2. Fetch Old Entries to Calculate Reversal
    const { data: oldEntries, error: fetchError } = await adminClient
        .from('voucher_entries')
        .select('*')
        .eq('voucher_id', voucherId);

    if (fetchError) return { error: fetchError.message };

    // 3. Pre-Calculation & Validation (Negative Cash Check)
    // We need to check if (Current - Old + New) < 0 for Cash Ledgers.
    // Collect all unique ledger IDs involved (Old + New)
    const ledgerIds = new Set([
        ...oldEntries.map(e => e.ledger_id),
        ...newEntries.map(e => e.ledger_id)
    ]);

    for (const ledgerId of ledgerIds) {
        const { data: ledger } = await adminClient
            .from('ledgers')
            .select('id, name, group_name, current_balance')
            .eq('id', ledgerId)
            .single();

        if (ledger && ledger.group_name === 'Cash-in-hand') {
            let projectedBalance = Number(ledger.current_balance);

            // Revert Old Impact
            const oldEntry = oldEntries.find(e => e.ledger_id === ledgerId);
            if (oldEntry) {
                // Cash is Debit Nature.
                // If Old was Debit 100, Balance increased by 100. Revert = -100.
                // If Old was Credit 100, Balance decreased by 100. Revert = +100.
                projectedBalance -= (Number(oldEntry.debit) - Number(oldEntry.credit));
            }

            // Apply New Impact
            const newEntry = newEntries.find(e => e.ledger_id === ledgerId);
            if (newEntry) {
                projectedBalance += (Number(newEntry.debit || 0) - Number(newEntry.credit || 0));
            }

            if (projectedBalance < 0) {
                return { error: `Update rejected: Cash ledger '${ledger.name}' would have a negative balance (${projectedBalance}).` };
            }
        }
    }

    // 4. Execution (Reverse Old -> Delete Old -> Update Header -> Insert New -> Update New)

    // A. Reverse Old Balances
    for (const entry of oldEntries) {
        const { data: ledger } = await adminClient.from('ledgers').select('current_balance, group_name').eq('id', entry.ledger_id).single();
        if (ledger) {
            let bal = Number(ledger.current_balance);
            const isDebitNature = ['Asset', 'Expense', 'Cash-in-hand', 'Bank Accounts'].includes(ledger.group_name);
            // Reverse logic: If Debit Nature, subtract (Debit-Credit).
            if (isDebitNature) {
                bal -= (Number(entry.debit) - Number(entry.credit));
            } else {
                bal -= (Number(entry.credit) - Number(entry.debit));
            }
            await adminClient.from('ledgers').update({ current_balance: bal }).eq('id', entry.ledger_id);
        }
    }

    // B. Delete Old Entries
    await adminClient.from('voucher_entries').delete().eq('voucher_id', voucherId);

    // C. Update Voucher Header
    const { error: updateError } = await adminClient
        .from('vouchers')
        .update({
            company_id,
            voucher_type,
            date,
            narration,
            // created_by remains unchanged
        })
        .eq('id', voucherId);

    if (updateError) return { error: updateError.message };

    // D. Insert New Entries
    const voucherEntries = newEntries.map(entry => ({
        voucher_id: voucherId,
        ledger_id: entry.ledger_id,
        debit: entry.debit || 0,
        credit: entry.credit || 0
    }));

    const { error: insertError } = await adminClient
        .from('voucher_entries')
        .insert(voucherEntries);

    if (insertError) return { error: insertError.message };

    // E. Update New Balances
    for (const entry of voucherEntries) {
        const { data: ledger } = await adminClient.from('ledgers').select('current_balance, group_name').eq('id', entry.ledger_id).single();
        if (ledger) {
            let bal = Number(ledger.current_balance);
            const isDebitNature = ['Asset', 'Expense', 'Cash-in-hand', 'Bank Accounts'].includes(ledger.group_name);

            if (isDebitNature) {
                bal += (Number(entry.debit) - Number(entry.credit));
            } else {
                bal += (Number(entry.credit) - Number(entry.debit));
            }
            await adminClient.from('ledgers').update({ current_balance: bal }).eq('id', entry.ledger_id);
        }
    }

    return { success: true };
}

export async function cancelVoucher(voucherId) {
    const supabase = await createAuthClient();
    const adminCheck = await checkAdmin(supabase);
    if (adminCheck.error) return { error: adminCheck.error };

    const { data: { user } } = await supabase.auth.getUser();

    // 1. Fetch Voucher and Entries
    const { data: voucher, error: vError } = await supabase
        .from('vouchers')
        .select('narration')
        .eq('id', voucherId)
        .single();

    if (vError) return { error: vError.message };

    const { data: entries, error: fetchError } = await supabase
        .from('voucher_entries')
        .select('*')
        .eq('voucher_id', voucherId);

    if (fetchError) return { error: fetchError.message };

    // 2. Reverse Balances (Same logic as delete)
    for (const entry of entries) {
        const { data: ledger } = await supabase.from('ledgers').select('current_balance, group_name, id').eq('id', entry.ledger_id).single();
        if (ledger) {
            let newBalance = Number(ledger.current_balance);
            const isDebitNature = ['Asset', 'Expense', 'Cash-in-hand', 'Bank Accounts'].includes(ledger.group_name);

            if (isDebitNature) {
                newBalance += (Number(entry.credit) - Number(entry.debit));
            } else {
                newBalance += (Number(entry.debit) - Number(entry.credit));
            }

            await supabase.from('ledgers').update({ current_balance: newBalance }).eq('id', ledger.id);
        }
    }

    // 3. Delete Entries (Make it blank)
    await supabase.from('voucher_entries').delete().eq('voucher_id', voucherId);

    // 4. Update Voucher Narration to mark as Cancelled
    const newNarration = `CANCELLED: ${voucher.narration} (by ${user.email})`;
    const { error: updateError } = await supabase
        .from('vouchers')
        .update({ narration: newNarration })
        .eq('id', voucherId);

    if (updateError) return { error: updateError.message };

    return { success: true };
}

export async function getDayBook(companyId, fromDate, toDate) {
    const supabase = await createAuthClient();
    const access = await validateCompanyAccess(supabase, companyId);
    if (access.error) return { error: access.error };

    const adminClient = getAdminClient();
    const { data, error } = await adminClient
        .from('vouchers')
        .select(`
            *,
            voucher_entries (
                ledger_id,
                debit,
                credit,
                ledger: ledgers(name)
            )
        `)
        .eq('company_id', companyId)
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) return { error: error.message };
    return { success: true, data };
}

export async function getLedgerEntries(companyId, ledgerId) {
    const supabase = await createAuthClient();
    const access = await validateCompanyAccess(supabase, companyId);
    if (access.error) return { error: access.error };

    const adminClient = getAdminClient();

    // 1. Ledger Details
    const { data: ledgerData } = await adminClient
        .from('ledgers')
        .select('opening_balance, group_name')
        .eq('id', ledgerId)
        .single();

    if (!ledgerData) return { error: 'Ledger not found' };

    // 2. Entries
    const { data: allEntries, error } = await adminClient
        .from('voucher_entries')
        .select(`
            id, debit, credit,
            voucher:vouchers (
                id, date, voucher_type, voucher_number, narration,
                voucher_entries (
                    ledger_id,
                    ledger:ledgers(name),
                    debit,
                    credit
                )
            )
        `)
        .eq('ledger_id', ledgerId);

    if (error) return { error: error.message };

    return { success: true, ledgerData, allEntries };
}
