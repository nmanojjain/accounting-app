'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname, useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import styles from './layout.module.css';
import SyncManager from '../components/SyncManager';

export default function DashboardLayout({ children }) {
    const [user, setUser] = useState(null);
    const [role, setRole] = useState(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [company, setCompany] = useState(null);
    const router = useRouter();
    const pathname = usePathname();
    const params = useParams();
    const searchParams = useSearchParams();

    // Check if we are inside a company context
    const companyId = params?.companyId || searchParams.get('companyId');

    const isActive = (path) => {
        if (path.includes('?')) {
            const [base, query] = path.split('?');
            const searchPair = query.split('=');
            return pathname === base && searchParams.get(searchPair[0]) === searchPair[1];
        }
        return pathname === path && !searchParams.get('view');
    };

    useEffect(() => {
        const getUser = async () => {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error || !user) {
                router.push('/login');
            } else {
                setUser(user);
                const { data: userData } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                setRole(userData?.role || 'operator');
            }
        };
        getUser();

        // Register Service Worker
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
                navigator.serviceWorker.register('/sw.js').then(
                    function (registration) { console.log('ServiceWorker registration successful'); },
                    function (err) { console.log('ServiceWorker registration failed: ', err); }
                );
            });
        }
    }, [router]);

    // Fetch company name if in company context
    useEffect(() => {
        if (companyId) {
            const fetchCompany = async () => {
                const { data } = await supabase
                    .from('companies')
                    .select('name')
                    .eq('id', companyId)
                    .single();
                if (data) setCompany(data);
            };
            fetchCompany();
        } else {
            setCompany(null);
        }
    }, [companyId]);

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
                    <div className={styles.companyName}>
                        {company ? company.name : 'Accounting App'}
                    </div>
                    {companyId && (
                        <button
                            className={styles.profileBtn}
                            onClick={() => router.push('/dashboard')}
                        >
                            🔄 Switch Company
                        </button>
                    )}
                </div>

                <nav className={styles.nav} onClick={() => setIsMobileMenuOpen(false)}>
                    {!companyId ? (
                        /* Global View - Only Workspace Selector */
                        <Link href="/dashboard" className={`${styles.navItem} ${isActive('/dashboard') ? styles.active : ''}`}>
                            <span className={styles.navIcon}>🏢</span> Select Workspace
                        </Link>
                    ) : (
                        /* Company Context - Operations Only for this Company */
                        <>
                            <Link href={`/dashboard/c/${companyId}`} className={`${styles.navItem} ${isActive(`/dashboard/c/${companyId}`) ? styles.active : ''}`}>
                                <span className={styles.navIcon}>📊</span> Dashboard
                            </Link>
                            <Link href={`/dashboard/c/${companyId}?view=entry`} className={`${styles.navItem} ${isActive(`/dashboard/c/${companyId}?view=entry`) ? styles.active : ''}`}>
                                <span className={styles.navIcon}>⌨️</span> Voucher Entry
                            </Link>
                            <Link href={`/dashboard/reports?companyId=${companyId}`} className={`${styles.navItem} ${pathname === '/dashboard/reports' && !searchParams.get('type') ? styles.active : ''}`}>
                                <span className={styles.navIcon}>📅</span> Day Book
                            </Link>
                            <Link href={`/dashboard/reports?type=ledger&companyId=${companyId}`} className={`${styles.navItem} ${searchParams.get('type') === 'ledger' ? styles.active : ''}`}>
                                <span className={styles.navIcon}>👤</span> PARTY LEDGER
                            </Link>
                            <Link href={`/dashboard/ledgers?companyId=${companyId}`} className={`${styles.navItem} ${pathname.startsWith('/dashboard/ledgers') ? styles.active : ''}`}>
                                <span className={styles.navIcon}>📝</span> Ledger's List
                            </Link>
                        </>
                    )}

                    {role === 'admin' && !companyId && (
                        /* Admin Global Management - Hide when inside a company */
                        <>
                            <div className={styles.navDivider}>Administration</div>
                            <Link href="/dashboard/companies" className={`${styles.navItem} ${isActive('/dashboard/companies') ? styles.active : ''}`}>
                                <span className={styles.navIcon}>🏗️</span> Setup Companies
                            </Link>
                            <Link href="/dashboard/users" className={`${styles.navItem} ${isActive('/dashboard/users') ? styles.active : ''}`}>
                                <span className={styles.navIcon}>👥</span> Manage Users
                            </Link>
                        </>
                    )}
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
                    </div>

                    <div className={styles.headerCenter}>
                        {company && (
                            <div className={styles.globalCompanyBadge}>
                                <span className={styles.badgeLabel}>ACTIVE WORKSPACE</span>
                                <span className={styles.badgeName}>{company.name}</span>
                            </div>
                        )}
                    </div>

                    <div className={styles.headerRight}>
                        <div className={styles.userEmail}>
                            {user.email} ({role})
                        </div>
                    </div>
                </header>
                <div className={styles.content}>
                    {children}
                </div>
                <SyncManager />
            </main>
        </div>
    );
}

