'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Button from '@/components/Button';
import { createVoucher, getAccessibleCompanies, getLedgers, createLedger } from '@/app/actions';
import styles from './page.module.css';

function VouchersContent() {
    const searchParams = useSearchParams();
    const urlCompanyId = searchParams.get('companyId');
    const urlType = searchParams.get('type');

    const [companies, setCompanies] = useState([]);
    const [ledgers, setLedgers] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState(urlCompanyId || '');
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState(null);
    const [userId, setUserId] = useState(null);

    // Voucher State
    const [voucherType, setVoucherType] = useState(urlType || 'receipt');
    const [voucherDate, setVoucherDate] = useState(new Date().toISOString().split('T')[0]);
    const [narration, setNarration] = useState('');

    // Header Account (Cash/Bank for Receipt/Payment, Party for Sales/Purchase)
    const [headerLedgerId, setHeaderLedgerId] = useState('');

    // Line Items (The "Other" side)
    const [rows, setRows] = useState([{ ledger_id: '', amount: 0 }]);

    // Create Ledger Modal State
    const [showCreateLedger, setShowCreateLedger] = useState(false);
    const [newLedgerName, setNewLedgerName] = useState('');
    const [newLedgerGroup, setNewLedgerGroup] = useState('Sundry Debtors');

    useEffect(() => {
        fetchUser();
        loadCompanies();
    }, []);

    const handleCreateLedger = async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('company_id', selectedCompany);
        formData.append('name', newLedgerName);
        formData.append('group_name', newLedgerGroup);
        // Default values
        formData.append('opening_balance', 0);
        formData.append('is_cash_ledger', false);

        const result = await createLedger(formData);
        if (result.success) {
            alert('Ledger Created Successfully!');
            setShowCreateLedger(false);
            setNewLedgerName('');
            loadLedgers(selectedCompany); // Refresh list
        } else {
            alert(result.error);
        }
    };

    useEffect(() => {
        if (urlCompanyId) setSelectedCompany(urlCompanyId);
        if (urlType) setVoucherType(urlType);
    }, [urlCompanyId, urlType]);

    useEffect(() => {
        if (selectedCompany) {
            loadLedgers(selectedCompany);
        } else {
            setLedgers([]);
        }
    }, [selectedCompany]);

    const fetchUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setUserId(user.id);
            const { data } = await supabase.from('users').select('role').eq('id', user.id).single();
            setUserRole(data?.role);
        }
    };

    const loadCompanies = async () => {
        const data = await getAccessibleCompanies();
        if (data && data.length > 0) {
            setCompanies(data);
            if (!selectedCompany) setSelectedCompany(data[0].id);
        }
        setLoading(false);
    };

    const loadLedgers = async (companyId) => {
        const data = await getLedgers(companyId);
        if (data) setLedgers(data);
    };

    // --- Helper Logic for Ledger Filtering ---
    const getHeaderLedgers = () => {
        if (!ledgers.length) return [];

        // Filter Cash/Bank/Wallet Ledgers:
        const filterCash = (l) => {
            if (l.group_name === 'Bank Accounts') return true; // Includes Wallets
            if (l.group_name === 'Cash-in-hand') {
                if (userRole === 'admin') return true;
                // Operator: Only assigned to me.
                return l.assigned_operator_id === userId;
            }
            return false;
        };

        switch (voucherType) {
            case 'receipt':
                // Receipt: Debit Side is Cash/Bank/Wallet.
                return ledgers.filter(l => filterCash(l));
            case 'payment':
                // Payment: Credit Side is Cash/Bank/Wallet.
                return ledgers.filter(l => filterCash(l));
            case 'sales':
                // Sales: Debit Side is Party (Debtors) or Cash (Cash Sales).
                return ledgers.filter(l =>
                    l.group_name === 'Sundry Debtors' ||
                    filterCash(l)
                );
            case 'purchase':
                // Purchase: Credit Side is Party (Creditors) or Cash (Cash Purchase).
                return ledgers.filter(l =>
                    l.group_name === 'Sundry Creditors' ||
                    filterCash(l)
                );
            case 'contra':
                // Contra: Source Account (Credit) - Cash/Bank
                return ledgers.filter(l => filterCash(l));
            case 'journal':
                return ledgers;
            default:
                return ledgers;
        }
    };

    const getRowLedgers = () => {
        if (!ledgers.length) return [];

        // Helper to check if ledger is Cash/Bank
        const isCashOrBank = (l) => l.group_name === 'Cash-in-hand' || l.group_name === 'Bank Accounts';

        switch (voucherType) {
            case 'receipt':
                // Receipt: Credit Side (Source of funds)
                // Allow EVERYTHING except Cash/Bank (unless it's a weird contra-like receipt, but usually that's Contra)
                // This ensures Parties, Incomes, Sales, Liabilities, Capital are all visible.
                return ledgers.filter(l => !isCashOrBank(l));

            case 'payment':
                // Payment: Debit Side (Destination of funds)
                // Allow EVERYTHING except Cash/Bank
                return ledgers.filter(l => !isCashOrBank(l));

            case 'sales':
                // Sales: Credit Side -> Sales Accounts
                return ledgers.filter(l => l.group_name === 'Sales Accounts');
            case 'purchase':
                // Purchase: Debit Side -> Purchase Accounts
                return ledgers.filter(l => l.group_name === 'Purchase Accounts');
            case 'contra':
                // Contra: Destination Account (Debit) - Cash/Bank
                const filterCash = (l) => {
                    if (l.group_name === 'Bank Accounts') return true;
                    if (l.group_name === 'Cash-in-hand') {
                        if (userRole === 'admin') return true;
                        return l.assigned_operator_id === userId;
                    }
                    return false;
                };
                return ledgers.filter(l => filterCash(l));
            default:
                return ledgers;
        }
    };

    const handleRowChange = (index, field, value) => {
        const newRows = [...rows];
        newRows[index][field] = value;
        setRows(newRows);
    };

    const addRow = () => {
        setRows([...rows, { ledger_id: '', amount: 0 }]);
    };

    const removeRow = (index) => {
        setRows(rows.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!headerLedgerId) {
            alert('Please select the Header Account');
            return;
        }

        // Construct Double Entry
        const entries = [];
        const totalAmount = rows.reduce((sum, r) => sum + Number(r.amount), 0);

        if (voucherType === 'receipt') {
            entries.push({ ledger_id: headerLedgerId, debit: totalAmount, credit: 0 });
            rows.forEach(r => {
                entries.push({ ledger_id: r.ledger_id, debit: 0, credit: Number(r.amount) });
            });
        } else if (voucherType === 'payment') {
            entries.push({ ledger_id: headerLedgerId, debit: 0, credit: totalAmount });
            rows.forEach(r => {
                entries.push({ ledger_id: r.ledger_id, debit: Number(r.amount), credit: 0 });
            });
        } else if (voucherType === 'sales') {
            entries.push({ ledger_id: headerLedgerId, debit: totalAmount, credit: 0 });
            rows.forEach(r => {
                entries.push({ ledger_id: r.ledger_id, debit: 0, credit: Number(r.amount) });
            });
        } else if (voucherType === 'purchase') {
            entries.push({ ledger_id: headerLedgerId, debit: 0, credit: totalAmount });
            rows.forEach(r => {
                entries.push({ ledger_id: r.ledger_id, debit: Number(r.amount), credit: 0 });
            });
        } else if (voucherType === 'contra') {
            entries.push({ ledger_id: headerLedgerId, debit: 0, credit: totalAmount }); // Source (Credit)
            rows.forEach(r => {
                entries.push({ ledger_id: r.ledger_id, debit: Number(r.amount), credit: 0 }); // Destination (Debit)
            });
        }

        const formData = new FormData();
        formData.append('company_id', selectedCompany);
        formData.append('voucher_type', voucherType);
        formData.append('date', voucherDate);
        formData.append('narration', narration);

        const result = await createVoucher(formData, entries);

        if (result.success) {
            alert('Voucher Saved!');
            setRows([{ ledger_id: '', amount: 0 }]);
            setNarration('');
            // Don't reset headerLedgerId if it's likely to be reused (e.g. Cash)
        } else {
            alert(result.error);
        }
    };

    if (loading) return <div>Loading...</div>;

    const headerLabel = {
        'receipt': 'Deposit To (Debit)',
        'payment': 'Pay From (Credit)',
        'sales': 'Customer / Party (Debit)',
        'purchase': 'Supplier / Party (Credit)',
        'contra': 'Source Account (Credit)',
        'journal': 'Journal Mode'
    }[voucherType];

    const rowLabel = {
        'receipt': 'Received From (Credit)',
        'payment': 'Paid To (Debit)',
        'sales': 'Sales Ledger (Credit)',
        'purchase': 'Purchase Ledger (Debit)',
        'contra': 'Destination Account (Debit)',
        'journal': 'Particulars'
    }[voucherType];

    const pageTitle = {
        'receipt': 'Receipt Entry',
        'payment': 'Payment Entry',
        'sales': 'Sales Invoice',
        'purchase': 'Purchase Entry',
        'contra': 'Contra Entry',
        'journal': 'Journal Voucher'
    }[voucherType];

    return (
        <div className={styles.container}>
            <div className={styles.topBar}>
                <h1 className={styles.title}>{pageTitle}</h1>
                {!urlCompanyId && (
                    <div className={styles.controls}>
                        <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)} className={styles.select}>
                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.headerSection}>
                    <div className={styles.row}>
                        <div className={styles.field}>
                            <label>Voucher Type</label>
                            <select
                                value={voucherType}
                                onChange={e => setVoucherType(e.target.value)}
                                className={styles.selectInput}
                                disabled={!!urlType} // Lock if passed via URL
                            >
                                <option value="receipt">Receipt</option>
                                <option value="payment">Payment</option>
                                <option value="sales">Sales</option>
                                <option value="purchase">Purchase</option>
                                <option value="contra">Contra</option>
                            </select>
                        </div>
                        <div className={styles.field}>
                            <label>Date</label>
                            <input type="date" value={voucherDate} onChange={e => setVoucherDate(e.target.value)} className={styles.input} required />
                        </div>
                    </div>

                    <div className={styles.row}>
                        <div className={styles.field} style={{ flex: 1 }}>
                            <label>{headerLabel}</label>
                            <select
                                value={headerLedgerId}
                                onChange={e => setHeaderLedgerId(e.target.value)}
                                className={styles.selectInput}
                                required
                            >
                                <option value="">Select Account</option>
                                {getHeaderLedgers().map(l => (
                                    <option key={l.id} value={l.id}>
                                        {l.name} ({l.group_name}) {l.sub_group ? `- ${l.sub_group}` : ''} [Bal: {l.current_balance}]
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className={styles.entriesSection}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>{rowLabel}</h3>
                        <Button type="button" onClick={() => setShowCreateLedger(true)} variant="secondary" size="small">
                            + Create New Party/Ledger
                        </Button>
                    </div>
                    {rows.map((row, index) => (
                        <div key={index} className={styles.entryRow}>
                            <div className={styles.field} style={{ flex: 2 }}>
                                <select
                                    value={row.ledger_id}
                                    onChange={(e) => handleRowChange(index, 'ledger_id', e.target.value)}
                                    className={styles.selectInput}
                                    required
                                >
                                    <option value="">Select Ledger</option>
                                    {getRowLedgers().map(l => (
                                        <option key={l.id} value={l.id}>
                                            {l.name} ({l.group_name}) {l.sub_group ? `- ${l.sub_group}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles.field}>
                                <input
                                    type="number"
                                    placeholder="Amount"
                                    value={row.amount}
                                    onChange={(e) => handleRowChange(index, 'amount', e.target.value)}
                                    className={styles.input}
                                    required
                                />
                            </div>
                            <button type="button" onClick={() => removeRow(index)} className={styles.removeBtn}>×</button>
                        </div>
                    ))}
                    <Button type="button" onClick={addRow} variant="secondary" size="small">+ Add Line</Button>
                </div>

                <div className={styles.footerSection}>
                    <div className={styles.field}>
                        <label>Narration</label>
                        <textarea
                            value={narration}
                            onChange={e => setNarration(e.target.value)}
                            className={styles.textarea}
                            rows="2"
                            placeholder="Enter details..."
                        ></textarea>
                    </div>
                    <div className={styles.totalRow}>
                        <span>Total: {rows.reduce((sum, r) => sum + Number(r.amount), 0)}</span>
                        <Button type="submit">Save Voucher</Button>
                    </div>
                </div>
            </form>

            {/* Create Ledger Modal */}
            {showCreateLedger && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modal}>
                        <h3>Create New Ledger</h3>
                        <form onSubmit={handleCreateLedger} className={styles.form}>
                            <div className={styles.field}>
                                <label>Name</label>
                                <input
                                    value={newLedgerName}
                                    onChange={e => setNewLedgerName(e.target.value)}
                                    className={styles.input}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className={styles.field}>
                                <label>Group</label>
                                <select
                                    value={newLedgerGroup}
                                    onChange={e => setNewLedgerGroup(e.target.value)}
                                    className={styles.selectInput}
                                >
                                    <option value="Sundry Debtors">Sundry Debtors (Customer)</option>
                                    <option value="Sundry Creditors">Sundry Creditors (Supplier)</option>
                                    <option value="Direct Expenses">Direct Expenses</option>
                                    <option value="Indirect Expenses">Indirect Expenses</option>
                                    <option value="Direct Incomes">Direct Incomes</option>
                                    <option value="Indirect Incomes">Indirect Incomes</option>
                                    <option value="Sales Accounts">Sales Accounts</option>
                                    <option value="Purchase Accounts">Purchase Accounts</option>
                                    <option value="Capital Account">Capital Account</option>
                                    <option value="Loans (Liability)">Loans (Liability)</option>
                                </select>
                            </div>
                            <div className={styles.modalActions}>
                                <Button type="button" onClick={() => setShowCreateLedger(false)} variant="secondary">Cancel</Button>
                                <Button type="submit">Create</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function VouchersPage() {
    return (
        <Suspense fallback={<div>Loading Vouchers...</div>}>
            <VouchersContent />
        </Suspense>
    );
}
