'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './page.module.css';
import Link from 'next/link';
import VoucherEntryForm from '@/app/components/VoucherEntryForm';

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
    const [cashBalance, setCashBalance] = useState(0);
    const [bankBalances, setBankBalances] = useState([]);
    const [upiBalances, setUpiBalances] = useState([]);
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

        const { data: companyData } = await supabase
            .from('companies')
            .select('*')
            .eq('id', companyId)
            .single();
        setCompany(companyData);

        const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
        const isAdmin = userData?.role === 'admin';

        // Fetch Balances
        const cashQuery = supabase.from('ledgers').select('current_balance, name').eq('company_id', companyId).eq('group_name', 'Cash-in-hand');
        if (!isAdmin) cashQuery.eq('assigned_operator_id', user.id);
        else cashQuery.is('assigned_operator_id', null).limit(1);

        const { data: cashLedger } = await cashQuery.single();
        if (cashLedger) setCashBalance(cashLedger.current_balance);

        const { data: bankData } = await supabase.from('ledgers').select('current_balance, name').eq('company_id', companyId).eq('group_name', 'Bank Accounts').limit(2);
        setBankBalances(bankData || []);

        const { data: upiData } = await supabase.from('ledgers').select('current_balance, name').eq('company_id', companyId).ilike('name', '%UPI%');
        setUpiBalances(upiData || []);

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

    const containerClass = `${styles.container} ${view === 'entry' ? styles[voucherType] : ''}`;

    return (
        <div className={containerClass}>
            <header className={styles.workspaceHeader}>
                <div className={styles.titleGroup}>
                    <h1>{company.name}</h1>
                    <span className={styles.fyBadge}>FY {company.financial_year}</span>
                </div>
                <div className={styles.headerActions}>
                    <button
                        className={`${styles.toggleBtn} ${view === 'overview' ? styles.activeToggle : ''}`}
                        onClick={() => setView(view === 'entry' ? 'overview' : 'entry')}
                    >
                        {view === 'entry' ? '📊 View Dashboard' : '➕ New Entry'}
                    </button>
                </div>
            </header>

            {/* Quick Access Tabs (Top Row) */}
            <div className={styles.topTabs}>
                {voucherTypes.map(t => (
                    <button
                        key={t.id}
                        className={`${styles.typeBtn} ${voucherType === t.id && view === 'entry' ? styles.activeType : ''} ${t.id === voucherType ? styles[t.id + 'Selected'] : ''}`}
                        onClick={() => { setVoucherType(t.id); setView('entry'); }}
                    >
                        <span className={styles.typeIcon}>{t.icon}</span>
                        <span className={styles.typeLabel}>{t.label}</span>
                    </button>
                ))}
            </div>

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
                        <div className={styles.balanceGrid}>
                            <div className={`${styles.balanceCard} ${styles.cashCard}`}>
                                <span className={styles.cardType}>CASH</span>
                                <p className={styles.balance}>₹ {Number(cashBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                <span className={styles.balanceLabel}>Current User Balance</span>
                            </div>
                            {bankBalances.map(bank => (
                                <div key={bank.name} className={`${styles.balanceCard} ${styles.bankCard}`}>
                                    <span className={styles.cardType}>BANK</span>
                                    <p className={styles.balance}>₹ {Number(bank.current_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                    <span className={styles.balanceLabel}>{bank.name}</span>
                                </div>
                            ))}
                            {upiBalances.map(upi => (
                                <div key={upi.name} className={`${styles.balanceCard} ${styles.upiCard}`}>
                                    <span className={styles.cardType}>UPI</span>
                                    <p className={styles.balance}>₹ {Number(upi.current_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                    <span className={styles.balanceLabel}>{upi.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {/* Persistent Report Shortcuts (Bottom) */}
            <footer className={styles.reportsFooter}>
                <div className={styles.reportLinks}>
                    <Link href={`/dashboard/reports?companyId=${companyId}`} className={styles.reportLink}>
                        <span className={styles.linkIcon}>📖</span> Day Book
                    </Link>
                    <Link href={`/dashboard/ledgers?companyId=${companyId}`} className={styles.reportLink}>
                        <span className={styles.linkIcon}>📂</span> All Ledgers
                    </Link>
                    <Link href={`/dashboard/reports?type=ledger&companyId=${companyId}`} className={styles.reportLink}>
                        <span className={styles.linkIcon}>📊</span> Account Statement
                    </Link>
                </div>
            </footer>
        </div>
    );
}
