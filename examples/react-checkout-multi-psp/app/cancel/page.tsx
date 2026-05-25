import styles from './cancel.module.css';

export default function CancelPage() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.icon}>&#10007;</div>
        <h1 className={styles.heading}>Payment Cancelled</h1>
        <p className={styles.message}>
          Your checkout was cancelled. No charges were made.
        </p>
        <a href="/" className={styles.button}>
          Try Again
        </a>
      </div>
    </div>
  );
}
