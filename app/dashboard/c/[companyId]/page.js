'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './page.module.css';
import Link from 'next/link';

export default function CompanyDashboardPage() {
    const { companyId } = useParams();
    const [company, setCompany] = useState(null);
    const [user, setUser] = useState(null);
    const [cashBalance, setCashBalance] = useState(0);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

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

        // Fetch Company Details
        const { data: companyData } = await supabase
            .from('companies')
            .select('*')
            .eq('id', companyId)
            .single();
        setCompany(companyData);

        // Fetch Cash Balance
        // Logic: Find the "Cash-in-hand" ledger assigned to this user for this company
        // If Admin, maybe show total cash? Or just 0? Let's assume Operator flow primarily.
        // If Operator, show their specific cash ledger.

        const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();

        if (userData?.role === 'operator') {
            const { data: ledger } = await supabase
                .from('ledgers')
                .select('current_balance')
                .eq('company_id', companyId)
                .eq('assigned_operator_id', user.id)
                .single();

            if (ledger) setCashBalance(ledger.current_balance);
        } else {
            // Admin: Show Main Cash or Sum of all Cash?
            // Let's show Main Cash (Cash-in-hand group, no assigned operator usually, or specifically named)
            // For now, let's just fetch the first "Cash-in-hand" ledger that is NOT assigned to anyone (Main Cash)
            const { data: ledger } = await supabase
                .from('ledgers')
                .select('current_balance')
                .eq('company_id', companyId)
                .eq('group_name', 'Cash-in-hand')
                .is('assigned_operator_id', null)
                .single();
            if (ledger) setCashBalance(ledger.current_balance);
        }

        setLoading(false);
    };

    if (loading) return <div>Loading...</div>;
    if (!company) return <div>Company not found</div>;

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1>{company.name}</h1>
                <p>Welcome, {user?.email}</p>
            </header>

            <div className={styles.balanceSection}>
                <div className={styles.balanceCard}>
                    <h3>Cash in Hand</h3>
                    <p className={styles.balance}>₹ {Number(cashBalance).toFixed(2)}</p>
                    <span className={styles.balanceLabel}>Current Balance</span>
                </div>
            </div>

            <div className={styles.tabsContainer}>
                <Link href={`/dashboard/vouchers?type=receipt&companyId=${companyId}`} className={`${styles.tab} ${styles.receiptTab}`}>
                    <span className={styles.tabIcon}>📥</span>
                    <span className={styles.tabTitle}>Receipt</span>
                    <span className={styles.tabDesc}>Money In</span>
                </Link>
                <Link href={`/dashboard/vouchers?type=payment&companyId=${companyId}`} className={`${styles.tab} ${styles.paymentTab}`}>
                    <span className={styles.tabIcon}>📤</span>
                    <span className={styles.tabTitle}>Payment</span>
                    <span className={styles.tabDesc}>Money Out</span>
                </Link>
                <Link href={`/dashboard/vouchers?type=sales&companyId=${companyId}`} className={`${styles.tab} ${styles.salesTab}`}>
                    <span className={styles.tabIcon}>📈</span>
                    <span className={styles.tabTitle}>Sales</span>
                    <span className={styles.tabDesc}>Invoice</span>
                </Link>
                <Link href={`/dashboard/vouchers?type=purchase&companyId=${companyId}`} className={`${styles.tab} ${styles.purchaseTab}`}>
                    <span className={styles.tabIcon}>🛒</span>
                    <span className={styles.tabTitle}>Purchase</span>
                    <span className={styles.tabDesc}>Bill Entry</span>
                </Link>
                <Link href={`/dashboard/vouchers?type=contra&companyId=${companyId}`} className={`${styles.tab} ${styles.contraTab}`}>
                    <span className={styles.tabIcon}>🔄</span>
                    <span className={styles.tabTitle}>Contra</span>
                    <span className={styles.tabDesc}>Bank/Cash</span>
                </Link>
            </div>

            <div className={styles.footer}>
                <Link href={`/dashboard/reports?companyId=${companyId}`} className={styles.otherReportsBtn}>
                    View Reports
                </Link>
            </div>
        </div>
    );
}
