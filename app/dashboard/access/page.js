'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Button from '@/components/Button';
import { assignCompany, revokeCompany } from '@/app/actions';
import styles from './page.module.css';

export default function AccessPage() {
    const [operators, setOperators] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [accessMap, setAccessMap] = useState({}); // { userId: [companyId1, companyId2] }
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        checkAccess();
    }, []);

    const checkAccess = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
            if (userData?.role !== 'admin') {
                router.push('/dashboard');
                return;
            }
        }
        fetchData();
    };

    const fetchData = async () => {
        const { data: ops } = await supabase.from('users').select('*').eq('role', 'operator');
        const { data: comps } = await supabase.from('companies').select('*');
        const { data: access } = await supabase.from('user_company_access').select('*');

        if (ops) setOperators(ops);
        if (comps) setCompanies(comps);

        const map = {};
        if (access) {
            access.forEach(a => {
                if (!map[a.user_id]) map[a.user_id] = [];
                map[a.user_id].push(a.company_id);
            });
        }
        setAccessMap(map);
        setLoading(false);
    };

    const handleToggle = async (userId, companyId, hasAccess) => {
        if (hasAccess) {
            const result = await revokeCompany(userId, companyId);
            if (result.success) {
                setAccessMap(prev => ({
                    ...prev,
                    [userId]: prev[userId].filter(id => id !== companyId)
                }));
            } else {
                alert(result.error);
            }
        } else {
            const result = await assignCompany(userId, companyId);
            if (result.success) {
                setAccessMap(prev => ({
                    ...prev,
                    [userId]: [...(prev[userId] || []), companyId]
                }));
            } else {
                alert(result.error);
            }
        }
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Access Management</h1>
            <p className={styles.subtitle}>Assign companies to operators</p>

            <div className={styles.grid}>
                {operators.map(op => (
                    <div key={op.id} className={styles.card}>
                        <h3>{op.email}</h3>
                        <div className={styles.companyList}>
                            {companies.map(comp => {
                                const hasAccess = accessMap[op.id]?.includes(comp.id);
                                return (
                                    <div key={comp.id} className={styles.companyRow}>
                                        <span>{comp.name}</span>
                                        <button
                                            className={`${styles.toggleBtn} ${hasAccess ? styles.active : ''}`}
                                            onClick={() => handleToggle(op.id, comp.id, hasAccess)}
                                        >
                                            {hasAccess ? 'Revoke' : 'Assign'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
