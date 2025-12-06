'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Input from '@/components/Input';
import Button from '@/components/Button';
import { transferCash, getAccessibleCompanies } from '@/app/actions';
import styles from './page.module.css';

export default function CashTransferPage() {
    const [companies, setCompanies] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState('');
    const [operatorLedgers, setOperatorLedgers] = useState([]);
    const [mainCashLedgers, setMainCashLedgers] = useState([]);
    const [selectedOperatorLedger, setSelectedOperatorLedger] = useState('');
    const [selectedMainCash, setSelectedMainCash] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadCompanies();
    }, []);

    useEffect(() => {
        if (selectedCompany) {
            fetchLedgers(selectedCompany);
        }
    }, [selectedCompany]);

    const loadCompanies = async () => {
        const data = await getAccessibleCompanies();
        if (data && data.length > 0) {
            setCompanies(data);
            setSelectedCompany(data[0].id);
        }
        setLoading(false);
    };

    const fetchLedgers = async (companyId) => {
        // Fetch Operator Cash Ledgers
        const { data: opLedgers } = await supabase
            .from('ledgers')
            .select('*, users(email)')
            .eq('company_id', companyId)
            .not('assigned_operator_id', 'is', null);

        if (opLedgers) setOperatorLedgers(opLedgers);

        // Fetch Main Cash Ledgers (Assumed to be Asset group, named 'Cash' or similar, and NOT assigned to operator)
        // For simplicity, we'll fetch all Asset ledgers not assigned to operator
        const { data: mainLedgers } = await supabase
            .from('ledgers')
            .select('*')
            .eq('company_id', companyId)
            .eq('group_name', 'Asset')
            .is('assigned_operator_id', null);

        if (mainLedgers) setMainCashLedgers(mainLedgers);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        formData.append('company_id', selectedCompany);

        const result = await transferCash(formData);

        if (result.success) {
            alert('Cash Transferred Successfully!');
            e.target.reset();
            fetchLedgers(selectedCompany); // Refresh balances
        } else {
            alert(result.error);
        }
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Cash Transfer</h1>

            <div className={styles.controls}>
                <label>Company:</label>
                <select
                    value={selectedCompany}
                    onChange={(e) => setSelectedCompany(e.target.value)}
                    className={styles.select}
                >
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>

            <div className={styles.card}>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.field}>
                        <label>From Operator Ledger</label>
                        <select
                            name="operator_ledger_id"
                            className={styles.selectInput}
                            required
                            onChange={(e) => setSelectedOperatorLedger(e.target.value)}
                        >
                            <option value="">Select Operator Cash</option>
                            {operatorLedgers.map(l => (
                                <option key={l.id} value={l.id}>
                                    {l.name} (Bal: {l.current_balance})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.field}>
                        <label>To Main Cash Ledger</label>
                        <select
                            name="main_cash_ledger_id"
                            className={styles.selectInput}
                            required
                            onChange={(e) => setSelectedMainCash(e.target.value)}
                        >
                            <option value="">Select Main Cash</option>
                            {mainCashLedgers.map(l => (
                                <option key={l.id} value={l.id}>
                                    {l.name} (Bal: {l.current_balance})
                                </option>
                            ))}
                        </select>
                    </div>

                    <Input name="amount" label="Amount to Transfer" type="number" required placeholder="0.00" />

                    <Button type="submit">Transfer Cash</Button>
                </form>
            </div>
        </div>
    );
}
