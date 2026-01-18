'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { createVoucher, getAccessibleCompanies, getLedgers, createLedger, getNextVoucherNumber } from '@/app/actions';
import LedgerSelector from '@/app/components/LedgerSelector';
import styles from './page.module.css';

function VouchersContent() {
    const searchParams = useSearchParams();
    const params = useParams();
    const urlCompanyId = searchParams.get('companyId') || params?.companyId;
    const urlType = searchParams.get('type');

    const [companies, setCompanies] = useState([]);
    const [ledgers, setLedgers] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState(urlCompanyId || '');
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState(null);
    const [userId, setUserId] = useState(null);
    const [nextNo, setNextNo] = useState('...');

    // Voucher State
    const [voucherType, setVoucherType] = useState(urlType || 'receipt');
    const [voucherDate, setVoucherDate] = useState(new Date().toISOString().split('T')[0]);
    const [narration, setNarration] = useState('');

    // Header Account (Searchable)
    const [headerLedgerId, setHeaderLedgerId] = useState('');
    const [headerLedgerSearch, setHeaderLedgerSearch] = useState('');

    // Line Items (Searchable)
    const [rows, setRows] = useState([{ ledger_id: '', amount: '', search: '' }]);

    // Create Ledger Modal State
    const [showCreateLedger, setShowCreateLedger] = useState(false);
    const [newLedgerName, setNewLedgerName] = useState('');
    const [newLedgerGroup, setNewLedgerGroup] = useState('Sundry Debtors');

    useEffect(() => {
        fetchUser();
        loadCompanies();
    }, []);

    useEffect(() => {
        if (selectedCompany && voucherType) {
            updateNextNo();
        }
    }, [selectedCompany, voucherType]);

    const updateNextNo = async () => {
        const no = await getNextVoucherNumber(selectedCompany, voucherType);
        setNextNo(no);
    };

    const handleCreateLedger = async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('company_id', selectedCompany);
        formData.append('name', newLedgerName);
        formData.append('group_name', newLedgerGroup);
        formData.append('opening_balance', 0);
        formData.append('is_cash_ledger', false);

        const result = await createLedger(formData);
        if (result.success) {
            setShowCreateLedger(false);
            setNewLedgerName('');
            loadLedgers(selectedCompany);
        } else {
            alert(result.error);
        }
    };

    useEffect(() => {
        if (urlCompanyId) setSelectedCompany(urlCompanyId);
        if (urlType) setVoucherType(urlType);
    }, [urlCompanyId, urlType]);

    useEffect(() => {
        if (selectedCompany) loadLedgers(selectedCompany);
        else setLedgers([]);
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

    const getHeaderLedgers = () => {
        if (!ledgers.length) return [];
        const filterCash = (l) => {
            if (l.group_name === 'Bank Accounts') return true;
            if (l.group_name === 'Cash-in-hand') {
                if (userRole === 'admin') return true;
                return l.assigned_operator_id === userId;
            }
            return false;
        };

        switch (voucherType) {
            case 'receipt': return ledgers.filter(l => filterCash(l));
            case 'payment': return ledgers.filter(l => filterCash(l));
            case 'sales': return ledgers.filter(l => l.group_name === 'Sundry Debtors' || filterCash(l));
            case 'purchase': return ledgers.filter(l => l.group_name === 'Sundry Creditors' || filterCash(l));
            case 'contra': return ledgers.filter(l => filterCash(l));
            default: return ledgers;
        }
    };

    const getRowLedgers = () => {
        if (!ledgers.length) return [];
        const isCashOrBank = (l) => l.group_name === 'Cash-in-hand' || l.group_name === 'Bank Accounts';
        const filterCash = (l) => {
            if (l.group_name === 'Bank Accounts') return true;
            if (l.group_name === 'Cash-in-hand') {
                if (userRole === 'admin') return true;
                return l.assigned_operator_id === userId;
            }
            return false;
        };

        switch (voucherType) {
            case 'receipt': return ledgers.filter(l => !isCashOrBank(l));
            case 'payment': return ledgers.filter(l => !isCashOrBank(l));
            case 'sales': return ledgers.filter(l =>
                l.group_name === 'Sales Accounts' ||
                l.group_name === 'Direct Incomes' ||
                l.group_name === 'Indirect Incomes' ||
                l.group_name === 'Duties & Taxes'
            );
            case 'purchase': return ledgers.filter(l =>
                l.group_name === 'Purchase Accounts' ||
                l.group_name === 'Direct Expenses' ||
                l.group_name === 'Indirect Expenses' ||
                l.group_name === 'Duties & Taxes'
            );
            case 'contra': return ledgers.filter(l => filterCash(l));
            default: return ledgers;
        }
    };

    const handleRowChange = (index, field, value) => {
        const newRows = [...rows];
        if (field === 'search') {
            newRows[index].search = value;
            const match = getRowLedgers().find(l => l.name === value);
            if (match) newRows[index].ledger_id = match.id;
        } else {
            newRows[index][field] = value;
        }
        setRows(newRows);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!headerLedgerId) return alert('Please select a valid Account');

        const validRows = rows.filter(r => r.ledger_id && Number(r.amount) > 0);
        if (validRows.length === 0) return alert('Add at least one valid entry');

        const entries = [];
        const totalAmount = validRows.reduce((sum, r) => sum + Number(r.amount), 0);

        if (voucherType === 'receipt') {
            entries.push({ ledger_id: headerLedgerId, debit: totalAmount, credit: 0 });
            validRows.forEach(r => entries.push({ ledger_id: r.ledger_id, debit: 0, credit: Number(r.amount) }));
        } else if (voucherType === 'payment') {
            entries.push({ ledger_id: headerLedgerId, debit: 0, credit: totalAmount });
            validRows.forEach(r => entries.push({ ledger_id: r.ledger_id, debit: Number(r.amount), credit: 0 }));
        } else if (voucherType === 'sales') {
            entries.push({ ledger_id: headerLedgerId, debit: totalAmount, credit: 0 });
            validRows.forEach(r => entries.push({ ledger_id: r.ledger_id, debit: 0, credit: Number(r.amount) }));
        } else if (voucherType === 'purchase') {
            entries.push({ ledger_id: headerLedgerId, debit: 0, credit: totalAmount });
            validRows.forEach(r => entries.push({ ledger_id: r.ledger_id, debit: Number(r.amount), credit: 0 }));
        } else if (voucherType === 'contra') {
            entries.push({ ledger_id: headerLedgerId, debit: 0, credit: totalAmount });
            validRows.forEach(r => entries.push({ ledger_id: r.ledger_id, debit: Number(r.amount), credit: 0 }));
        }

        const formData = new FormData();
        formData.append('company_id', selectedCompany);
        formData.append('voucher_type', voucherType);
        formData.append('date', voucherDate);
        formData.append('narration', narration);

        const result = await createVoucher(formData, entries);
        if (result.success) {
            alert('Voucher Saved!');
            setRows([{ ledger_id: '', amount: '', search: '' }]);
            setNarration('');
            updateNextNo();
        } else alert(result.error);
    };

    if (loading) return <div>Loading...</div>;

    const pageTitle = {
        'receipt': 'Receipt', 'payment': 'Payment', 'sales': 'Sales', 'purchase': 'Purchase', 'contra': 'Contra', 'journal': 'Journal'
    }[voucherType];

    const containerClass = `${styles.tallyContainer} ${styles[voucherType]}`;

    return (
        <div className={containerClass}>
            <div className={styles.tallyHeader}>
                <div className={styles.headerLeft}>
                    <div className={styles.vNoLabel}>No.</div>
                    <div className={styles.vNoValue}>{nextNo}</div>
                </div>
                <div className={styles.headerCenter}>
                    <h1 className={styles.vType}>{pageTitle.toUpperCase()}</h1>
                </div>
                <div className={styles.headerRight}>
                    <div className={styles.vDateRow}>
                        <span>Date:</span>
                        <input type="date" value={voucherDate} onChange={e => setVoucherDate(e.target.value)} className={styles.tallyDateInput} />
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className={styles.tallyForm}>
                <div className={styles.tallyBody}>
                    <div className={styles.tallyRow}>
                        <div className={styles.tallyField}>
                            <label>Account :</label>
                            <LedgerSelector
                                ledgers={getHeaderLedgers()}
                                value={headerLedgerSearch}
                                onSelect={(ledger) => {
                                    setHeaderLedgerSearch(ledger.name);
                                    setHeaderLedgerId(ledger.id);
                                }}
                                placeholder="Select Account..."
                                autoFocus
                                required
                            />
                        </div>
                    </div>

                    <div className={styles.tallyEntries}>
                        <div className={styles.entriesHeader}>
                            <span style={{ flex: 3 }}>Particulars</span>
                            <span style={{ flex: 1, textAlign: 'right' }}>Amount</span>
                        </div>
                        {rows.map((row, index) => (
                            <div key={index} className={styles.tallyEntryRow}>
                                <div style={{ flex: 3 }}>
                                    <LedgerSelector
                                        ledgers={getRowLedgers()}
                                        value={row.search}
                                        onSelect={(ledger) => {
                                            const newRows = [...rows];
                                            newRows[index].search = ledger.name;
                                            newRows[index].ledger_id = ledger.id;
                                            setRows(newRows);
                                        }}
                                        placeholder="Particulars"
                                    />
                                </div>
                                <input
                                    type="number"
                                    value={row.amount}
                                    onChange={e => handleRowChange(index, 'amount', e.target.value)}
                                    className={`${styles.tallyInput} ${styles.amountField}`}
                                    style={{ flex: 1 }}
                                    placeholder="0.00"
                                    required
                                />
                                <button type="button" onClick={() => setRows(rows.filter((_, i) => i !== index))} className={styles.tallyRemoveBtn}>×</button>
                            </div>
                        ))}
                        <div className={styles.addBtnRow}>
                            <button type="button" onClick={() => setRows([...rows, { ledger_id: '', amount: '', search: '' }])} className={styles.tallyAddBtn}>+ Add Row</button>
                            <button type="button" onClick={() => setShowCreateLedger(true)} className={styles.tallyAddBtn}>+ Create Ledger</button>
                        </div>
                    </div>
                </div>

                <div className={styles.tallyFooter}>
                    <div className={styles.narrationRow}>
                        <label>Narration:</label>
                        <textarea value={narration} onChange={e => setNarration(e.target.value)} className={styles.tallyTextarea} placeholder="Enter details..."></textarea>
                    </div>
                    <div className={styles.footerActions}>
                        <div className={styles.tallyTotal}>
                            Total: ₹ {rows.reduce((sum, r) => sum + Number(r.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                        <button type="submit" className={styles.tallySubmitBtn}>Accept (Enter)</button>
                    </div>
                </div>
            </form>

            {/* Create Ledger Modal */}
            {showCreateLedger && (
                <div className={styles.modalOverlay}>
                    <div className={styles.tallyModal}>
                        <h3>Ledger Creation</h3>
                        <form onSubmit={handleCreateLedger} className={styles.tallyForm}>
                            <div className={styles.tallyRow}>
                                <label>Name:</label>
                                <input value={newLedgerName} onChange={e => setNewLedgerName(e.target.value)} className={styles.tallyInput} autoFocus required />
                            </div>
                            <div className={styles.tallyRow}>
                                <label>Under:</label>
                                <select value={newLedgerGroup} onChange={e => setNewLedgerGroup(e.target.value)} className={styles.tallyInput}>
                                    <option value="Sundry Debtors">Sundry Debtors</option>
                                    <option value="Sundry Creditors">Sundry Creditors</option>
                                    <option value="Direct Expenses">Direct Expenses</option>
                                    <option value="Indirect Expenses">Indirect Expenses</option>
                                    <option value="Sales Accounts">Sales Accounts</option>
                                    <option value="Purchase Accounts">Purchase Accounts</option>
                                </select>
                            </div>
                            <div className={styles.modalActions}>
                                <button type="button" onClick={() => setShowCreateLedger(false)} className={styles.tallyAddBtn}>Cancel</button>
                                <button type="submit" className={styles.tallySubmitBtn}>Create</button>
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
