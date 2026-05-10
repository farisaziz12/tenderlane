export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  return (
    <div
      style={{
        maxWidth: 520,
        margin: '80px auto',
        textAlign: 'center',
        fontFamily: 'system-ui',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>&#10003;</div>
      <h1 style={{ color: '#28a745', marginBottom: 8 }}>Payment Successful</h1>
      <p style={{ color: '#6c757d', marginBottom: 24 }}>
        Your checkout session has been completed.
      </p>
      {session_id && (
        <p
          style={{
            fontSize: 12,
            color: '#adb5bd',
            fontFamily: 'monospace',
            padding: 12,
            background: '#f8f9fa',
            borderRadius: 8,
            wordBreak: 'break-all',
          }}
        >
          Session ID: {session_id}
        </p>
      )}
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
        Back to Checkout
      </a>
    </div>
  );
}
