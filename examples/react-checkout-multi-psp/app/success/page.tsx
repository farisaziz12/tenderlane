import styles from './success.module.css';

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.icon}>&#10003;</div>
        <h1 className={styles.heading}>Payment Successful</h1>
        <p className={styles.message}>
          Your checkout session has been completed.
        </p>
        {session_id && (
          <div className={styles.sessionPanel}>
            <span className={styles.sessionLabel}>Session ID</span>
            <span className={styles.sessionId}>{session_id}</span>
          </div>
        )}
        <a href="/" className={styles.button}>
          Back to Checkout
        </a>
      </div>
    </div>
  );
}
