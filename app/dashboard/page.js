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
            <h1 className={styles.heading}>Companies for which you have access for data entry operations</h1>
            <div className={styles.grid}>
                {companies.length === 0 ? (
                    <p>No companies found. Please contact admin.</p>
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
                                <p>{company.financial_year}</p>
                            </div>
                            <div className={styles.cardAction}>Enter &rarr;</div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
