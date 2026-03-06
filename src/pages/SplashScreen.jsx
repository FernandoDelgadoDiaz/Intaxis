import { useState, useEffect } from "react";

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&family=Syne:wght@700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #a8e63d; font-family: 'Plus Jakarta Sans', sans-serif; }

  @keyframes logoIn {
    0%   { opacity: 0; transform: scale(0.7) translateY(12px); }
    60%  { opacity: 1; transform: scale(1.04) translateY(-2px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes tagIn {
    0%   { opacity: 0; transform: translateY(10px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes dotPulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50%       { transform: scale(1.5); opacity: 0.5; }
  }
  @keyframes fadeOut {
    0%   { opacity: 1; }
    100% { opacity: 0; pointer-events: none; }
  }
  @keyframes screenIn {
    0%   { opacity: 0; transform: scale(1.04); }
    100% { opacity: 1; transform: scale(1); }
  }

  .logo-text {
    animation: logoIn 0.7s cubic-bezier(.22,1,.36,1) 0.2s both;
  }
  .tag-text {
    animation: tagIn 0.6s cubic-bezier(.22,1,.36,1) 0.75s both;
  }
  .dot {
    animation: dotPulse 0.8s ease infinite;
  }
  .dot:nth-child(2) { animation-delay: 0.15s; }
  .dot:nth-child(3) { animation-delay: 0.30s; }

  .splash-out {
    animation: fadeOut 0.5s ease forwards;
  }
  .screen-in {
    animation: screenIn 0.5s ease forwards;
  }
`;

// ─── SPLASH ───────────────────────────────────────────────────────────────────
function SplashScreen({ onDone }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setLeaving(true);
      setTimeout(onDone, 500);
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={leaving ? "splash-out" : ""} style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#a8e63d",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 0,
    }}>

      {/* Ícono */}
      <div className="logo-text" style={{ marginBottom: 20 }}>
        <div style={{
          width: 100, height: 100, borderRadius: 28,
          background: "#1a2800",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 12px 40px rgba(0,0,0,.2)",
        }}>
          {/* iT — letras del logo */}
          <span style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 44, fontWeight: 800,
            color: "#a8e63d", letterSpacing: -2,
            lineHeight: 1,
          }}>iT</span>
        </div>
      </div>

      {/* Nombre */}
      <div className="logo-text" style={{
        fontFamily: "'Syne', sans-serif",
        fontSize: 42, fontWeight: 800,
        color: "#1a2800", letterSpacing: 2,
        lineHeight: 1,
      }}>
        intaxis
      </div>

      {/* Tagline */}
      <div className="tag-text" style={{
        color: "#1a280099",
        fontSize: 14, fontWeight: 600,
        marginTop: 10, letterSpacing: 1,
      }}>
        Río Gallegos · Santa Cruz
      </div>

      {/* Dots de carga */}
      <div style={{
        display: "flex", gap: 7, marginTop: 52,
      }}>
        {[0,1,2].map(i => (
          <div key={i} className="dot" style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "#1a280055",
            animationDelay: `${i * 0.15}s`,
          }} />
        ))}
      </div>
    </div>
  );
}

// ─── DEMO: pantalla de destino ────────────────────────────────────────────────
function DemoHome() {
  return (
    <div className="screen-in" style={{
      minHeight: "100vh", background: "#f5f5f0",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 16,
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 20,
        background: "#a8e63d",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 800, color: "#1a2800" }}>iT</span>
      </div>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 800, color: "#1a2800" }}>intaxis</div>
      <div style={{ color: "#bbb", fontSize: 14 }}>App lista ✓</div>
      <div style={{ color: "#bbb", fontSize: 12, marginTop: 8 }}>Acá iría la pantalla del pasajero o del chofer</div>
    </div>
  );
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────
export default function IntaxisSplash() {
  const [ready, setReady] = useState(false);

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", position: "relative" }}>
      <style>{GLOBAL_CSS}</style>
      {!ready && <SplashScreen onDone={() => setReady(true)} />}
      {ready && <DemoHome />}
    </div>
  );
}
