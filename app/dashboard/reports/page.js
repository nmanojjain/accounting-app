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

    // Summary State
    const [summary, setSummary] = useState({
        totalSales: 0,
        totalExpenses: 0,
        closingBalance: 0
    });

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

    // Calculate Summary whenever data changes
    useEffect(() => {
        if (reportType === 'daybook' && data.length > 0) {
            let sales = 0;
            let expenses = 0;

            data.forEach(v => {
                // Calculate Sales (Vouchers with type 'Sales')
                if (v.voucher_type === 'Sales') {
                    // Assuming the first credit entry is the sales amount or sum of credits
                    const creditSum = v.voucher_entries
                        .filter(e => Number(e.credit) > 0)
                        .reduce((sum, e) => sum + Number(e.credit), 0);
                    sales += creditSum;
                }

                // Calculate Expenses (Vouchers with type 'Payment' or 'Expense')
                if (v.voucher_type === 'Payment' || v.voucher_type === 'Expense') {
                    const debitSum = v.voucher_entries
                        .filter(e => Number(e.debit) > 0)
                        .reduce((sum, e) => sum + Number(e.debit), 0);
                    expenses += debitSum;
                }
            });

            setSummary({
                totalSales: sales,
                totalExpenses: expenses,
                closingBalance: 0 // Placeholder as we don't have full cash book context
            });
        } else {
            setSummary({ totalSales: 0, totalExpenses: 0, closingBalance: 0 });
        }
    }, [data, reportType]);

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

    const getMonthName = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleString('default', { month: 'short' });
    };

    const getDayNumber = (dateString) => {
        return dateString.split('-')[2];
    };

    // Generate dates for slider (e.g., +/- 2 days from selected date)
    const getSliderDates = () => {
        const dates = [];
        const current = new Date(fromDate);
        for (let i = -2; i <= 2; i++) {
            const d = new Date(current);
            d.setDate(d.getDate() + i);
            dates.push(d.toISOString().split('T')[0]);
        }
        return dates;
    };

    const handleDateClick = (dateStr) => {
        setFromDate(dateStr);
        setToDate(dateStr);
    };

    const fetchReport = async () => {
        if (!selectedCompany) return;
        if (!fromDate || !toDate) return;

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

            const debitGroups = [
                'Fixed Assets', 'Investments', 'Current Assets', 'Sundry Debtors',
                'Cash-in-hand', 'Bank Accounts', 'Deposits (Asset)', 'Loans & Advances (Asset)',
                'Purchase Accounts', 'Direct Expenses', 'Indirect Expenses',
                'Asset', 'Expense'
            ];
            const isDebitNature = debitGroups.includes(ledgerData.group_name);

            if (allEntries) {
                const validEntries = allEntries.filter(e => e.voucher);
                validEntries.sort((a, b) => new Date(a.voucher.date) - new Date(b.voucher.date));

                let running = Number(ledgerData.opening_balance);
                let periodOpening = running;
                const reportRows = [];

                validEntries.forEach(entry => {
                    const entryDate = entry.voucher.date;
                    const debit = Number(entry.debit);
                    const credit = Number(entry.credit);

                    if (isDebitNature) {
                        running += (debit - credit);
                    } else {
                        running += (credit - debit);
                    }

                    if (entryDate < fromDate) {
                        periodOpening = running;
                    } else if (entryDate >= fromDate && entryDate <= toDate) {
                        let particulars = entry.voucher.narration;
                        const siblings = entry.voucher.voucher_entries.filter(e => e.ledger?.name !== undefined);
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
            <div className={styles.title}>
                <select value={reportType} onChange={e => setReportType(e.target.value)} className={styles.select} style={{ fontSize: '1.25rem', fontWeight: 'bold', border: 'none', background: 'transparent', padding: 0, color: '#1e293b' }}>
                    <option value="daybook">Day Book</option>
                    <option value="ledger">Ledger View</option>
                </select>
            </div>

            {/* Date Slider for Day Book */}
            {reportType === 'daybook' && (
                <div className={styles.dateSlider}>
                    {getSliderDates().map(date => (
                        <div
                            key={date}
                            className={`${styles.dateCard} ${date === fromDate ? styles.active : ''}`}
                            onClick={() => handleDateClick(date)}
                        >
                            <span className={styles.dateCardMonth}>{getMonthName(date)}</span>
                            <span className={styles.dateCardDay}>{getDayNumber(date)}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Summary Cards for Day Book */}
            {reportType === 'daybook' && (
                <div className={styles.summaryGrid}>
                    <div className={styles.summaryCard}>
                        <div className={styles.summaryValue}>₹{summary.totalSales.toFixed(2)}</div>
                        <div className={styles.summaryLabel}>Total Sales</div>
                    </div>
                    <div className={styles.summaryCard}>
                        <div className={styles.summaryValue}>₹{summary.totalExpenses.toFixed(2)}</div>
                        <div className={styles.summaryLabel}>Total Expenses</div>
                    </div>
                </div>
            )}

            {/* Controls for Ledger View (Hidden in Day Book mostly) */}
            {reportType === 'ledger' && (
                <div className={styles.controls}>
                    <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} className={styles.select}>
                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select value={selectedLedger} onChange={e => setSelectedLedger(e.target.value)} className={styles.select}>
                        <option value="">Select Ledger</option>
                        {ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    <div className={styles.dateControls}>
                        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className={styles.input} />
                        <span>to</span>
                        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className={styles.input} />
                    </div>
                </div>
            )}

            <div className={styles.reportContent}>
                {loading ? <p style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</p> : (
                    <>
                        {/* Ledger Header Section */}
                        {reportType === 'ledger' && selectedLedger && (
                            <div className={styles.ledgerHeader}>
                                <div className={styles.ledgerTitle}>
                                    {ledgers.find(l => l.id === selectedLedger)?.name || 'Ledger Account'}
                                </div>
                                <div className={styles.ledgerPeriod}>
                                    {formatDate(fromDate)} to {formatDate(toDate)}
                                </div>
                            </div>
                        )}

                        {/* Scrollable Table Container */}
                        <div className={styles.tableContainer}>
                            {reportType === 'daybook' && (
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th className={styles.colDate}>Date</th>
                                            <th className={styles.colParticulars}>Particulars</th>
                                            <th className={styles.colType}>Vch Type</th>
                                            <th className={styles.colNo}>Vch No</th>
                                            <th className={styles.colAmount}>Debit</th>
                                            <th className={styles.colAmount}>Credit</th>
                                            {userRole === 'admin' && <th className={styles.colAction}>Action</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.length === 0 ? (
                                            <tr><td colSpan={userRole === 'admin' ? 7 : 6} style={{ textAlign: 'center', padding: '2rem' }}>No vouchers found.</td></tr>
                                        ) : (
                                            data.map(v => {
                                                const entries = v.voucher_entries || [];
                                                const isCancelled = entries.length === 0 || v.narration?.startsWith('CANCELLED:');

                                                if (isCancelled) {
                                                    return (
                                                        <tr key={v.id} className={styles.cancelledRow}>
                                                            <td data-label="Date">{formatDate(v.date)}</td>
                                                            <td data-label="Particulars" style={{ color: '#e74c3c', fontStyle: 'italic' }}>
                                                                {v.narration || 'CANCELLED'}
                                                            </td>
                                                            <td data-label="Type">{v.voucher_type}</td>
                                                            <td data-label="No">{v.voucher_number || '-'}</td>
                                                            <td data-label="Debit">-</td>
                                                            <td data-label="Credit">-</td>
                                                            {userRole === 'admin' && <td data-label="Action">Cancelled</td>}
                                                        </tr>
                                                    );
                                                }

                                                // Sort entries: Debits first, then Credits
                                                entries.sort((a, b) => (Number(b.debit || 0) - Number(a.debit || 0)));

                                                return entries.map((entry, index) => {
                                                    const isDebit = Number(entry.debit) > 0;
                                                    const isCredit = Number(entry.credit) > 0;
                                                    const isFirst = index === 0;

                                                    return (
                                                        <tr key={`${v.id}-${index}`} className={isFirst ? styles.voucherStartRow : ''}>
                                                            <td className={styles.colDate} data-label="Date">{isFirst ? formatDate(v.date) : ''}</td>
                                                            <td className={styles.colParticulars} data-label="Particulars">
                                                                <div className={styles.particularsMain}>
                                                                    {isCredit ? 'To ' : ''}{entry.ledger?.name}
                                                                </div>
                                                                {isFirst && <div className={styles.particularsSub}>{v.narration}</div>}
                                                            </td>
                                                            <td className={styles.colType} data-label="Type">{isFirst ? v.voucher_type : ''}</td>
                                                            <td className={styles.colNo} data-label="No">{isFirst ? (v.voucher_number || '-') : ''}</td>
                                                            <td className={styles.colAmount} data-label="Debit">{isDebit ? Number(entry.debit).toFixed(2) : ''}</td>
                                                            <td className={styles.colAmount} data-label="Credit">{isCredit ? Number(entry.credit).toFixed(2) : ''}</td>
                                                            {userRole === 'admin' && (
                                                                <td className={styles.colAction} data-label="Action">
                                                                    {isFirst && (
                                                                        <button
                                                                            onClick={() => setEditingVoucher(v)}
                                                                            className={styles.deleteBtn}
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
                                            <th className={styles.colDate}>Date</th>
                                            <th className={styles.colParticulars}>Particulars</th>
                                            <th className={styles.colType}>Vch Type</th>
                                            <th className={styles.colNo}>Vch No</th>
                                            <th className={styles.colAmount}>Debit</th>
                                            <th className={styles.colAmount}>Credit</th>
                                            <th className={styles.colAmount}>Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className={styles.openingRow}>
                                            <td colSpan="6">Opening Balance</td>
                                            <td className={styles.colAmount} data-label="Balance">{(openingBalance || 0).toFixed(2)}</td>
                                        </tr>
                                        {data.length === 0 ? (
                                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No transactions in this period.</td></tr>
                                        ) : (
                                            data.map((entry, index) => (
                                                <tr key={index}>
                                                    <td className={styles.colDate} data-label="Date">{formatDate(entry.voucher?.date)}</td>
                                                    <td className={styles.colParticulars} data-label="Particulars">
                                                        <div className={styles.particularsMain}>{entry.particulars}</div>
                                                    </td>
                                                    <td className={styles.colType} data-label="Type">{entry.voucher?.voucher_type || '-'}</td>
                                                    <td className={styles.colNo} data-label="No">{entry.voucher?.voucher_number || '-'}</td>
                                                    <td className={styles.colAmount} data-label="Debit">{entry.debit > 0 ? Number(entry.debit).toFixed(2) : ''}</td>
                                                    <td className={styles.colAmount} data-label="Credit">{entry.credit > 0 ? Number(entry.credit).toFixed(2) : ''}</td>
                                                    <td className={styles.colAmount} data-label="Balance">{(entry.balance || 0).toFixed(2)}</td>
                                                </tr>
                                            ))
                                        )}
                                        <tr className={styles.closingRow}>
                                            <td colSpan="6">Closing Balance</td>
                                            <td className={styles.colAmount} data-label="Balance">{data.length > 0 ? (data[data.length - 1].balance || 0).toFixed(2) : (openingBalance || 0).toFixed(2)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
                )}
            </div>

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
        </div>
    );
}
