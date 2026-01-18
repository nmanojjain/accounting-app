'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './page.module.css';
import Link from 'next/link';
import VoucherEntryForm from '@/app/components/VoucherEntryForm';
import { getLedgers, getSalesStats } from '@/app/actions';

export default function CompanyDashboardPage() {
    const { companyId } = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const urlView = searchParams.get('view') || 'overview';

    // UI State
    const [view, setView] = useState(urlView); // 'entry' or 'overview'
    const [voucherType, setVoucherType] = useState('receipt');

    useEffect(() => {
        if (searchParams.get('view')) {
            setView(searchParams.get('view'));
        } else {
            setView('overview');
        }
    }, [searchParams]);

    // Data State
    const [company, setCompany] = useState(null);
    const [user, setUser] = useState(null);
    const [userRole, setUserRole] = useState('operator'); // Default safe
    const [cashLedgers, setCashLedgers] = useState([]);
    const [bankLedgers, setBankLedgers] = useState([]);
    const [salesStats, setSalesStats] = useState({ today: 0, mtd: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [companyId]);

    const fetchData = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            router.push('/login');
            return;
        }
        setUser(user);

        // Fetch User Role
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();
        const role = userData?.role || 'operator';
        setUserRole(role);

        const { data: companyData } = await supabase
            .from('companies')
            .select('*')
            .eq('id', companyId)
            .single();
        setCompany(companyData);

        // Fetch Sales Stats (Only if Admin)
        if (role === 'admin') {
            const stats = await getSalesStats(companyId);
            setSalesStats(stats);
        } else {
            setSalesStats({ today: 0, mtd: 0 });
        }

        // Fetch All Ledgers
        const allLedgers = await getLedgers(companyId);

        // Filter Cash/Bank based on Role
        let filteredCash = allLedgers.filter(l => l.group_name === 'Cash-in-hand');
        let filteredBank = allLedgers.filter(l => l.group_name === 'Bank Accounts');

        if (role === 'operator') {
            // Operator Restriction: Only assigned ledgers
            filteredCash = filteredCash.filter(l => l.assigned_operator_id === user.id);
            filteredBank = filteredBank.filter(l => l.assigned_operator_id === user.id);
        }

        setCashLedgers(filteredCash);
        setBankLedgers(filteredBank);
        setLoading(false);
    };

    if (loading) return <div className={styles.loading}>Loading Workspace...</div>;
    if (!company) return <div>Company not found</div>;

    const voucherTypes = [
        { id: 'receipt', label: 'Receipt (F6)', icon: '📥' },
        { id: 'payment', label: 'Payment (F5)', icon: '📤' },
        { id: 'sales', label: 'Sales (F8)', icon: '📈' },
        { id: 'purchase', label: 'Purchase (F9)', icon: '🛒' },
        { id: 'contra', label: 'Contra (F4)', icon: '🔄' },
        { id: 'journal', label: 'Journal (F7)', icon: '📝' },
    ];

    const containerClass = `${styles.container} ${view === 'entry' ? styles.entryModeContainer : ''}`;

    const today = new Date().toISOString().split('T')[0];
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    return (
        <div className={containerClass}>
            {/* ... header ... */}

            {/* Main Content Area */}
            <main className={`${styles.workspaceBody} ${view === 'entry' ? styles.entryModeBody : ''}`}>
                {view === 'entry' ? (
                    <VoucherEntryForm
                        companyId={companyId}
                        type={voucherType}
                        onExit={() => setView('overview')}
                    />
                ) : (
                    <div className={styles.overviewSection}>
                        {/* 1. Restored Voucher Shortcut Grid */}
                        <div className={styles.voucherGrid}>
                            {voucherTypes.map(v => (
                                <button
                                    key={v.id}
                                    onClick={() => {
                                        setVoucherType(v.id);
                                        setView('entry');
                                    }}
                                    className={styles.voucherBtn}
                                >
                                    <span className={styles.voucherIcon}>{v.icon}</span>
                                    <span className={styles.voucherLabel}>{v.label}</span>
                                </button>
                            ))}
                        </div>

                        <div className={styles.balanceGrid}>
                            {/* Sales Stats - Only for Admin */}
                            {userRole === 'admin' && (
                                <>
                                    <Link
                                        href={`/dashboard/reports?type=daybook&companyId=${companyId}&filterType=sales&fromDate=${today}&toDate=${today}`}
                                        className={`${styles.balanceCard} ${styles.salesCard}`}
                                    >
                                        <span className={styles.cardType}>SALES TODAY</span>
                                        <p className={styles.balance}>₹ {Number(salesStats.today).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                    </Link>

                                    <Link
                                        href={`/dashboard/reports?type=daybook&companyId=${companyId}&filterType=sales&fromDate=${startOfMonth}&toDate=${today}`}
                                        className={`${styles.balanceCard} ${styles.salesCard}`}
                                    >
                                        <span className={styles.cardType}>SALES MTD</span>
                                        <p className={styles.balance}>₹ {Number(salesStats.mtd).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                    </Link>
                                </>
                            )}

                            {/* Render Filtered Cash Ledgers (State is already filtered) */}
                            {cashLedgers.map(cash => (
                                <Link key={cash.id} href={`/dashboard/reports?type=ledger&companyId=${companyId}&ledgerId=${cash.id}`} className={`${styles.balanceCard} ${styles.cashCard}`}>
                                    <span className={styles.cardType}>CASH</span>
                                    <p className={styles.balance}>₹ {Number(cash.current_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                    <span className={styles.balanceLabel}>{cash.name}</span>
                                </Link>
                            ))}

                            {/* Render Filtered Bank Ledgers */}
                            {bankLedgers.map(bank => (
                                <Link key={bank.id} href={`/dashboard/reports?type=ledger&companyId=${companyId}&ledgerId=${bank.id}`} className={`${styles.balanceCard} ${styles.bankCard}`}>
                                    <span className={styles.cardType}>BANK</span>
                                    <p className={styles.balance}>₹ {Number(bank.current_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                    <span className={styles.balanceLabel}>{bank.name}</span>
                                </Link>
                            ))}
                        </div>

                        {/* Report Shortcuts moved here for mobile-first single page view */}
                        <div className={styles.quickReports}>
                            <Link href={`/dashboard/reports?companyId=${companyId}`} className={styles.reportBtn}>
                                <span className={styles.btnIcon}>📖</span>
                                <span>Day Book</span>
                            </Link>
                            <Link href={`/dashboard/ledgers?companyId=${companyId}`} className={styles.reportBtn}>
                                <span className={styles.btnIcon}>📂</span>
                                <span>All Ledgers</span>
                            </Link>
                            <Link href={`/dashboard/reports?type=ledger&companyId=${companyId}`} className={styles.reportBtn}>
                                <span className={styles.btnIcon}>📊</span>
                                <span>Statement</span>
                            </Link>
                            {/* Migration Link for Admin */}
                            {userRole === 'admin' && (
                                <Link href="/dashboard/migration" className={styles.reportBtn} style={{ borderColor: '#dc2626', color: '#dc2626' }}>
                                    <span className={styles.btnIcon}>⚠️</span>
                                    <span>Migration</span>
                                </Link>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
