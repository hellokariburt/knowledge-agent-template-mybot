export default function Page() {
  return (
    <main style={{ maxWidth: 860, margin: '40px auto', fontFamily: 'system-ui, sans-serif', padding: '0 16px' }}>
      <h1 style={{ marginBottom: 8 }}>Ingestion Service</h1>
      <p style={{ marginTop: 0, color: '#4b5563' }}>
        Starter Next.js app for building the content ingestion pipeline.
      </p>

      <section style={{ marginTop: 20, border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Knowledge input</h2>
        <ul>
          <li><code>knowledge/articles</code></li>
          <li><code>knowledge/cards</code></li>
        </ul>
        <p style={{ color: '#4b5563' }}>
          The mock connector reads local files from <code>knowledge/</code> and converts them into deterministic snapshot docs.
        </p>
        <pre style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
{`curl -X POST http://localhost:3000/api/ingest/run`}
        </pre>
      </section>
    </main>
  )
}
