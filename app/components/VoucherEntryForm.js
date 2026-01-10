'use client';

import { useState, useEffect, useRef } from 'react';
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
    const firstAmountRef = useRef(null);

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
        setLoading(true);
        const data = await getLedgers(cid);
        if (data) setLedgers(data || []);
        setLoading(false);
    };

    const getHeaderLedgers = () => {
        const isCashOrBank = (l) => {
            if (l.group_name === 'Bank Accounts') return true;
            if (l.group_name === 'Cash-in-hand') {
                if (userRole === 'admin') return true;
                return l.assigned_operator_id === userId;
            }
            return false;
        };

        switch (type) {
            case 'receipt':
            case 'payment':
            case 'contra':
                return ledgers.filter(isCashOrBank);
            case 'sales':
                // Header for Sales can be Party or Cash/Bank
                return ledgers.filter(l => l.group_name === 'Sundry Debtors' || isCashOrBank(l));
            case 'purchase':
                // Header for Purchase can be Party or Cash/Bank
                return ledgers.filter(l => l.group_name === 'Sundry Creditors' || isCashOrBank(l));
            case 'journal':
                return ledgers.filter(l => !isCashOrBank(l));
            default:
                return ledgers;
        }
    };

    const getRowLedgers = () => {
        const isCashOrBank = (l) => l.group_name === 'Cash-in-hand' || l.group_name === 'Bank Accounts';

        switch (type) {
            case 'receipt':
                // Cash/Bank coming in from: Debtors, Incomes, Capital, or even Creditors (refunds)
                return ledgers.filter(l =>
                    l.group_name === 'Sundry Debtors' ||
                    l.group_name === 'Direct Incomes' ||
                    l.group_name === 'Indirect Incomes' ||
                    l.group_name === 'Capital Account' ||
                    l.group_name === 'Sundry Creditors'
                );
            case 'payment':
                // Cash/Bank going out to: Creditors, Expenses, Debtors (refunds), or Assets
                return ledgers.filter(l =>
                    l.group_name === 'Sundry Creditors' ||
                    l.group_name === 'Direct Expenses' ||
                    l.group_name === 'Indirect Expenses' ||
                    l.group_name === 'Sundry Debtors' ||
                    l.group_name === 'Purchase Accounts' ||
                    l.group_name === 'Current Assets'
                );
            case 'sales':
                // Sales entries: Credit Sales Account and Duties/Taxes
                return ledgers.filter(l =>
                    l.group_name === 'Sales Accounts' ||
                    l.group_name === 'Direct Incomes' ||
                    l.group_name === 'Duties & Taxes'
                );
            case 'purchase':
                // Purchase entries: Debit Purchase Account, Expenses, and Duties/Taxes
                return ledgers.filter(l =>
                    l.group_name === 'Purchase Accounts' ||
                    l.group_name === 'Direct Expenses' ||
                    l.group_name === 'Indirect Expenses' ||
                    l.group_name === 'Duties & Taxes'
                );
            case 'contra':
                return ledgers.filter(isCashOrBank);
            case 'journal':
                // Journal entries exclude Cash/Bank
                return ledgers.filter(l => !isCashOrBank(l));
            default:
                return ledgers;
        }
    };

    useEffect(() => {
        if (!loading && ledgers.length > 0) {
            const isFresh = rows.length === 1 && !rows[0].ledger_id;
            if (isFresh) {
                if (type === 'sales') {
                    const sl = ledgers.find(l => l.group_name === 'Sales Accounts');
                    if (sl) setRows([{ ledger_id: sl.id, amount: '', search: sl.name, isAuto: true }]);
                } else if (type === 'purchase') {
                    const pl = ledgers.find(l => l.group_name === 'Purchase Accounts');
                    if (pl) setRows([{ ledger_id: pl.id, amount: '', search: pl.name, isAuto: true }]);
                }
            }
        }
    }, [type, ledgers, loading]);

    const handleRowChange = (index, field, value) => {
        const newRows = [...rows];
        if (field === 'search') {
            newRows[index].search = value;
            newRows[index].isAuto = false; // User manually typed, remove auto flag
            const match = getRowLedgers().find(l => l.name === value);
            if (match) newRows[index].ledger_id = match.id;
        } else {
            newRows[index][field] = value;
        }
        setRows(newRows);
    };

    const handleHeaderMatch = (match) => {
        setHeaderLedgerId(match.id);
        setHeaderLedgerSearch(match.name);
        // If it's Sales/Purchase and the first row is already auto-filled, move focus directly to the amount
        if ((type === 'sales' || type === 'purchase') && rows[0]?.isAuto) {
            setTimeout(() => firstAmountRef.current?.focus(), 50);
        }
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
        <div className={styles.tallyContainer}>
            {/* Compact Header: [No. XXX] [TYPE] [DATE] */}
            <div className={styles.tallyHeaderCompact}>
                <div className={styles.vNoGroup}>
                    <span className={styles.vNoLabel}>No.</span>
                    <span className={styles.vNoValue}>{nextNo}</span>
                </div>
                <div className={styles.vTypeGroup}>
                    <h2 className={styles.vTypeSmall}>{type.toUpperCase()}</h2>
                </div>
                <div className={styles.vDateGroup}>
                    <input
                        type="date"
                        value={voucherDate}
                        onChange={e => setVoucherDate(e.target.value)}
                        className={styles.tallyDateInputSmall}
                    />
                </div>
            </div>

            <form onSubmit={handleSubmit} className={styles.tallyFormCompact}>
                <div className={styles.tallyBodyCompact}>
                    {/* Account Selection (Handy Search for Parties in Sales/Purchase) */}
                    <div className={styles.accountSelection}>
                        <label>Account :</label>
                        {(type === 'receipt' || type === 'payment' || type === 'contra') ? (
                            <select
                                value={headerLedgerId}
                                onChange={e => {
                                    const match = ledgers.find(l => l.id === e.target.value);
                                    if (match) handleHeaderMatch(match);
                                }}
                                className={styles.tallyInputCompact}
                                autoFocus
                                required
                            >
                                <option value="">Select Cash/Bank...</option>
                                {getHeaderLedgers().map(l => (
                                    <option key={l.id} value={l.id}>{l.name}</option>
                                ))}
                            </select>
                        ) : (
                            <div style={{ flex: 1 }}>
                                <input
                                    list="header-ledgers"
                                    value={headerLedgerSearch}
                                    onChange={e => {
                                        setHeaderLedgerSearch(e.target.value);
                                        const match = getHeaderLedgers().find(l => l.name === e.target.value);
                                        if (match) handleHeaderMatch(match);
                                    }}
                                    className={styles.tallyInputCompact}
                                    placeholder="Search Party / Cash / Bank..."
                                    autoFocus
                                    required
                                />
                                <datalist id="header-ledgers">
                                    {getHeaderLedgers().map(l => <option key={l.id} value={l.name} />)}
                                </datalist>
                            </div>
                        )}
                    </div>

                    {/* Entries Section with Separate Labels */}
                    <div className={styles.entriesSectionCompact}>
                        <div className={styles.entriesLabels}>
                            <span className={styles.labelParticulars}>Particulars</span>
                            <span className={styles.labelAmount}>Amount</span>
                            <span className={styles.labelAction}></span>
                        </div>

                        <div className={styles.entriesListScrollable}>
                            {rows.map((row, index) => (
                                <div key={index} className={styles.tallyEntryRowCompact}>
                                    <div className={styles.particularsField}>
                                        <input
                                            list={`row-ledgers-${index}`}
                                            value={row.search}
                                            onChange={e => handleRowChange(index, 'search', e.target.value)}
                                            className={`${styles.tallyInputCompact} ${row.isAuto ? styles.autoSelectedLedger : ''}`}
                                            placeholder="Particulars"
                                            readOnly={row.isAuto && index === 0}
                                            required
                                        />
                                        <datalist id={`row-ledgers-${index}`}>
                                            {getRowLedgers().map(l => <option key={l.id} value={l.name} />)}
                                        </datalist>
                                    </div>
                                    <div className={styles.amountFieldContainer}>
                                        <input
                                            ref={index === 0 ? firstAmountRef : null}
                                            type="number"
                                            value={row.amount}
                                            onChange={e => handleRowChange(index, 'amount', e.target.value)}
                                            className={`${styles.tallyInputCompact} ${styles.amountField}`}
                                            placeholder="0.00"
                                            required
                                        />
                                    </div>
                                    <div className={styles.actionField}>
                                        <button
                                            type="button"
                                            onClick={() => setRows(rows.filter((_, i) => i !== index))}
                                            className={styles.tallyRemoveBtnSmall}
                                            disabled={row.isAuto && rows.length === 1}
                                        >×</button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className={styles.addBtnRowCompact}>
                            <button type="button" onClick={() => setRows([...rows, { ledger_id: '', amount: '', search: '' }])} className={styles.tallyAddBtnSmall}>+ Row</button>
                            <button type="button" onClick={() => setShowCreateLedger(true)} className={styles.tallyAddBtnSmall}>+ Ledger</button>
                        </div>
                    </div>
                </div>

                <div className={styles.tallyFooterCompact}>
                    <div className={styles.narrationRowCompact}>
                        <label>Narration:</label>
                        <textarea
                            value={narration}
                            onChange={e => setNarration(e.target.value)}
                            className={styles.tallyTextareaSmall}
                            placeholder="Details..."
                        />
                    </div>

                    <div className={styles.footerActionsCompact}>
                        <div className={styles.tallyTotalBlinking}>
                            Total: ₹ {rows.reduce((sum, r) => sum + Number(r.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                        <div className={styles.actionButtonsCompact}>
                            <button type="button" onClick={onExit} className={styles.tallyExitBtn}>Exit</button>
                            <button type="submit" className={styles.tallyAcceptBtn}>Accept</button>
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
                                    <optgroup label="Liabilities">
                                        <option value="Sundry Creditors">Sundry Creditors</option>
                                        <option value="Duties & Taxes">Duties & Taxes</option>
                                        <option value="Provisions">Provisions</option>
                                        <option value="Capital Account">Capital Account</option>
                                    </optgroup>
                                    <optgroup label="Assets">
                                        <option value="Sundry Debtors">Sundry Debtors</option>
                                        <option value="Bank Accounts">Bank Accounts</option>
                                        <option value="Cash-in-hand">Cash-in-hand</option>
                                        <option value="Current Assets">Current Assets</option>
                                    </optgroup>
                                    <optgroup label="Incomes">
                                        <option value="Sales Accounts">Sales Accounts</option>
                                        <option value="Direct Incomes">Direct Incomes</option>
                                        <option value="Indirect Incomes">Indirect Incomes</option>
                                    </optgroup>
                                    <optgroup label="Expenses">
                                        <option value="Purchase Accounts">Purchase Accounts</option>
                                        <option value="Direct Expenses">Direct Expenses</option>
                                        <option value="Indirect Expenses">Indirect Expenses</option>
                                    </optgroup>
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
