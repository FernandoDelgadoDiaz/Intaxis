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

  .logo-anim { animation: logoIn 0.7s cubic-bezier(.22,1,.36,1) 0.2s both; }
  .tag-anim  { animation: tagIn  0.6s cubic-bezier(.22,1,.36,1) 0.75s both; }
  .dot       { animation: dotPulse 0.8s ease infinite; }
  .splash-out { animation: fadeOut 0.5s ease forwards; }
`;

export default function SplashScreen({ onDone }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setLeaving(true);
      setTimeout(onDone, 500);
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={leaving ? "splash-out" : ""}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "#a8e63d",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}
    >
      <style>{GLOBAL_CSS}</style>

      {/* Ícono */}
      <div className="logo-anim" style={{ marginBottom: 20 }}>
        <div style={{
          width: 100, height: 100, borderRadius: 28,
          background: "#1a2800",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 12px 40px rgba(0,0,0,.2)",
        }}>
          <span style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 44, fontWeight: 800,
            color: "#a8e63d", letterSpacing: -2, lineHeight: 1,
          }}>iT</span>
        </div>
      </div>

      {/* Nombre */}
      <div className="logo-anim" style={{
        fontFamily: "'Syne', sans-serif",
        fontSize: 42, fontWeight: 800,
        color: "#1a2800", letterSpacing: 2, lineHeight: 1,
      }}>
        intaxis
      </div>

      {/* Tagline */}
      <div className="tag-anim" style={{
        color: "#1a280099", fontSize: 14, fontWeight: 600,
        marginTop: 10, letterSpacing: 1,
      }}>
        Río Gallegos · Santa Cruz
      </div>

      {/* Dots */}
      <div style={{ display: "flex", gap: 7, marginTop: 52 }}>
        {[0, 1, 2].map(i => (
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