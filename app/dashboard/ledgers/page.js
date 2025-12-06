'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Input from '@/components/Input';
import Button from '@/components/Button';
import { deleteLedger, createLedger, updateLedger, getAccessibleCompanies } from '@/app/actions';
import styles from './page.module.css';

export default function LedgersPage() {
    const [ledgers, setLedgers] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [operators, setOperators] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState(null);
    const [editingId, setEditingId] = useState(null);

    useEffect(() => {
        fetchUserRole();
        loadCompanies();
        fetchOperators();
    }, []);

    useEffect(() => {
        if (selectedCompany) {
            fetchLedgers(selectedCompany);
        }
    }, [selectedCompany]);

    const fetchUserRole = async () => {
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
        const { data } = await supabase.from('users').select('*').eq('role', 'operator');
        if (data) setOperators(data);
    };

    const fetchLedgers = async (companyId) => {
        const { data } = await supabase
            .from('ledgers')
            .select('*')
            .eq('company_id', companyId)
            .order('name');
        if (data) setLedgers(data);
    };

    const handleCreateLedger = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        formData.append('company_id', selectedCompany);
        const group = formData.get('group');
        formData.append('group_name', group);

        const assigned_operator_id = formData.get('assigned_operator_id');
        const is_cash_ledger = !!assigned_operator_id || group === 'Cash-in-hand';
        formData.append('is_cash_ledger', is_cash_ledger);

        if (editingId) {
            formData.append('id', editingId);
            const result = await updateLedger(formData);
            if (result.error) {
                alert(result.error);
            } else {
                setShowForm(false);
                setEditingId(null);
                fetchLedgers(selectedCompany);
            }
        } else {
            const result = await createLedger(formData);
            if (result.error) {
                alert(result.error);
            } else {
                setShowForm(false);
                fetchLedgers(selectedCompany);
            }
        }
    };

    const handleEdit = (ledger) => {
        setEditingId(ledger.id);
        setShowForm(true);
    };

    const handleDelete = async (ledgerId) => {
        if (!confirm('Are you sure you want to delete this ledger?')) return;

        const result = await deleteLedger(ledgerId);
        if (result.success) {
            fetchLedgers(selectedCompany);
        } else {
            alert(result.error);
        }
    };

    const cancelForm = () => {
        setShowForm(false);
        setEditingId(null);
    };

    if (loading) return <div>Loading...</div>;

    const editingLedger = ledgers.find(l => l.id === editingId);

    return (
        <div>
            <div className={styles.header}>
                <h1 className={styles.title}>Ledgers</h1>
                <div className={styles.controls}>
                    <select
                        value={selectedCompany}
                        onChange={(e) => setSelectedCompany(e.target.value)}
                        className={styles.select}
                    >
                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <Button onClick={() => { setShowForm(!showForm); setEditingId(null); }}>
                        {showForm ? 'Cancel' : 'New Ledger'}
                    </Button>
                </div>
            </div>

            {showForm && (
                <div className={styles.formCard} key={editingId || 'new'}>
                    <form onSubmit={handleCreateLedger} className={styles.form}>
                        <h3>{editingId ? 'Edit Ledger' : 'New Ledger'}</h3>
                        <Input
                            name="name"
                            label="Ledger Name"
                            required
                            placeholder="e.g. ABC Traders"
                            defaultValue={editingLedger?.name}
                        />
                        <div className={styles.selectGroup}>
                            <label>Group</label>
                            <select name="group" className={styles.selectInput} required defaultValue={editingLedger?.group_name}>
                                <optgroup label="Liabilities">
                                    <option value="Capital Account">Capital Account</option>
                                    <option value="Provisions">Provisions</option>
                                    <option value="Sundry Creditors">Sundry Creditors</option>
                                </optgroup>
                                <optgroup label="Assets">
                                    <option value="Current Assets">Current Assets</option>
                                    <option value="Bank Accounts">Bank Accounts</option>
                                    <option value="Cash-in-hand">Cash-in-hand</option>
                                    <option value="Deposits (Asset)">Deposits (Asset)</option>
                                    <option value="Loans & Advances (Asset)">Loans & Advances (Asset)</option>
                                    <option value="Stock-in-hand">Stock-in-hand</option>
                                    <option value="Sundry Debtors">Sundry Debtors</option>
                                </optgroup>
                                <optgroup label="Incomes">
                                    <option value="Sales Accounts">Sales Accounts</option>
                                    <option value="Direct Incomes">Direct Incomes</option>
                                    <option value="Indirect Incomes">Indirect Incomes</option>
                                </optgroup>
                                <optgroup label="Expenses">
                                    <option value="Purchase Accounts">Purchase Accounts</option>
                                    <option value="Indirect Expenses">Indirect Expenses</option>
                                </optgroup>
                            </select>
                        </div>

                        <Input
                            name="sub_group"
                            label="Sub-Group / Classification (Optional)"
                            placeholder="e.g. City, Product Group"
                            defaultValue={editingLedger?.sub_group}
                        />

                        <div className={styles.selectGroup}>
                            <label>Assign Operator (Only for Cash-in-hand)</label>
                            <select name="assigned_operator_id" className={styles.selectInput} defaultValue={editingLedger?.assigned_operator_id || ''}>
                                <option value="">None</option>
                                {operators.map(op => <option key={op.id} value={op.id}>{op.email}</option>)}
                            </select>
                        </div>
                        {!editingId && (
                            <Input name="opening_balance" label="Opening Balance" type="number" placeholder="0.00" />
                        )}
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <Button type="submit">{editingId ? 'Update' : 'Create'}</Button>
                            {editingId && <Button type="button" variant="secondary" onClick={cancelForm}>Cancel</Button>}
                        </div>
                    </form>
                </div>
            )}

            <div className={styles.list}>
                {ledgers.length === 0 ? (
                    <p>No ledgers found for this company.</p>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Group</th>
                                <th>Operator</th>
                                <th>Balance</th>
                                {userRole === 'admin' && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {ledgers.map(ledger => (
                                <tr key={ledger.id}>
                                    <td>{ledger.name}</td>
                                    <td>{ledger.group_name}</td>
                                    <td>{ledger.assigned_operator_id ? 'Yes' : '-'}</td>
                                    <td>{ledger.current_balance}</td>
                                    {userRole === 'admin' && (
                                        <td>
                                            <button onClick={() => handleEdit(ledger)} className={styles.editBtn}>Edit</button>
                                            <button onClick={() => handleDelete(ledger.id)} className={styles.deleteBtn}>Delete</button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
