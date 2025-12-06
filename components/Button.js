import styles from './Button.module.css';

export default function Button({ children, variant = 'primary', ...props }) {
    return (
        <button
            className={`${styles.button} ${styles[variant]}`}
            {...props}
        >
            {children}
        </button>
    );
}
