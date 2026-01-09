'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { createVoucher, getLedgers, createLedger, getNextVoucherNumber } from '@/app/actions';
import { saveVoucherOffline } from '@/lib/syncManager';
import styles from '@/app/dashboard/vouchers/page.module.css';

export default function VoucherEntryForm({ companyId, type, onExit, userToken }) {
    const [ledgers, setLedgers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [nextNo, setNextNo] = useState('...');

    const [voucherDate, setVoucherDate] = useState(new Date().toISOString().split('T')[0]);
    const [narration, setNarration] = useState('');
    const [headerLedgerId, setHeaderLedgerId] = useState('');
    const [headerLedgerSearch, setHeaderLedgerSearch] = useState('');
    const [rows, setRows] = useState([{ ledger_id: '', amount: '', search: '' }]);
    const [showCreateLedger, setShowCreateLedger] = useState(false);
    const [newLedgerName, setNewLedgerName] = useState('');
    const [newLedgerGroup, setNewLedgerGroup] = useState('Sundry Debtors');

    useEffect(() => {
        const fetchUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUserId(user.id);
                const { data } = await supabase.from('users').select('role').eq('id', user.id).single();
                setUserRole(data?.role);
            }
        };
        fetchUser();
        if (companyId) {
            loadLedgers(companyId);
            updateNextNo();
        }
    }, [companyId, type]);

    const updateNextNo = async () => {
        const no = await getNextVoucherNumber(companyId, type);
        setNextNo(no);
    };

    const loadLedgers = async (cid) => {
        const { data } = await supabase.from('ledgers').select('*').eq('company_id', cid);
        if (data) setLedgers(data || []);
        setLoading(false);
    };

    const getHeaderLedgers = () => {
        const filterCash = (l) => {
            if (l.group_name === 'Bank Accounts') return true;
            if (l.group_name === 'Cash-in-hand') {
                if (userRole === 'admin') return true;
                return l.assigned_operator_id === userId;
            }
            return false;
        };

        switch (type) {
            case 'receipt': return ledgers.filter(l => filterCash(l));
            case 'payment': return ledgers.filter(l => filterCash(l));
            case 'sales': return ledgers.filter(l => l.group_name === 'Sundry Debtors' || filterCash(l));
            case 'purchase': return ledgers.filter(l => l.group_name === 'Sundry Creditors' || filterCash(l));
            case 'contra': return ledgers.filter(l => filterCash(l));
            default: return ledgers;
        }
    };

    const getRowLedgers = () => {
        const isCashOrBank = (l) => l.group_name === 'Cash-in-hand' || l.group_name === 'Bank Accounts';
        const filterCash = (l) => {
            if (l.group_name === 'Bank Accounts') return true;
            if (l.group_name === 'Cash-in-hand') {
                if (userRole === 'admin') return true;
                return l.assigned_operator_id === userId;
            }
            return false;
        };

        switch (type) {
            case 'receipt': return ledgers.filter(l => !isCashOrBank(l));
            case 'payment': return ledgers.filter(l => !isCashOrBank(l));
            case 'sales': return ledgers.filter(l => l.group_name === 'Sales Accounts');
            case 'purchase': return ledgers.filter(l => l.group_name === 'Purchase Accounts');
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

    const handleCreateLedger = async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('company_id', companyId);
        formData.append('name', newLedgerName);
        formData.append('group_name', newLedgerGroup);
        formData.append('opening_balance', 0);
        formData.append('is_cash_ledger', false);

        const result = await createLedger(formData);
        if (result.success) {
            setShowCreateLedger(false);
            setNewLedgerName('');
            loadLedgers(companyId);
        } else alert(result.error);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!headerLedgerId) return alert('Please select a valid Account');
        const validRows = rows.filter(r => r.ledger_id && Number(r.amount) > 0);
        if (validRows.length === 0) return alert('Add at least one valid entry');

        const entries = [];
        const totalAmount = validRows.reduce((sum, r) => sum + Number(r.amount), 0);
        if (type === 'receipt') {
            entries.push({ ledger_id: headerLedgerId, debit: totalAmount, credit: 0 });
            validRows.forEach(r => entries.push({ ledger_id: r.ledger_id, debit: 0, credit: Number(r.amount) }));
        } else if (type === 'payment') {
            entries.push({ ledger_id: headerLedgerId, debit: 0, credit: totalAmount });
            validRows.forEach(r => entries.push({ ledger_id: r.ledger_id, debit: Number(r.amount), credit: 0 }));
        } else if (type === 'sales') {
            entries.push({ ledger_id: headerLedgerId, debit: totalAmount, credit: 0 });
            validRows.forEach(r => entries.push({ ledger_id: r.ledger_id, debit: 0, credit: Number(r.amount) }));
        } else if (type === 'purchase') {
            entries.push({ ledger_id: headerLedgerId, debit: 0, credit: totalAmount });
            validRows.forEach(r => entries.push({ ledger_id: r.ledger_id, debit: Number(r.amount), credit: 0 }));
        } else if (type === 'contra') {
            entries.push({ ledger_id: headerLedgerId, debit: 0, credit: totalAmount });
            validRows.forEach(r => entries.push({ ledger_id: r.ledger_id, debit: Number(r.amount), credit: 0 }));
        } else if (type === 'journal') {
            // Simplify journal for now: Handled slightly differently in Tally but let's keep the core
            // Just one Dr and one Cr for now in this restricted UI
            validRows.forEach(r => entries.push({ ledger_id: r.ledger_id, debit: Number(r.amount), credit: 0 }));
        }

        if (!navigator.onLine) {
            const offlinePayload = {
                companyId,
                type,
                date: voucherDate,
                narration,
                entries
            };
            try {
                await saveVoucherOffline(offlinePayload);
                alert('⚠️ OFFLINE: Entry saved locally. It will sync automatically when you are back online.');
                setRows([{ ledger_id: '', amount: '', search: '' }]);
                setNarration('');
                return;
            } catch (err) {
                return alert('Failed to save offline: ' + err.message);
            }
        }

        const formData = new FormData();
        formData.append('company_id', companyId);
        formData.append('voucher_type', type);
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

    return (
        <div className={`${styles.tallyContainer}`}>
            <div className={styles.tallyHeader}>
                <div className={styles.headerLeft}>
                    <div className={styles.vNoLabel}>No.</div>
                    <div className={styles.vNoValue}>{nextNo}</div>
                </div>
                <div className={styles.headerCenter}>
                    <h1 className={styles.vType}>{type.toUpperCase()}</h1>
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
                            <input
                                list="header-ledgers"
                                value={headerLedgerSearch}
                                onChange={e => {
                                    setHeaderLedgerSearch(e.target.value);
                                    const match = getHeaderLedgers().find(l => l.name === e.target.value);
                                    if (match) setHeaderLedgerId(match.id);
                                }}
                                className={styles.tallyInput}
                                placeholder="Select Account..."
                                autoFocus
                                required
                            />
                            <datalist id="header-ledgers">
                                {getHeaderLedgers().map(l => <option key={l.id} value={l.name} />)}
                            </datalist>
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
                                    <input
                                        list={`row-ledgers-${index}`}
                                        value={row.search}
                                        onChange={e => handleRowChange(index, 'search', e.target.value)}
                                        className={styles.tallyInput}
                                        placeholder="Particulars"
                                        style={{ width: '100%' }}
                                        required
                                    />
                                    <datalist id={`row-ledgers-${index}`}>
                                        {getRowLedgers().map(l => <option key={l.id} value={l.name} />)}
                                    </datalist>
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
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button type="button" onClick={onExit} className={styles.tallyAddBtn}>Exit / Back</button>
                            <button type="submit" className={styles.tallySubmitBtn}>Accept (Enter)</button>
                        </div>
                    </div>
                </div>
            </form>

            {showCreateLedger && (
                <div className={styles.modalOverlay}>
                    <div className={styles.tallyModal}>
                        <h3>Ledger Creation</h3>
                        <form onSubmit={handleCreateLedger} className={styles.tallyForm}>
                            <div className={styles.tallyRow}><label>Name:</label><input value={newLedgerName} onChange={e => setNewLedgerName(e.target.value)} className={styles.tallyInput} autoFocus required /></div>
                            <div className={styles.tallyRow}>
                                <label>Under:</label>
                                <select value={newLedgerGroup} onChange={e => setNewLedgerGroup(e.target.value)} className={styles.tallyInput}>
                                    <option value="Sundry Debtors">Sundry Debtors</option>
                                    <option value="Sundry Creditors">Sundry Creditors</option>
                                    <option value="Direct Expenses">Direct Expenses</option>
                                    <option value="Indirect Expenses">Indirect Expenses</option>
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
