'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/Button';
import { createLedger, transferCash, getAccessibleCompanies } from '@/app/actions';
import styles from './page.module.css';

export default function BankingPage() {
    const [companies, setCompanies] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState('');
    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState(null);
    const [operators, setOperators] = useState([]);

    // Data
    const [accounts, setAccounts] = useState([]);

    // Forms
    const [newAccountType, setNewAccountType] = useState('bank'); // bank, wallet, cash

    // Transfer State
    const [operatorLedgers, setOperatorLedgers] = useState([]);
    const [mainCashLedgers, setMainCashLedgers] = useState([]);

    useEffect(() => {
        fetchUser();
        loadCompanies();
        fetchOperators();
    }, []);

    useEffect(() => {
        if (selectedCompany) {
            fetchAccounts(selectedCompany);
            if (userRole === 'admin') {
                fetchTransferLedgers(selectedCompany);
            }
        }
    }, [selectedCompany, userRole]);

    const fetchUser = async () => {
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
            setSelectedCompany(data[0].id);
        }
        setLoading(false);
    };

    const fetchOperators = async () => {
        // Fetch ALL users (Admins + Operators)
        const { data } = await supabase.from('users').select('*');
        if (data) setOperators(data);
    };

    const fetchAccounts = async (companyId) => {
        const { data } = await supabase
            .from('ledgers')
            .select('*, users(email)')
            .eq('company_id', companyId)
            .in('group_name', ['Cash-in-hand', 'Bank Accounts'])
            .order('group_name', { ascending: false });

        if (data) setAccounts(data);
    };

    const fetchTransferLedgers = async (companyId) => {
        // Operator Cash Ledgers (Source)
        const { data: opLedgers } = await supabase
            .from('ledgers')
            .select('*, users(email)')
            .eq('company_id', companyId)
            .eq('group_name', 'Cash-in-hand')
            .not('assigned_operator_id', 'is', null);
        if (opLedgers) setOperatorLedgers(opLedgers);

        // Main Cash Ledgers (Destination)
        const { data: allCash } = await supabase
            .from('ledgers')
            .select('*, users(role, email)')
            .eq('company_id', companyId)
            .eq('group_name', 'Cash-in-hand');

        if (allCash) {
            // Filter for "Main Cash" candidates:
            // - No assigned operator
            // - Assigned to an ADMIN
            const mainCash = allCash.filter(l =>
                !l.assigned_operator_id || (l.users && l.users.role === 'admin')
            );
            setMainCashLedgers(mainCash);
        }
    };

    const handleCreateAccount = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        formData.append('company_id', selectedCompany);

        const type = newAccountType;
        let groupName = 'Bank Accounts';
        let subGroup = '';
        let isCash = false;

        if (type === 'cash') {
            groupName = 'Cash-in-hand';
            isCash = true;
        } else if (type === 'wallet') {
            groupName = 'Bank Accounts';
            subGroup = 'Wallet';
        }

        formData.append('group_name', groupName);
        if (subGroup) formData.append('sub_group', subGroup);
        formData.append('is_cash_ledger', isCash);

        const result = await createLedger(formData);
        if (result.success) {
            alert('Account Created Successfully!');
            e.target.reset();
            fetchAccounts(selectedCompany);
        } else {
            alert(result.error);
        }
    };

    const handleTransfer = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        formData.append('company_id', selectedCompany);

        const result = await transferCash(formData);
        if (result.success) {
            alert('Cash Transferred Successfully!');
            e.target.reset();
            fetchAccounts(selectedCompany);
            fetchTransferLedgers(selectedCompany);
        } else {
            alert(result.error);
        }
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Banking & Cash Management</h1>
                <div className={styles.controls}>
                    <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)} className={styles.select}>
                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
            </div>

            <div className={styles.tabs}>
                <button
                    className={`${styles.tab} ${activeTab === 'overview' ? styles.activeTab : ''}`}
                    onClick={() => setActiveTab('overview')}
                >
                    Overview
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'create' ? styles.activeTab : ''}`}
                    onClick={() => setActiveTab('create')}
                >
                    Create Account
                </button>
                {userRole === 'admin' && (
                    <button
                        className={`${styles.tab} ${activeTab === 'collection' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('collection')}
                    >
                        Cash Collection
                    </button>
                )}
            </div>

            {activeTab === 'overview' && (
                <div className={styles.grid}>
                    {accounts.map(acc => (
                        <div key={acc.id} className={styles.accountCard}>
                            <div className={styles.accountType}>
                                {acc.group_name}
                                {acc.sub_group ? ` - ${acc.sub_group}` : ''}
                                {acc.assigned_operator_id ? ` (Op: ${acc.users?.email})` : ''}
                            </div>
                            <div className={styles.accountName}>{acc.name}</div>
                            <div className={styles.accountBalance}>₹ {Number(acc.current_balance).toFixed(2)}</div>
                        </div>
                    ))}
                    {accounts.length === 0 && <p>No accounts found.</p>}
                </div>
            )}

            {activeTab === 'create' && (
                <div className={styles.card}>
                    <h3 className={styles.sectionTitle}>Create New Account</h3>
                    <form onSubmit={handleCreateAccount} className={styles.form}>
                        <div className={styles.formGroup}>
                            <label>Account Type</label>
                            <select
                                value={newAccountType}
                                onChange={e => setNewAccountType(e.target.value)}
                                className={styles.selectInput}
                            >
                                <option value="bank">Bank Account</option>
                                <option value="wallet">Wallet (PhonePe/Paytm)</option>
                                <option value="cash">Cash Ledger</option>
                            </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label>Account Name</label>
                            <input name="name" className={styles.input} placeholder="e.g. HDFC Bank, Petty Cash, PhonePe Main" required />
                        </div>

                        {newAccountType === 'cash' && (
                            <div className={styles.formGroup}>
                                <label>Assign to Operator (Optional)</label>
                                <select name="assigned_operator_id" className={styles.selectInput}>
                                    <option value="">None (Main Cash)</option>
                                    {operators.map(op => <option key={op.id} value={op.id}>{op.email} ({op.role})</option>)}
                                </select>
                            </div>
                        )}

                        <div className={styles.formGroup}>
                            <label>Opening Balance</label>
                            <input name="opening_balance" type="number" className={styles.input} placeholder="0.00" />
                        </div>

                        <Button type="submit">Create Account</Button>
                    </form>
                </div>
            )}

            {activeTab === 'collection' && userRole === 'admin' && (
                <div className={styles.card}>
                    <h3 className={styles.sectionTitle}>Collect Cash from Operator</h3>
                    <p style={{ marginBottom: '1rem', color: '#64748b' }}>Transfer cash from an Operator's physical cash-in-hand to the Main Cash account.</p>

                    <form onSubmit={handleTransfer} className={styles.form}>
                        <div className={styles.formGroup}>
                            <label>From Operator</label>
                            <select name="operator_ledger_id" className={styles.selectInput} required>
                                <option value="">Select Operator Ledger</option>
                                {operatorLedgers.map(l => (
                                    <option key={l.id} value={l.id}>{l.name} (Bal: {l.current_balance}) - {l.users?.email}</option>
                                ))}
                            </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label>To Main Cash</label>
                            <select name="main_cash_ledger_id" className={styles.selectInput} required>
                                <option value="">Select Main Cash Ledger</option>
                                {mainCashLedgers.map(l => (
                                    <option key={l.id} value={l.id}>{l.name} (Bal: {l.current_balance})</option>
                                ))}
                            </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label>Amount</label>
                            <input name="amount" type="number" className={styles.input} required placeholder="0.00" />
                        </div>

                        <Button type="submit">Transfer Cash</Button>
                    </form>
                </div>
            )}
        </div>
    );
}
