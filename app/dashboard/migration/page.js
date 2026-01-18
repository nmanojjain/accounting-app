import fs from 'fs';
import path from 'path';
import MigrationButton from './MigrationButton';

export default function MigrationPage() {
    const companyId = '77a1e0a2-6a24-4d32-9057-8f983105eabc';
    const filePath = 'e:\\accounting-app\\MITC TrialBal 18012025.csv';

    let ledgers = [];
    let error = null;

    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split('\n');

        // Skip header lines (Row 1 empty, Row 2 Headers)
        // Data starts from Row 3
        const dataLines = lines.slice(2);

        ledgers = dataLines.map(line => {
            // Check if empty line
            if (!line.trim()) return null;

            // CSV columns: S., Ledger Name, Group, D, C, D/C
            const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

            if (parts.length < 5) return null;

            return {
                Name: parts[1]?.trim().replace(/"/g, ''),
                Group: parts[2]?.trim(),
                Debit: parts[3]?.trim(),
                Credit: parts[4]?.trim()
            };
        }).filter(Boolean);

    } catch (e) {
        error = e.message;
    }

    return (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '2rem' }}>Data Migration (Clean Slate)</h1>
            <p style={{ marginBottom: '1rem', color: '#64748b' }}>
                This mode will <strong>WIPE all data</strong> (Ledgers & Vouchers) and import <strong>only Opening Balances</strong> from <code>MITC TrialBal</code>.
            </p>

            {error ? (
                <div style={{ color: 'red' }}>Failed to read CSV: {error}</div>
            ) : (
                <MigrationButton
                    companyId={companyId}
                    ledgers={ledgers}
                    rowCount={ledgers.length}
                />
            )}
        </div>
    );
}
