'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './page.module.css';

export default function DashboardPage() {
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        fetchCompanies();
    }, []);

    const fetchCompanies = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Check if admin
        const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();

        let query = supabase.from('companies').select('*');

        // If not admin, filter by access
        if (userData?.role !== 'admin') {
            // This logic depends on RLS, but let's be explicit if needed or rely on RLS
            // The RLS policy "Operator view companies" uses user_company_access
            // So a simple select('*') should work if RLS is on.
        }

        const { data, error } = await query;

        if (data) setCompanies(data);
        if (error) console.error(error);
        setLoading(false);
    };

    const handleSelectCompany = (companyId) => {
        router.push(`/dashboard/c/${companyId}`);
    };

    if (loading) return <div className={styles.loading}>Loading Companies...</div>;

    return (
        <div className={styles.container}>
            <header className={styles.welcomeHeader}>
                <h1 className={styles.heading}>Workspaces</h1>
                <p className={styles.subheading}>Select a company to manage its ledgers and vouchers.</p>
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
