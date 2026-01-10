'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { deleteVoucher, cancelVoucher, getAccessibleCompanies, getLedgers, getDayBook, getLedgerEntries } from '@/app/actions';
import styles from './page.module.css';
import Button from '@/components/Button';

import EditVoucherModal from '@/app/components/EditVoucherModal';

export default function ReportsPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [companies, setCompanies] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState(params?.companyId || searchParams.get('companyId') || '');
    const [reportType, setReportType] = useState(searchParams.get('type') || 'daybook');

    useEffect(() => {
        const type = searchParams.get('type');
        if (type) setReportType(type);
    }, [searchParams]);

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
                        ?.filter(e => Number(e.credit) > 0)
                        .reduce((sum, e) => sum + Number(e.credit), 0) || 0;
                    sales += creditSum;
                }

                // Calculate Expenses (Vouchers with type 'Payment' or 'Expense')
                if (v.voucher_type === 'Payment' || v.voucher_type === 'Expense') {
                    const debitSum = v.voucher_entries
                        ?.filter(e => Number(e.debit) > 0)
                        .reduce((sum, e) => sum + Number(e.debit), 0) || 0;
                    expenses += debitSum;
                }
            });

            setSummary({
                totalSales: sales,
                totalExpenses: expenses,
                closingBalance: 0 // Placeholder
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
            if (!selectedCompany) {
                setSelectedCompany(data[0].id);
            }
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

    // Generate dates for slider
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
            }
        } else if (reportType === 'ledger' && selectedLedger) {
            const result = await getLedgerEntries(selectedLedger, fromDate, toDate);
            if (result.success) {
                const { entries, opening_balance } = result.data;
                const periodOpening = Number(opening_balance);
                let running = periodOpening;

                const reportRows = [];
                entries.forEach(entry => {
                    const debit = Number(entry.debit);
                    const credit = Number(entry.credit);
                    running += (debit - credit);

                    // Find "the other side" for particulars
                    const v = entry.voucher;
                    if (v && v.voucher_entries) {
                        const siblings = v.voucher_entries;
                        const mySide = debit > 0 ? 'debit' : 'credit';
                        const otherSideEntries = siblings.filter(s => (mySide === 'debit' ? s.credit > 0 : s.debit > 0));

                        let particulars = '';
                        if (otherSideEntries.length > 0) {
                            const prefix = mySide === 'debit' ? 'To' : 'By';
                            const names = otherSideEntries.map(s => s.ledger?.name).join(', ');
                            particulars = `${prefix} ${names}`;
                        } else {
                            particulars = entry.particulars || 'Self';
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

    return (
        <div className={styles.container}>
            <div className={`${styles.headerRow} stack-on-mobile`}>
                <div className={styles.title}>
                    <select value={reportType} onChange={e => setReportType(e.target.value)} className={styles.reportSelector}>
                        <option value="daybook">Day Book</option>
                        <option value="ledger">PARTY LEDGER (Statement)</option>
                    </select>
                </div>
                {selectedCompany && (
                    <Button onClick={() => router.push(`/dashboard/c/${selectedCompany}`)} variant="secondary" size="small">
                        ← Exit to Workspace
                    </Button>
                )}
            </div>

            {/* Date Slider for Day Book */}
            {reportType === 'daybook' && (
                <div className={styles.dateSlider}>
                    {getSliderDates().map(date => (
                        <div
                            key={date}
                            className={`${styles.dateCard} ${date === fromDate && fromDate === toDate ? styles.active : ''}`}
                            onClick={() => handleDateClick(date)}
                        >
                            <span className={styles.dateCardMonth}>{getMonthName(date)}</span>
                            <span className={styles.dateCardDay}>{getDayNumber(date)}</span>
                        </div>
                    ))}
                </div>
            )}

            <div className={styles.controls}>
                {!(params?.companyId || searchParams.get('companyId')) && (
                    <div className={styles.controlGroup}>
                        <label>Workspace</label>
                        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} className={styles.select}>
                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                )}

                {reportType === 'ledger' && (
                    <div className={styles.controlGroup}>
                        <label>Ledger</label>
                        <select value={selectedLedger} onChange={e => setSelectedLedger(e.target.value)} className={styles.select}>
                            <option value="">Select Ledger</option>
                            {ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </div>
                )}

                <div className={styles.controlGroup}>
                    <label>Period</label>
                    <div className={styles.dateControls}>
                        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className={styles.input} />
                        <span className={styles.toLabel}>to</span>
                        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className={styles.input} />
                        <button
                            type="button"
                            className={styles.selectAllBtn}
                            onClick={() => {
                                const company = companies.find(c => c.id === selectedCompany);
                                if (company?.financial_year) {
                                    // Parse "2023-24" or similar
                                    const parts = company.financial_year.split('-');
                                    const startYear = parts[0];
                                    let endYear = parts[0];
                                    if (parts[1]) {
                                        if (parts[1].length === 2) {
                                            endYear = startYear.substring(0, 2) + parts[1];
                                        } else {
                                            endYear = parts[1];
                                        }
                                    }
                                    setFromDate(`${startYear}-04-01`);
                                    setToDate(`${endYear}-03-31`);
                                } else {
                                    // Fallback to current calendar year if FY not found
                                    const year = new Date().getFullYear();
                                    setFromDate(`${year}-01-01`);
                                    setToDate(`${year}-12-31`);
                                }
                            }}
                        >
                            Select All (FY)
                        </button>
                    </div>
                </div>
            </div>

            <div className={styles.reportContent}>
                {loading ? <p style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</p> : (
                    <>
                        <div className={`${styles.tableContainer} ${fromDate === toDate ? styles.singleDay : ''}`}>
                            {reportType === 'daybook' && (
                                <table className={`${styles.table} responsive-table`}>
                                    <thead>
                                        <tr>
                                            <th className={styles.colDate}>Date</th>
                                            <th className={styles.colParticulars}>Particulars</th>
                                            <th className={styles.colType}>Type</th>
                                            <th className={styles.colNo}>No</th>
                                            <th className={styles.colDebit}>Debit</th>
                                            <th className={styles.colCredit}>Credit</th>
                                            {userRole === 'admin' && <th className={styles.colAction}>Action</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.length === 0 ? (
                                            <tr><td colSpan={userRole === 'admin' ? 7 : 6} style={{ textAlign: 'center', padding: '2rem' }}>No transactions found.</td></tr>
                                        ) : (
                                            data.map((v, vIndex) => {
                                                const entries = v.voucher_entries || [];
                                                const isCancelled = v.status === 'cancelled' || (v.narration && v.narration.startsWith('CANCELLED:'));

                                                if (isCancelled) {
                                                    return (
                                                        <tr key={v.id} className={`${styles.cancelledVoucher} ${vIndex % 2 === 0 ? styles.evenVoucher : styles.oddVoucher}`}>
                                                            <td className={styles.colDate} data-label="Date">{formatDate(v.date)}</td>
                                                            <td data-label="Particulars">
                                                                <div className={styles.particularsMain} style={{ color: '#ef4444' }}>{v.narration}</div>
                                                            </td>
                                                            <td data-label="Type">{v.voucher_type?.toUpperCase()}</td>
                                                            <td data-label="No">{v.voucher_number || '-'}</td>
                                                            <td className={styles.colDebit} data-label="Debit">0.00</td>
                                                            <td className={styles.colCredit} data-label="Credit">0.00</td>
                                                            {userRole === 'admin' && (
                                                                <td data-label="Action">
                                                                    <button
                                                                        onClick={() => setEditingVoucher(v)}
                                                                        className={styles.editBtn}
                                                                        style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                                                                    >
                                                                        RE-EDIT
                                                                    </button>
                                                                </td>
                                                            )}
                                                        </tr>
                                                    );
                                                }

                                                // Sort entries: Debits first
                                                const sortedEntries = [...entries].sort((a, b) => (Number(b.debit || 0) - Number(a.debit || 0)));

                                                return sortedEntries.map((entry, index) => {
                                                    const isDebit = Number(entry.debit) > 0;
                                                    const isCredit = Number(entry.credit) > 0;
                                                    const isFirst = index === 0;

                                                    return (
                                                        <tr key={`${v.id}-${index}`} className={`${isFirst ? styles.voucherStartRow : ''} ${vIndex % 2 === 0 ? styles.evenVoucher : styles.oddVoucher}`}>
                                                            <td className={styles.colDate} data-label="Date">{isFirst ? formatDate(v.date) : ''}</td>
                                                            <td className={styles.colParticulars} data-label="Particulars">
                                                                <div className={styles.particularsMain}>
                                                                    {isCredit ? 'To ' : ''}{entry.ledger?.name}
                                                                </div>
                                                                {isFirst && <div className={styles.particularsSub}>{v.narration}</div>}
                                                            </td>
                                                            <td className={styles.colType} data-label="Type">{isFirst ? v.voucher_type : ''}</td>
                                                            <td className={styles.colNo} data-label="No">{isFirst ? (v.voucher_number || '-') : ''}</td>
                                                            <td className={styles.colDebit} data-label="Debit">{isDebit ? Number(entry.debit).toFixed(2) : ''}</td>
                                                            <td className={styles.colCredit} data-label="Credit">{isCredit ? Number(entry.credit).toFixed(2) : ''}</td>
                                                            {userRole === 'admin' && (
                                                                <td className={styles.colAction} data-label="Action">
                                                                    {isFirst && (
                                                                        <div className={styles.actionButtons}>
                                                                            <button
                                                                                onClick={() => setEditingVoucher(v)}
                                                                                className={styles.editBtn}
                                                                            >
                                                                                Edit
                                                                            </button>
                                                                            <button
                                                                                onClick={async () => {
                                                                                    if (confirm('Are you sure you want to cancel this voucher?')) {
                                                                                        const res = await cancelVoucher(v.id);
                                                                                        if (res.success) fetchReport();
                                                                                        else alert(res.error);
                                                                                    }
                                                                                }}
                                                                                className={styles.deleteBtn}
                                                                            >
                                                                                Cancel
                                                                            </button>
                                                                        </div>
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
                                <table className={`${styles.table} responsive-table`}>
                                    <thead>
                                        <tr>
                                            <th className={styles.colDate}>Date</th>
                                            <th className={styles.colParticulars}>Particulars</th>
                                            <th className={styles.colType}>Type</th>
                                            <th className={styles.colNo}>No</th>
                                            <th className={styles.colDebit}>Debit</th>
                                            <th className={styles.colCredit}>Credit</th>
                                            <th className={styles.colBalance}>Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className={styles.openingRow}>
                                            <td colSpan="6">Opening Balance</td>
                                            <td className={styles.colAmount} data-label="Balance">{(openingBalance || 0).toFixed(2)}</td>
                                        </tr>
                                        {data.length === 0 ? (
                                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No transactions found.</td></tr>
                                        ) : (
                                            data.map((entry, index) => (
                                                <tr key={index}>
                                                    <td className={styles.colDate} data-label="Date">{formatDate(entry.voucher?.date)}</td>
                                                    <td className={styles.colParticulars} data-label="Particulars">
                                                        <div className={styles.particularsMain}>{entry.particulars}</div>
                                                    </td>
                                                    <td className={styles.colType} data-label="Type">{entry.voucher?.voucher_type || '-'}</td>
                                                    <td className={styles.colNo} data-label="No">{entry.voucher?.voucher_number || '-'}</td>
                                                    <td className={styles.colDebit} data-label="Debit">{entry.debit > 0 ? Number(entry.debit).toFixed(2) : ''}</td>
                                                    <td className={styles.colCredit} data-label="Credit">{entry.credit > 0 ? Number(entry.credit).toFixed(2) : ''}</td>
                                                    <td className={styles.colBalance} data-label="Balance">{(entry.balance || 0).toFixed(2)}</td>
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
                    onSave={() => {
                        setEditingVoucher(null);
                        fetchReport();
                    }}
                />
            )}
        </div>
    );
}
