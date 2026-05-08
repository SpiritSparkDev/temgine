import Head from 'next/head';

export default function ComingSoonPage() {
  return (
    <>
      <Head>
        <title>Neue Seite in Arbeit</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <main className="soon-page" role="main" aria-labelledby="soon-title">
        <div className="fx-grid" aria-hidden="true" />
        <div className="fx-glow fx-glow-a" aria-hidden="true" />
        <div className="fx-glow fx-glow-b" aria-hidden="true" />

        <section className="soon-card">
          <p className="badge">VEROEFFENTLICHUNG IN ARBEIT</p>
          <h1 id="soon-title">Hier entsteht eine neue Seite</h1>
          <p className="sub">
            Wir arbeiten gerade am Inhalt und am Feinschliff. Schau in Kuerze wieder vorbei.
          </p>

          <div className="actions">
            <a className="btn btn-primary" href="/">Zur Startseite</a>
            <a className="btn btn-ghost" href="/admin">Admin</a>
          </div>
        </section>
      </main>

      <style jsx>{`
        .soon-page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px;
          background:
            radial-gradient(1200px 800px at 10% -20%, rgba(0, 212, 255, 0.1), transparent 55%),
            radial-gradient(900px 600px at 120% 120%, rgba(245, 166, 35, 0.14), transparent 60%),
            linear-gradient(180deg, #06060f 0%, #04040c 100%);
          color: var(--text-primary, #f1f5f9);
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }

        .fx-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(0, 212, 255, 0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 212, 255, 0.08) 1px, transparent 1px);
          background-size: 42px 42px;
          mask-image: radial-gradient(ellipse at center, #000 20%, transparent 70%);
          opacity: 0.25;
          z-index: -2;
        }

        .fx-glow {
          position: absolute;
          width: 360px;
          height: 360px;
          border-radius: 999px;
          filter: blur(50px);
          z-index: -1;
          animation: float 8s ease-in-out infinite;
        }

        .fx-glow-a {
          background: rgba(0, 212, 255, 0.18);
          top: 10%;
          left: 8%;
        }

        .fx-glow-b {
          background: rgba(245, 166, 35, 0.2);
          right: 4%;
          bottom: 6%;
          animation-delay: -3s;
        }

        .soon-card {
          width: min(760px, 100%);
          border: 1px solid rgba(0, 212, 255, 0.25);
          border-radius: 18px;
          padding: clamp(24px, 4vw, 46px);
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.76), rgba(8, 11, 22, 0.84));
          box-shadow:
            0 30px 80px rgba(0, 0, 0, 0.48),
            0 0 30px rgba(0, 212, 255, 0.12),
            inset 0 0 0 1px rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(8px);
          animation: fadeInUp 0.65s ease;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 14px;
          font-size: 0.72rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #34d399;
          font-weight: 800;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(52, 211, 153, 0.45);
          background: rgba(16, 185, 129, 0.12);
        }

        h1 {
          margin: 0;
          font-size: clamp(1.8rem, 5.5vw, 3.4rem);
          line-height: 1.08;
          color: #f8fafc;
          text-wrap: balance;
        }

        .sub {
          margin: 18px 0 0;
          font-size: clamp(1rem, 2vw, 1.1rem);
          line-height: 1.7;
          color: rgba(226, 232, 240, 0.88);
          max-width: 62ch;
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 24px;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 160px;
          min-height: 44px;
          border-radius: 10px;
          padding: 0 16px;
          text-decoration: none;
          font-weight: 700;
          font-size: 0.94rem;
          transition: transform 0.16s ease, opacity 0.16s ease, box-shadow 0.16s ease;
        }

        .btn:hover {
          transform: translateY(-1px);
        }

        .btn-primary {
          color: #0b1220;
          background: linear-gradient(180deg, #fbbf24, #f59e0b);
          box-shadow: 0 8px 22px rgba(245, 158, 11, 0.35);
        }

        .btn-ghost {
          color: #e2e8f0;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(15, 23, 42, 0.4);
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes float {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-14px);
          }
        }

        @media (max-width: 520px) {
          .soon-page {
            padding: 16px;
          }

          .soon-card {
            border-radius: 14px;
            padding: 20px;
          }

          .actions {
            display: grid;
            grid-template-columns: 1fr;
          }

          .btn {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}

// Important: prevent editor-managed external frontend CSS from being injected on this route.
ComingSoonPage.noExternCss = true;
