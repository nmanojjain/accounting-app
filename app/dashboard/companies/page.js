'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Input from '@/components/Input';
import Button from '@/components/Button';
import { createCompany, updateCompany, deleteCompany } from '@/app/actions';
import styles from './page.module.css';

export default function CompaniesPage() {
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [role, setRole] = useState(null);
    const router = useRouter();

    useEffect(() => {
        checkAccess();
    }, []);

    const checkAccess = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
            setRole(userData?.role);
            if (userData?.role !== 'admin') {
                router.push('/dashboard');
                return;
            }
        }
        fetchCompanies();
    };

    const fetchCompanies = async () => {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .order('created_at', { ascending: false });

        if (data) setCompanies(data);
        setLoading(false);
    };

    const handleSubmit = async (formData) => {
        if (editingId) {
            formData.append('id', editingId);
            const result = await updateCompany(formData);
            if (result.success) {
                setShowForm(false);
                setEditingId(null);
                fetchCompanies();
            } else {
                alert(result.error);
            }
        } else {
            const result = await createCompany(formData);
            if (result.success) {
                setShowForm(false);
                fetchCompanies();
            } else {
                alert(result.error);
            }
        }
    };

    const handleEdit = (company) => {
        setEditingId(company.id);
        setShowForm(true);
        // We need to wait for form to render to populate it, or we can control inputs with state.
        // For simplicity with uncontrolled form (formData), we can just let user re-type or we can switch to controlled inputs.
        // Let's switch to a simple DOM manipulation to fill inputs or just render inputs with defaultValues via key.
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure? This will delete all data (Ledgers, Vouchers) for this company!')) return;
        const result = await deleteCompany(id);
        if (result.success) {
            fetchCompanies();
        } else {
            alert(result.error);
        }
    };

    const cancelForm = () => {
        setShowForm(false);
        setEditingId(null);
    };

    if (loading) return <div>Loading...</div>;

    // Find company to edit to get default values
    const editingCompany = companies.find(c => c.id === editingId);

    return (
        <div>
            <div className={styles.header}>
                <h1 className={styles.title}>Companies</h1>
                <Button onClick={() => { setShowForm(!showForm); setEditingId(null); }}>
                    {showForm ? 'Cancel' : 'New Company'}
                </Button>
            </div>

            {showForm && (
                <div className={styles.formCard}>
                    <form action={handleSubmit} className={styles.form} key={editingId || 'new'}>
                        <h3 style={{ marginBottom: '1rem' }}>{editingId ? 'Edit Company' : 'New Company'}</h3>
                        <Input
                            name="name"
                            label="Company Name"
                            required
                            placeholder="Acme Corp"
                            defaultValue={editingCompany?.name}
                        />
                        <Input
                            name="financial_year"
                            label="Financial Year"
                            required
                            placeholder="2024-2025"
                            defaultValue={editingCompany?.financial_year}
                        />
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <Button type="submit">{editingId ? 'Update' : 'Create'}</Button>
                            {editingId && <Button type="button" variant="secondary" onClick={cancelForm}>Cancel</Button>}
                        </div>
                    </form>
                </div>
            )}

            <div className={styles.list}>
                {companies.length === 0 ? (
                    <p>No companies found.</p>
                ) : (
                    companies.map((company) => (
                        <div key={company.id} className={styles.companyCard}>
                            <div>
                                <h3>{company.name}</h3>
                                <p>{company.financial_year}</p>
                            </div>
                            <div className={styles.actions}>
                                <button onClick={() => handleEdit(company)} className={styles.editBtn}>Edit</button>
                                <button onClick={() => handleDelete(company.id)} className={styles.deleteBtn}>Delete</button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
