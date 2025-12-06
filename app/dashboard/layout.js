'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import styles from './layout.module.css';

export default function DashboardLayout({ children }) {
    const [user, setUser] = useState(null);
    const [role, setRole] = useState(null); // 'admin' or 'operator'
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const getUser = async () => {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error || !user) {
                router.push('/login');
            } else {
                setUser(user);
                // Fetch Role
                const { data: userData } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                setRole(userData?.role || 'operator');
            }
        };
        getUser();
    }, [router]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    if (!user) return null;

    return (
        <div className={styles.layout}>
            {/* Mobile Overlay */}
            <div
                className={`${styles.overlay} ${isMobileMenuOpen ? styles.visible : ''}`}
                onClick={() => setIsMobileMenuOpen(false)}
            />

            <aside className={`${styles.sidebar} ${isMobileMenuOpen ? styles.open : ''}`}>
                {/* Profile Section */}
                <div className={styles.profileSection}>
                    <div className={styles.avatar}>
                        {user?.email?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className={styles.companyName}>My Company</div>
                    <button className={styles.profileBtn}>Profile & Settings</button>
                </div>

                <nav className={styles.nav} onClick={() => setIsMobileMenuOpen(false)}>
                    <Link href="/dashboard" className={styles.navItem}>📊 Overview</Link>
                    <Link href="/dashboard/reports" className={styles.navItem}>📅 Day Book</Link>

                    {role === 'admin' && (
                        <>
                            <Link href="/dashboard/companies" className={styles.navItem}>🏢 Companies</Link>
                            <Link href="/dashboard/users" className={styles.navItem}>👥 Users</Link>
                            <Link href="/dashboard/access" className={styles.navItem}>🔒 Access Control</Link>
                            <Link href="/dashboard/banking" className={styles.navItem}>🏦 Banking & Cash</Link>
                        </>
                    )}

                    <Link href="/dashboard/ledgers" className={styles.navItem}>📝 Create Ledger</Link>
                </nav>
                <div className={styles.footer}>
                    <button onClick={handleLogout} className={styles.logoutBtn}>🚪 Logout</button>
                </div>
            </aside>
            <main className={styles.main}>
                <header className={styles.header}>
                    <div className={styles.headerLeft}>
                        <button
                            className={styles.mobileMenuBtn}
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        >
                            ☰
                        </button>
                        <div className={styles.userEmail}>{user.email} ({role})</div>
                    </div>
                </header>
                <div className={styles.content}>
                    {children}
                </div>
            </main>
        </div>
    );
}
