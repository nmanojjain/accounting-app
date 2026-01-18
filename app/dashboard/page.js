'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getAccessibleCompanies } from '@/app/actions';
import styles from './page.module.css';

export default function DashboardPage() {
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    const [user, setUser] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            router.push('/login');
            return;
        }
        setUser(user);

        const data = await getAccessibleCompanies();
        if (data) setCompanies(data);
        setLoading(false);
    };

    const handleSelectCompany = (companyId) => {
        router.push(`/dashboard/c/${companyId}`);
    };

    if (loading) return <div className={styles.loading}>Loading Companies...</div>;

    return (
        <div className={styles.container}>
            <header className={styles.welcomeHeader}>
                <div className={styles.headerInfo}>
                    <p className={styles.welcomeText}>Welcome back,</p>
                    <h1 className={styles.heading}>{user?.email ? user.email.split('@')[0] : 'User'}</h1>
                </div>
                <p className={styles.subheading}>Select a workspace to start managing your accounting records.</p>
            </header>

            <div className={styles.grid}>
                {companies.length === 0 ? (
                    <div className={styles.emptyState}>
                        <p>No companies found. Please contact admin for access.</p>
                    </div>
                ) : (
                    companies.map(company => (
                        <div
                            key={company.id}
                            className={styles.companyCard}
                            onClick={() => handleSelectCompany(company.id)}
                        >
                            <div className={styles.cardIcon}>🏢</div>
                            <div className={styles.cardContent}>
                                <h3>{company.name}</h3>
                                <p>FY {company.financial_year}</p>
                            </div>
                            <div className={styles.cardAction}>Enter</div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
