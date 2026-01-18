'use client';

import { Suspense, useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { deleteVoucher, cancelVoucher, getAccessibleCompanies, getLedgers, getDayBook, getLedgerEntries } from '@/app/actions';
import styles from './page.module.css';
import Button from '@/components/Button';

import EditVoucherModal from '@/app/components/EditVoucherModal';
import LedgerSelector from '@/app/components/LedgerSelector';

// INTERNAL COMPONENT (The logic we had before)
function ReportsContent() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();

    const [companies, setCompanies] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState(params?.companyId || searchParams.get('companyId') || '');
    const [reportType, setReportType] = useState(searchParams.get('type') || 'daybook');
    const [typeFilter, setTypeFilter] = useState(searchParams.get('filterType') || 'all');

    useEffect(() => {
        const type = searchParams.get('type');
        if (type) setReportType(type);

        const fDate = searchParams.get('fromDate');
        if (fDate) setFromDate(fDate);

        const tDate = searchParams.get('toDate');
        if (tDate) setToDate(tDate);

        const filter = searchParams.get('filterType');
        if (filter) setTypeFilter(filter);

        const ledger = searchParams.get('ledgerId');
        if (ledger) setSelectedLedger(ledger);
    }, [searchParams]);

    // RESTORED STATE
    const [date, setDate] = useState(searchParams.get('date') || new Date().toISOString().split('T')[0]);
    const [fromDate, setFromDate] = useState(searchParams.get('fromDate') || new Date().toISOString().split('T')[0]);
    const [toDate, setToDate] = useState(searchParams.get('toDate') || new Date().toISOString().split('T')[0]);

    const [ledgers, setLedgers] = useState([]);
    const [selectedLedger, setSelectedLedger] = useState(searchParams.get('ledgerId') || '');
    // Removed redundant voucherTypeFilter, using typeFilter instead

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [openingBalance, setOpeningBalance] = useState(0);

    const [summary, setSummary] = useState({
        totalSales: 0,
        totalExpenses: 0,
        closingBalance: 0
    });
    // END RESTORED STATE
    // Edit Modal State
    const [editingVoucher, setEditingVoucher] = useState(null);
    const [userRole, setUserRole] = useState(null);

    useEffect(() => {
        fetchUserRole();
        loadCompanies();
    }, []);

    useEffect(() => {
        loadLedgers();
    }, [selectedCompany]);

    // Auto-fetch report if params are present
    useEffect(() => {
        if (selectedCompany) {
            fetchReport();
        }
    }, [selectedCompany, reportType, selectedLedger, date, fromDate, toDate, typeFilter]); // Updated dependencies

    // Calculate Summary whenever data changes for Daybook
    useEffect(() => {
        if (reportType === 'daybook' && data && data.length > 0) {
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

    const loadLedgers = async () => {
        if (!selectedCompany) return;
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

    const shortenType = (type) => {
        if (!type) return '';
        const t = type.toLowerCase();
        if (t === 'receipt') return 'REC';
        if (t === 'payment') return 'PMT';
        if (t === 'sales') return 'SAL';
        if (t === 'purchase') return 'PUR';
        if (t === 'journal') return 'JV';
        if (t === 'contra') return 'CON';
        return type.substring(0, 3).toUpperCase();
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

    const filteredData = reportType === 'daybook' && typeFilter !== 'all'
        ? data.filter(v => v.voucher_type.toLowerCase() === typeFilter)
        : data;

    return (
        <div className={styles.container}>
            <div className={`${styles.headerRow} stack-on-mobile`}>
                <div className={styles.title}>
                    <div className={styles.reportToggle}>
                        <button
                            className={`${styles.toggleBtn} ${reportType === 'daybook' ? styles.activeToggle : ''}`}
                            onClick={() => setReportType('daybook')}
                        >
                            Daybook
                        </button>
                        <button
                            className={`${styles.toggleBtn} ${reportType === 'ledger' ? styles.activeToggle : ''}`}
                            onClick={() => setReportType('ledger')}
                        >
                            Statement
                        </button>
                    </div>

                    {reportType === 'ledger' && (
                        <div className={styles.ledgerSelectorWrapper}>
                            <LedgerSelector
                                value={ledgers.find(l => l.id === selectedLedger)?.name || ''}
                                ledgers={ledgers}
                                onSelect={(l) => setSelectedLedger(l.id)}
                                placeholder="Select Account..."
                                className={styles.reportLedgerSelect}
                            />
                        </div>
                    )}
                </div>

                <div className={styles.headerControls}>
                    <div className={styles.dateInputsGroup}>
                        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className={styles.miniInput} />
                        <span className={styles.divider}>to</span>
                        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className={styles.miniInput} />
                        <button
                            className={styles.fyButtonCompact}
                            onClick={() => {
                                const company = companies.find(c => c.id === selectedCompany);
                                if (company?.financial_year) {
                                    const parts = company.financial_year.split('-');
                                    setFromDate(`${parts[0]}-04-01`);
                                    setToDate(`${parts[0].substring(0, 2)}${parts[1]}-03-31`);
                                }
                            }}
                        >
                            FY
                        </button>
                    </div>

                    <div className={styles.typeFilters}>
                        {['all', 'receipt', 'payment', 'sales', 'purchase'].map(t => (
                            <button
                                key={t}
                                onClick={() => setTypeFilter(t)}
                                className={`${styles.filterBtn} ${typeFilter === t ? styles.activeFilter : ''}`}
                            >
                                {t.substring(0, 3).toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>

                {selectedCompany && (
                    <Button onClick={() => router.push(`/dashboard/c/${selectedCompany}`)} variant="secondary" size="small" className={styles.exitBtn}>
                        Exit
                    </Button>
                )}
            </div>

            <div className={styles.reportContent}>
                {loading ? <p style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</p> : (
                    <>
                        <div className={`${styles.tableContainer} ${fromDate === toDate ? styles.singleDay : ''}`}>
                            {reportType === 'daybook' && (
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th className={styles.colLedger}>Ledger / Account</th>
                                            <th className={styles.colTypeSmall}>Type</th>
                                            <th className={styles.colIndicatorCompact}></th>
                                            <th className={styles.colAmountCompact}>Amount</th>
                                            {userRole === 'admin' && <th className={styles.colQuickEdit}></th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredData.length === 0 ? (
                                            <tr><td colSpan={userRole === 'admin' ? 5 : 4} style={{ textAlign: 'center', padding: '2rem' }}>No transactions found.</td></tr>
                                        ) : (
                                            (() => {
                                                let lastDate = null;
                                                return filteredData.flatMap((v, vIndex) => {
                                                    const isDateChange = v.date !== lastDate;
                                                    lastDate = v.date;
                                                    const entries = v.voucher_entries || [];
                                                    const sortedEntries = [...entries].sort((a, b) => (Number(b.debit || 0) - Number(a.debit || 0)));

                                                    const dateHeader = isDateChange ? (
                                                        <tr key={`date-${v.date}`} className={styles.dateStickyHeader}>
                                                            <td colSpan={userRole === 'admin' ? 5 : 4}>
                                                                <div className={styles.stickyDateLabel}>
                                                                    <span className={styles.stickyDay}>{new Date(v.date).getDate()}</span>
                                                                    <span className={styles.stickyMonth}>{getMonthName(v.date)} {new Date(v.date).getFullYear()}</span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ) : null;

                                                    const voucherRows = sortedEntries.map((entry, index) => {
                                                        const isDebit = Number(entry.debit) > 0;
                                                        const isCredit = Number(entry.credit) > 0;
                                                        const vType = v.voucher_type?.toLowerCase() || '';

                                                        return (
                                                            <tr
                                                                key={`${v.id}-${index}`}
                                                                className={`${styles.compactRow} ${isDebit ? styles.debitRow : styles.creditRow} ${vIndex % 2 === 0 ? styles.evenVoucher : styles.oddVoucher}`}
                                                                onDoubleClick={() => userRole === 'admin' && setEditingVoucher(v)}
                                                            >
                                                                <td className={styles.colLedger}>
                                                                    <div className={styles.ledgerInfo}>
                                                                        <span className={styles.ledgerNameText}>{entry.ledger?.name}</span>
                                                                        {index === 0 && v.narration && <span className={styles.inlineNarration}>({v.narration})</span>}
                                                                    </div>
                                                                </td>
                                                                <td className={`${styles.colTypeSmall} ${styles[vType + 'Color']}`}>{shortenType(v.voucher_type)}</td>
                                                                <td className={styles.colIndicatorCompact}>
                                                                    {isDebit ? 'D' : 'C'}
                                                                </td>
                                                                <td className={styles.colAmountCompact}>
                                                                    {Number(isDebit ? entry.debit : entry.credit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                                </td>
                                                                {userRole === 'admin' && (
                                                                    <td
                                                                        className={styles.colQuickEdit}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setEditingVoucher(v);
                                                                        }}
                                                                    >
                                                                        {index === 0 && <span className={styles.editIconSmall} title="Edit Voucher">✎</span>}
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        );
                                                    });

                                                    return dateHeader ? [dateHeader, ...voucherRows] : voucherRows;
                                                });
                                            })()
                                        )}
                                    </tbody>
                                </table>
                            )}

                            {reportType === 'ledger' && (
                                <table className={`${styles.table} ${styles.ledgerTable}`}>
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
                                            <td
                                                className={`${styles.colAmount} ${openingBalance > 0 ? styles.textValDebit : styles.textValCredit}`}
                                                data-label="Balance"
                                            >
                                                {(openingBalance || 0).toFixed(2)} {openingBalance > 0 ? 'Dr' : 'Cr'}
                                            </td>
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
                                            <td
                                                className={`${styles.colAmount} ${data.length > 0 ? (data[data.length - 1].balance > 0 ? styles.textValDebit : styles.textValCredit) : (openingBalance > 0 ? styles.textValDebit : styles.textValCredit)}`}
                                                data-label="Balance"
                                            >
                                                {data.length > 0 ? (data[data.length - 1].balance || 0).toFixed(2) : (openingBalance || 0).toFixed(2)}
                                            </td>
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

// MAIN PAGE COMPONENT
export default function ReportsPage() {
    return (
        <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading Report...</div>}>
            <ReportsContent />
        </Suspense>
    );
}
