export default function CancelPage() {
  return (
    <div
      style={{
        maxWidth: 520,
        margin: '80px auto',
        textAlign: 'center',
        fontFamily: 'system-ui',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>&#10007;</div>
      <h1 style={{ color: '#dc3545', marginBottom: 8 }}>Payment Cancelled</h1>
      <p style={{ color: '#6c757d', marginBottom: 24 }}>
        Your checkout was cancelled. No charges were made.
      </p>
      <a
        href="/"
        style={{
          display: 'inline-block',
          marginTop: 24,
          padding: '12px 24px',
          background: '#0070f3',
          color: 'white',
          textDecoration: 'none',
          borderRadius: 8,
          fontWeight: 600,
        }}
      >
        Try Again
      </a>
    </div>
  );
}
