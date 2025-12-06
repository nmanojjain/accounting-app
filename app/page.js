import Link from 'next/link';
import styles from './page.module.css';

export default function Home() {
    return (
        <main className={styles.main}>
            <div className={styles.container}>
                <h1 className={styles.title}>Dual Entry Accounting</h1>
                <p className={styles.subtitle}>Secure, Cloud-Based Financial Management</p>

                <div className={styles.actions}>
                    <Link href="/login" className={styles.button}>
                        Login to Dashboard
                    </Link>
                </div>
            </div>
        </main>
    );
}
