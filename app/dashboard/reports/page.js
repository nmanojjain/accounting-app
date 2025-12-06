'use client';
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { deleteVoucher, cancelVoucher, getAccessibleCompanies, getLedgers, getDayBook, getLedgerEntries } from '@/app/actions';
import styles from './page.module.css';

import EditVoucherModal from '@/app/components/EditVoucherModal';

export default function ReportsPage() {
    const [companies, setCompanies] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState('');
    const [reportType, setReportType] = useState('daybook');

    // Ledger View State
    const [ledgers, setLedgers] = useState([]);
    const [selectedLedger, setSelectedLedger] = useState('');

    // Date Range State
    const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]);
    const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [openingBalance, setOpeningBalance] = useState(0);

    const [userRole, setUserRole] = useState(null);

    // Edit Modal State
    const [editingVoucher, setEditingVoucher] = useState(null);

    useEffect(() => {
        fetchUserRole();
        loadCompanies();
    }, []);

    useEffect(() => {
        if (selectedCompany) {
            if (reportType === 'ledger') {
                fetchLedgers();
            }
            fetchReport();
        }
    }, [selectedCompany, reportType, fromDate, toDate, selectedLedger]);

    const fetchUserRole = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase.from('users').select('role').eq('id', user.id).single();
            setUserRole(data?.role);
        }
    };

    const loadCompanies = async () => {
        const data = await getAccessibleCompanies();
        if (data && data.length > 0) {
            setCompanies(data);
            setSelectedCompany(data[0].id);
        }
    };

    const fetchLedgers = async () => {
        const data = await getLedgers(selectedCompany);
        if (data) setLedgers(data);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const [year, month, day] = dateString.split('-');
        return `${day}-${month}-${year}`;
    };

    const fetchReport = async () => {
        if (!selectedCompany) return;
        if (!fromDate || !toDate) return; // Prevent fetching with empty dates

        setLoading(true);
        setData([]);
        setOpeningBalance(0);

        if (reportType === 'daybook') {
            const result = await getDayBook(selectedCompany, fromDate, toDate);
            if (result.success) {
                setData(result.data);
            } else {
                console.error(result.error);
            }
        } else if (reportType === 'ledger' && selectedLedger) {
            const result = await getLedgerEntries(selectedCompany, selectedLedger);

            if (!result.success) {
                console.error(result.error);
                setLoading(false);
                return;
            }

            const { ledgerData, allEntries } = result;

            // Determine Debit/Credit Nature
            const debitGroups = [
                'Fixed Assets', 'Investments', 'Current Assets', 'Sundry Debtors',
                'Cash-in-hand', 'Bank Accounts', 'Deposits (Asset)', 'Loans & Advances (Asset)',
                'Purchase Accounts', 'Direct Expenses', 'Indirect Expenses',
                'Asset', 'Expense'
            ];
            const isDebitNature = debitGroups.includes(ledgerData.group_name);

            if (allEntries) {
                // Filter out entries with missing voucher data
                const validEntries = allEntries.filter(e => e.voucher);

                // Sort manually because deep sort might fail if nulls
                validEntries.sort((a, b) => new Date(a.voucher.date) - new Date(b.voucher.date));

                let running = Number(ledgerData.opening_balance);
                let periodOpening = running;
                const reportRows = [];

                validEntries.forEach(entry => {
                    const entryDate = entry.voucher.date;
                    const debit = Number(entry.debit);
                    const credit = Number(entry.credit);

                    // Update running balance
                    if (isDebitNature) {
                        running += (debit - credit);
                    } else {
                        running += (credit - debit);
                    }

                    if (entryDate < fromDate) {
                        periodOpening = running;
                    } else if (entryDate >= fromDate && entryDate <= toDate) {
                        // Determine Particulars (Contra Entry)
                        let particulars = entry.voucher.narration; // Fallback
                        const siblings = entry.voucher.voucher_entries.filter(e => e.ledger?.name !== undefined); // All entries in voucher

                        // If I am Debit, look for Credits
                        // If I am Credit, look for Debits
                        const mySide = debit > 0 ? 'debit' : 'credit';
                        const otherSideEntries = siblings.filter(s => (mySide === 'debit' ? s.credit > 0 : s.debit > 0));

                        if (otherSideEntries.length > 0) {
                            const prefix = mySide === 'debit' ? 'To' : 'By';
                            const names = otherSideEntries.map(s => s.ledger?.name).join(', ');
                            particulars = `${prefix} ${names}`;
                        }

                        reportRows.push({
                            ...entry,
                            particulars,
                            balance: running
                        });
                    }
                });

                setOpeningBalance(periodOpening);
                setData(reportRows);
            }
        }
        setLoading(false);
    };

    const handlePrevDay = () => {
        const prev = new Date(fromDate);
        prev.setDate(prev.getDate() - 1);
        const dateStr = prev.toISOString().split('T')[0];
        setFromDate(dateStr);
        setToDate(dateStr);
    };

    const handleNextDay = () => {
        const next = new Date(fromDate);
        next.setDate(next.getDate() + 1);
        const dateStr = next.toISOString().split('T')[0];
        setFromDate(dateStr);
        setToDate(dateStr);
    };

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Reports</h1>

            <div className={styles.controls}>
                <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} className={styles.select}>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={reportType} onChange={e => setReportType(e.target.value)} className={styles.select}>
                    <option value="daybook">Day Book</option>
                    <option value="ledger">Ledger View</option>
                </select>

                {reportType === 'ledger' && (
                    <select value={selectedLedger} onChange={e => setSelectedLedger(e.target.value)} className={styles.select}>
                        <option value="">Select Ledger</option>
                        {ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                )}

                <div className={styles.dateControls}>
                    <button onClick={handlePrevDay} className={styles.navBtn}>&lt;</button>
                    <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className={styles.input} />
                    <span>to</span>
                    <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className={styles.input} />
                    <button onClick={handleNextDay} className={styles.navBtn}>&gt;</button>
                </div>
            </div>

            <div className={styles.reportContent}>
                {loading ? <p>Loading...</p> : (
                    <>
                        {reportType === 'daybook' && (
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Particulars</th>
                                        <th>Vch Type</th>
                                        <th>Vch No</th>
                                        <th>Debit</th>
                                        <th>Credit</th>
                                        {userRole === 'admin' && <th>Action</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.length === 0 ? (
                                        <tr><td colSpan={userRole === 'admin' ? 7 : 6} style={{ textAlign: 'center' }}>No vouchers found.</td></tr>
                                    ) : (
                                        data.map(v => {
                                            const entries = v.voucher_entries || [];
                                            const isCancelled = entries.length === 0 || v.narration?.startsWith('CANCELLED:');

                                            if (isCancelled) {
                                                return (
                                                    <tr key={v.id} className={styles.cancelledRow}>
                                                        <td>{formatDate(v.date)}</td>
                                                        <td style={{ color: '#e74c3c', fontStyle: 'italic' }}>
                                                            {v.narration || 'CANCELLED'}
                                                        </td>
                                                        <td>{v.voucher_type}</td>
                                                        <td>{v.voucher_number || '-'}</td>
                                                        <td>-</td>
                                                        <td>-</td>
                                                        {userRole === 'admin' && <td>Cancelled</td>}
                                                    </tr>
                                                );
                                            }

                                            // Sort entries: Debits first, then Credits
                                            entries.sort((a, b) => (Number(b.debit || 0) - Number(a.debit || 0)));

                                            return entries.map((entry, index) => {
                                                const isDebit = Number(entry.debit) > 0;
                                                const isCredit = Number(entry.credit) > 0;

                                                // Only show Date, Type, No, Action on the FIRST row of the voucher
                                                const isFirst = index === 0;

                                                return (
                                                    <tr key={`${v.id}-${index}`} className={isFirst ? styles.voucherStartRow : ''}>
                                                        <td>{isFirst ? formatDate(v.date) : ''}</td>
                                                        <td>
                                                            <div className={styles.particularsMain}>
                                                                {isCredit ? 'To ' : ''}{entry.ledger?.name}
                                                            </div>
                                                            {isFirst && <div className={styles.particularsSub}>{v.narration}</div>}
                                                        </td>
                                                        <td>{isFirst ? v.voucher_type : ''}</td>
                                                        <td>{isFirst ? (v.voucher_number || '-') : ''}</td>
                                                        <td>{isDebit ? Number(entry.debit).toFixed(2) : ''}</td>
                                                        <td>{isCredit ? Number(entry.credit).toFixed(2) : ''}</td>
                                                        {userRole === 'admin' && (
                                                            <td>
                                                                {isFirst && (
                                                                    <button
                                                                        onClick={() => setEditingVoucher(v)}
                                                                        className={styles.deleteBtn}
                                                                        style={{ backgroundColor: '#3498db' }}
                                                                    >
                                                                        Edit
                                                                    </button>
                                                                )}
                                                            </td>
                                                        )}
                                                    </tr>
                                                );
                                            });
                                        })
                                    )}
                                </tbody>
                            </table>
                        )}

                        {reportType === 'ledger' && (
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Particulars</th>
                                        <th>Vch Type</th>
                                        <th>Vch No</th>
                                        <th>Debit</th>
                                        <th>Credit</th>
                                        <th>Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className={styles.openingRow}>
                                        <td colSpan="6">Opening Balance</td>
                                        <td>{(openingBalance || 0).toFixed(2)}</td>
                                    </tr>
                                    {data.length === 0 ? (
                                        <tr><td colSpan="7" style={{ textAlign: 'center' }}>No transactions in this period.</td></tr>
                                    ) : (
                                        data.map((entry, index) => (
                                            <tr key={index}>
                                                <td>{formatDate(entry.voucher?.date)}</td>
                                                <td>{entry.particulars}</td>
                                                <td>{entry.voucher?.voucher_type || '-'}</td>
                                                <td>{entry.voucher?.voucher_number || '-'}</td>
                                                <td>{entry.debit > 0 ? Number(entry.debit).toFixed(2) : ''}</td>
                                                <td>{entry.credit > 0 ? Number(entry.credit).toFixed(2) : ''}</td>
                                                <td>{(entry.balance || 0).toFixed(2)}</td>
                                            </tr>
                                        ))
                                    )}
                                    <tr className={styles.closingRow}>
                                        <td colSpan="6">Closing Balance</td>
                                        <td>{data.length > 0 ? (data[data.length - 1].balance || 0).toFixed(2) : (openingBalance || 0).toFixed(2)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        )}
                    </>
                )
                }
            </div >

            {editingVoucher && (
                <EditVoucherModal
                    voucher={editingVoucher}
                    companyId={selectedCompany}
                    onClose={() => setEditingVoucher(null)}
                    onUpdate={() => {
                        setEditingVoucher(null);
                        fetchReport();
                    }}
                />
            )}
        </div >
    );
}
