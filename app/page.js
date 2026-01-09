import Link from 'next/link';
import styles from './page.module.css';

export default function Home() {
    return (
        <main className={styles.main}>
            <div className={styles.hero}>
                <div className={styles.glow} />
                <div className={styles.container}>
                    <div className={styles.badge}>Next-Gen Accounting</div>
                    <h1 className={styles.title}>
                        Financial Control <br />
                        <span className={styles.gradientText}>Redefined.</span>
                    </h1>
                    <p className={styles.subtitle}>
                        Secure, cloud-based ledger management designed for <br />
                        speed and precision on any device.
                    </p>

                    <div className={styles.actions}>
                        <Link href="/login" className={styles.primaryButton}>
                            Get Started
                        </Link>
                    </div>
                </div>
            </div>
        </main>
    );
}
