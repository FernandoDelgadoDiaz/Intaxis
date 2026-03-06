import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://fubpzfpystsxmgpqjjol.supabase.co";
const SUPABASE_KEY = "sb_publishable_VJFvgF0mb-Y4jBsL72Gr7w_mx_BCVB1";
const MAPBOX_TOKEN = "pk.eyJ1IjoiaW50YXhpcyIsImEiOiJjbW1lOXBpM2QwN3IyMnRvc2VmNTNhb3pyIn0.rw-kVLlVXVFSmASAS0Y5Cw";
const PLATFORM_COMMISSION = 0.12;

// ─── GLOBAL STYLES ────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Syne:wght@700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  body { background: #f5f5f0; font-family: 'Plus Jakarta Sans', sans-serif; }
  button { cursor: pointer; font-family: inherit; }

  @keyframes slideUp   { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
  @keyframes fadeIn    { from { opacity:0 } to { opacity:1 } }
  @keyframes popIn     { 0%{transform:scale(0.88);opacity:0} 60%{transform:scale(1.03)} 100%{transform:scale(1);opacity:1} }
  @keyframes countdown { from { stroke-dashoffset:0 } to { stroke-dashoffset:283 } }
  @keyframes pulseRing { 0%{transform:scale(1);opacity:.5} 100%{transform:scale(2.2);opacity:0} }
  @keyframes spin      { to { transform:rotate(360deg) } }
  @keyframes bounceIn  { 0%{transform:translateY(100%)} 70%{transform:translateY(-8px)} 100%{transform:translateY(0)} }

  .su  { animation: slideUp .35s cubic-bezier(.22,1,.36,1) forwards; }
  .su2 { animation: slideUp .35s .08s cubic-bezier(.22,1,.36,1) both; }
  .su3 { animation: slideUp .35s .16s cubic-bezier(.22,1,.36,1) both; }

  .trip-card { transition: transform .15s ease, box-shadow .15s ease; }
  .trip-card:active { transform: scale(0.98); }

  .onoff-btn { transition: all .3s cubic-bezier(.22,1,.36,1); }
  .tab-btn { transition: all .2s ease; }
`;

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const MOCK_DRIVER = {
  id: "driver-001",
  full_name: "Carlos Rodríguez",
  plate: "AA 234 BB",
  model_name: "Toyota Etios",
  rating: 4.8,
};

const MOCK_EARNINGS = {
  day:   { gross: 18400, trips: 7 },
  week:  { gross: 94200, trips: 38 },
  month: { gross: 312000, trips: 145 },
};

const MOCK_NEARBY_TRIPS = [
  { id: "t1", passenger: "María G.", origin: "San Martín 450", dest: "Terminal de Ómnibus", distance_km: 3.2, duration_minutes: 9,  fare: 2100 },
  { id: "t2", passenger: "Juan P.",  origin: "Av. Kirchner 1200", dest: "Hospital Regional",  distance_km: 1.8, duration_minutes: 6,  fare: 1600 },
  { id: "t3", passenger: "Laura M.", origin: "Calle 9 de Julio 88", dest: "Aeropuerto",        distance_km: 7.4, duration_minutes: 18, fare: 4200 },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function netEarning(fare) {
  return Math.round(fare * (1 - PLATFORM_COMMISSION));
}

function playTripSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[440,.0],[554,.18],[659,.36],[880,.54]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "triangle"; osc.frequency.value = freq;
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(.4, t+.04);
      gain.gain.linearRampToValueAtTime(0, t+.22);
      osc.start(t); osc.stop(t+.25);
    });
  } catch(_) {}
}

// ─── MAPA ─────────────────────────────────────────────────────────────────────
function DriverMap({ active }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current) return;
    const link = document.createElement("link");
    link.href = "https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css";
    link.rel = "stylesheet";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js";
    script.onload = () => {
      window.mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new window.mapboxgl.Map({
        container: mapRef.current,
        style: "mapbox://styles/mapbox/light-v11",
        center: [-69.2135, -51.623],
        zoom: 14,
      });
      mapInstance.current = map;

      // Marcador del chofer
      const el = document.createElement("div");
      el.style.cssText = `width:40px;height:40px;background:#a8e63d;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 12px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;font-size:18px;`;
      el.textContent = "🚗";
      markerRef.current = new window.mapboxgl.Marker(el)
        .setLngLat([-69.2135, -51.623])
        .addTo(map);

      // Seguir GPS real
      if (navigator.geolocation) {
        navigator.geolocation.watchPosition(pos => {
          const coords = [pos.coords.longitude, pos.coords.latitude];
          markerRef.current?.setLngLat(coords);
          map.easeTo({ center: coords, duration: 800 });
        }, null, { enableHighAccuracy: true });
      }
    };
    document.head.appendChild(script);
    return () => { mapInstance.current?.remove(); };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      {/* Indicador estado sobre el mapa */}
      <div style={{
        position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
        background: active ? "rgba(168,230,61,.95)" : "rgba(255,255,255,.95)",
        backdropFilter: "blur(8px)", borderRadius: 20, padding: "6px 16px",
        display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
        boxShadow: "0 2px 12px rgba(0,0,0,.1)",
      }}>
        {active && <div style={{ position:"relative", width:10, height:10 }}>
          <div style={{ position:"absolute", inset:0, borderRadius:"50%", background:"#1a2800", animation:"pulseRing .9s ease infinite" }} />
          <div style={{ position:"absolute", inset:0, borderRadius:"50%", background:"#1a2800" }} />
        </div>}
        <span style={{ color: active ? "#1a2800" : "#aaa", fontSize: 12, fontWeight: 700 }}>
          {active ? "Disponible · buscando viajes" : "Desconectado"}
        </span>
      </div>
    </div>
  );
}

// ─── MODAL NUEVO VIAJE ────────────────────────────────────────────────────────
function TripRequestModal({ trip, onAccept, onReject }) {
  const TOTAL = 15;
  const [seconds, setSeconds] = useState(TOTAL);
  const circumference = 2 * Math.PI * 45; // r=45

  useEffect(() => {
    playTripSound();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    const t = setInterval(() => setSeconds(s => {
      if (s <= 1) { clearInterval(t); onReject(); }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, []);

  const net = netEarning(trip.fare);
  const progress = ((TOTAL - seconds) / TOTAL) * circumference;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      animation: "fadeIn .2s ease",
    }}>
      <div style={{
        width: "100%", maxWidth: 480, background: "#fff",
        borderRadius: "28px 28px 0 0", padding: "28px 24px 40px",
        animation: "bounceIn .45s cubic-bezier(.22,1,.36,1)",
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, background: "#e8e8e0", borderRadius: 2, margin: "0 auto 24px" }} />

        {/* Header con countdown */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ color: "#aaa", fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>NUEVO VIAJE</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, color: "#1a2800", marginTop: 2 }}>
              ¿Lo tomás?
            </div>
          </div>

          {/* Círculo countdown */}
          <div style={{ position: "relative", width: 64, height: 64 }}>
            <svg width="64" height="64" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="32" cy="32" r="28" fill="none" stroke="#f0f0e8" strokeWidth="4" />
              <circle cx="32" cy="32" r="28" fill="none"
                stroke={seconds > 5 ? "#a8e63d" : "#ef4444"}
                strokeWidth="4" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={progress}
                style={{ transition: "stroke-dashoffset 1s linear, stroke .3s ease" }}
              />
            </svg>
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800,
              color: seconds > 5 ? "#1a2800" : "#ef4444",
            }}>{seconds}</div>
          </div>
        </div>

        {/* Ganancia destacada */}
        <div style={{ background: "linear-gradient(135deg,#f5fce8,#eef7d8)", border: "1.5px solid #d0eaa0", borderRadius: 18, padding: "18px 20px", marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "#7aaa20", fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>TU GANANCIA</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 40, fontWeight: 800, color: "#1a2800", lineHeight: 1.1 }}>
              ${net.toLocaleString("es-AR")}
            </div>
            <div style={{ color: "#aabf88", fontSize: 12, marginTop: 3 }}>Tarifa total ${trip.fare.toLocaleString("es-AR")} · comisión 12%</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#aaa", fontSize: 11 }}>distancia</div>
            <div style={{ color: "#1a2800", fontSize: 18, fontWeight: 800 }}>{trip.distance_km} km</div>
            <div style={{ color: "#aaa", fontSize: 11, marginTop: 6 }}>duración</div>
            <div style={{ color: "#1a2800", fontSize: 18, fontWeight: 800 }}>~{trip.duration_minutes} min</div>
          </div>
        </div>

        {/* Ruta */}
        <div style={{ background: "#f8f8f4", borderRadius: 16, padding: "16px 16px", marginBottom: 24 }}>
          <div style={{ color: "#aaa", fontSize: 10, letterSpacing: 2, fontWeight: 700, marginBottom: 12 }}>RECORRIDO</div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 3, gap: 2, flexShrink: 0 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#a8e63d", border: "2px solid #a8e63d" }} />
              <div style={{ width: 2, height: 22, background: "#d0d0c8", borderRadius: 1 }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#1a2800" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div>
                <div style={{ color: "#aaa", fontSize: 10, fontWeight: 700 }}>ORIGEN</div>
                <div style={{ color: "#1a2800", fontSize: 14, fontWeight: 600, marginTop: 1 }}>{trip.origin}</div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ color: "#aaa", fontSize: 10, fontWeight: 700 }}>DESTINO</div>
                <div style={{ color: "#1a2800", fontSize: 14, fontWeight: 600, marginTop: 1 }}>{trip.dest}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Botones */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
          <button onClick={onReject}
            style={{ background: "#f5f5f0", border: "1.5px solid #e8e8e0", borderRadius: 16, padding: "16px", color: "#aaa", fontSize: 15, fontWeight: 700, transition: "all .15s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#1a2800"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#e8e8e0"}>
            Rechazar
          </button>
          <button onClick={onAccept}
            style={{ background: "#a8e63d", border: "none", borderRadius: 16, padding: "16px", color: "#1a2800", fontSize: 15, fontWeight: 800, fontFamily: "'Syne',sans-serif", boxShadow: "0 6px 20px rgba(168,230,61,.4)", transition: "all .15s" }}
            onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
            onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
            ¡Aceptar viaje! →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CARD VIAJE ACTIVO ────────────────────────────────────────────────────────
function ActiveTripBanner({ trip, onComplete }) {
  return (
    <div style={{ background: "#1a2800", borderRadius: 18, padding: "16px 18px", margin: "0 16px 12px", animation: "popIn .4s cubic-bezier(.22,1,.36,1)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#a8e63d", boxShadow: "0 0 0 0 rgba(168,230,61,.4)", animation: "pulseRing 1s ease infinite" }} />
          <span style={{ color: "#a8e63d", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>VIAJE EN CURSO</span>
        </div>
        <span style={{ color: "#fff", fontSize: 16, fontWeight: 800 }}>${netEarning(trip.fare).toLocaleString("es-AR")}</span>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#a8e63d" }} />
          <div style={{ width: 1.5, height: 16, background: "#ffffff33" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#ffffff99", fontSize: 12 }}>{trip.origin}</div>
          <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginTop: 6 }}>{trip.dest}</div>
        </div>
      </div>
      <button onClick={onComplete}
        style={{ width: "100%", background: "#a8e63d", border: "none", borderRadius: 12, padding: "12px", color: "#1a2800", fontSize: 14, fontWeight: 800, fontFamily: "'Syne',sans-serif" }}>
        Marcar como completado ✓
      </button>
    </div>
  );
}

// ─── GANANCIAS ────────────────────────────────────────────────────────────────
function EarningsPanel({ earnings }) {
  const [period, setPeriod] = useState("day");
  const tabs = [{ key:"day", label:"Hoy" }, { key:"week", label:"Semana" }, { key:"month", label:"Mes" }];
  const data = earnings[period];
  const net = Math.round(data.gross * (1 - PLATFORM_COMMISSION));

  return (
    <div style={{ background: "#fff", borderRadius: 20, padding: "18px 18px", margin: "0 16px 12px", border: "1px solid #f0f0e8" }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, background: "#f5f5f0", padding: 4, borderRadius: 12, marginBottom: 18 }}>
        {tabs.map(t => (
          <button key={t.key} className="tab-btn" onClick={() => setPeriod(t.key)}
            style={{ flex: 1, border: "none", borderRadius: 9, padding: "8px 6px", fontSize: 13, fontWeight: 700,
              background: period===t.key ? "#1a2800" : "none",
              color: period===t.key ? "#a8e63d" : "#aaa" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Número principal */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ color: "#bbb", fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>TU GANANCIA NETA</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 38, fontWeight: 800, color: "#1a2800", lineHeight: 1.1, marginTop: 4 }}>
            ${net.toLocaleString("es-AR")}
          </div>
          <div style={{ color: "#bbb", fontSize: 12, marginTop: 4 }}>Facturado ${data.gross.toLocaleString("es-AR")} · comisión 12%</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#bbb", fontSize: 11 }}>viajes</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 32, fontWeight: 800, color: "#a8e63d" }}>{data.trips}</div>
        </div>
      </div>

      {/* Barra visual */}
      <div style={{ height: 6, background: "#f0f0e8", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", background: "linear-gradient(90deg,#a8e63d,#7aaa20)", borderRadius: 3,
          width: period==="day" ? "35%" : period==="week" ? "68%" : "100%", transition: "width .5s cubic-bezier(.22,1,.36,1)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span style={{ color: "#bbb", fontSize: 11 }}>Promedio ${Math.round(net/data.trips).toLocaleString("es-AR")}/viaje</span>
        <span style={{ color: "#bbb", fontSize: 11 }}>{period==="day"?"Meta: $52.000":period==="week"?"Meta: $270.000":"Meta: $1.080.000"}</span>
      </div>
    </div>
  );
}

// ─── LISTA VIAJES CERCANOS ────────────────────────────────────────────────────
function NearbyTrips({ trips, onSimulateRequest }) {
  return (
    <div style={{ padding: "0 16px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ color: "#1a2800", fontSize: 15, fontWeight: 800 }}>Viajes disponibles cerca</div>
        <div style={{ background: "#f0f9e0", borderRadius: 20, padding: "3px 10px" }}>
          <span style={{ color: "#4a7a00", fontSize: 12, fontWeight: 700 }}>{trips.length} cerca</span>
        </div>
      </div>

      {trips.map((trip, i) => (
        <div key={trip.id} className="trip-card"
          style={{ background: "#fff", borderRadius: 16, padding: "14px 16px", marginBottom: 10, border: "1.5px solid #f0f0e8",
            animation: `slideUp .35s ${i*.08}s cubic-bezier(.22,1,.36,1) both` }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              {/* Ruta compacta */}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, paddingTop: 3, flexShrink: 0 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#a8e63d" }} />
                  <div style={{ width: 1.5, height: 14, background: "#e0e0d8" }} />
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#1a2800" }} />
                </div>
                <div>
                  <div style={{ color: "#888", fontSize: 12, lineHeight: 1.3 }}>{trip.origin}</div>
                  <div style={{ color: "#1a2800", fontSize: 13, fontWeight: 600, marginTop: 8, lineHeight: 1.3 }}>{trip.dest}</div>
                </div>
              </div>
            </div>
            {/* Ganancia */}
            <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: "#1a2800" }}>
                ${netEarning(trip.fare).toLocaleString("es-AR")}
              </div>
              <div style={{ color: "#bbb", fontSize: 11, marginTop: 1 }}>tu ganancia</div>
            </div>
          </div>

          {/* Stats + Botón */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 12 }}>
              <span style={{ color: "#bbb", fontSize: 12 }}>🛣️ {trip.distance_km} km</span>
              <span style={{ color: "#bbb", fontSize: 12 }}>⏱️ ~{trip.duration_minutes} min</span>
            </div>
            <button onClick={() => onSimulateRequest(trip)}
              style={{ background: "#f0f9e0", border: "1px solid #d0eaa0", borderRadius: 20, padding: "6px 14px", color: "#4a7a00", fontSize: 12, fontWeight: 700, transition: "all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.background="#a8e63d"; e.currentTarget.style.color="#1a2800"; }}
              onMouseLeave={e => { e.currentTarget.style.background="#f0f9e0"; e.currentTarget.style.color="#4a7a00"; }}>
              Ver viaje →
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────
export default function IntaxisDriver() {
  const [active, setActive] = useState(false);
  const [pendingTrip, setPendingTrip] = useState(null);
  const [activeTrip, setActiveTrip] = useState(null);
  const [earnings, setEarnings] = useState(MOCK_EARNINGS);
  const [completedCount, setCompletedCount] = useState(0);

  // Simular llegada de viaje automático cuando está activo
  useEffect(() => {
    if (!active || activeTrip) return;
    const t = setTimeout(() => {
      if (active && !pendingTrip && !activeTrip) {
        const random = MOCK_NEARBY_TRIPS[Math.floor(Math.random() * MOCK_NEARBY_TRIPS.length)];
        setPendingTrip(random);
      }
    }, 8000);
    return () => clearTimeout(t);
  }, [active, pendingTrip, activeTrip]);

  const handleAccept = () => {
    setActiveTrip(pendingTrip);
    setPendingTrip(null);
  };

  const handleReject = () => setPendingTrip(null);

  const handleComplete = () => {
    if (!activeTrip) return;
    const net = netEarning(activeTrip.fare);
    setEarnings(prev => ({
      day:   { gross: prev.day.gross + activeTrip.fare,   trips: prev.day.trips + 1 },
      week:  { gross: prev.week.gross + activeTrip.fare,  trips: prev.week.trips + 1 },
      month: { gross: prev.month.gross + activeTrip.fare, trips: prev.month.trips + 1 },
    }));
    setCompletedCount(c => c + 1);
    setActiveTrip(null);
  };

  const toggleActive = () => {
    setActive(v => !v);
    if (active) { setPendingTrip(null); setActiveTrip(null); }
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", fontFamily: "'Plus Jakarta Sans',sans-serif", background: "#f5f5f0", minHeight: "100vh" }}>
      <style>{GLOBAL_CSS}</style>

      {/* MAPA */}
      <div style={{ height: 280, background: "#e8f0e0", position: "relative" }}>
        <DriverMap active={active} />

        {/* Logo flotante */}
        <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 10 }}>
          {/* Botón ON/OFF */}
          <button className="onoff-btn" onClick={toggleActive}
            style={{
              width: 72, height: 72, borderRadius: "50%", border: "none",
              background: active ? "#a8e63d" : "#fff",
              boxShadow: active
                ? "0 0 0 8px rgba(168,230,61,.2), 0 8px 24px rgba(168,230,61,.4)"
                : "0 4px 20px rgba(0,0,0,.15)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
            }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
              stroke={active ? "#1a2800" : "#ccc"} strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2v6M6.3 6.3l4.2 4.2M4.9 13H2M6.3 17.7l4.2-4.2M12 22v-6M17.7 17.7l-4.2-4.2M19.1 13H22M17.7 6.3l-4.2 4.2"/>
            </svg>
            <span style={{ fontSize: 9, fontWeight: 800, color: active ? "#1a2800" : "#ccc", letterSpacing: 1 }}>
              {active ? "ON" : "OFF"}
            </span>
          </button>
        </div>
      </div>

      {/* PANEL */}
      <div style={{ background: "#f5f5f0", borderRadius: "24px 24px 0 0", marginTop: -16, paddingTop: 12 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 20px 16px" }}>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: "#1a2800" }}>
              Hola, {MOCK_DRIVER.full_name.split(" ")[0]} 👋
            </div>
            <div style={{ color: "#bbb", fontSize: 12, marginTop: 2 }}>{MOCK_DRIVER.plate} · ★ {MOCK_DRIVER.rating}</div>
          </div>
          {completedCount > 0 && (
            <div style={{ background: "#1a2800", borderRadius: 20, padding: "6px 14px", animation: "popIn .3s ease" }}>
              <span style={{ color: "#a8e63d", fontSize: 13, fontWeight: 800 }}>+{completedCount} hoy ✓</span>
            </div>
          )}
        </div>

        {/* Viaje activo */}
        {activeTrip && <ActiveTripBanner trip={activeTrip} onComplete={handleComplete} />}

        {/* Mensaje si está offline */}
        {!active && !activeTrip && (
          <div style={{ margin: "0 16px 12px", background: "#fff", borderRadius: 18, padding: "20px", textAlign: "center", border: "1.5px dashed #e8e8e0" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>😴</div>
            <div style={{ color: "#1a2800", fontSize: 15, fontWeight: 700 }}>Estás desconectado</div>
            <div style={{ color: "#bbb", fontSize: 13, marginTop: 4 }}>Tocá el botón del mapa para empezar a recibir viajes</div>
          </div>
        )}

        {/* Ganancias */}
        <EarningsPanel earnings={earnings} />

        {/* Viajes cercanos — solo si está activo */}
        {active && !activeTrip && (
          <NearbyTrips trips={MOCK_NEARBY_TRIPS} onSimulateRequest={setPendingTrip} />
        )}

        {/* Mensaje de espera si activo pero sin viajes cercanos */}
        {active && !activeTrip && (
          <div style={{ textAlign: "center", padding: "8px 0 32px", color: "#bbb" }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid #a8e63d", borderTopColor: "transparent", animation: "spin .8s linear infinite", margin: "0 auto 8px" }} />
            <div style={{ fontSize: 13 }}>Buscando viajes cerca tuyo...</div>
          </div>
        )}

        {!active && <div style={{ height: 40 }} />}
      </div>

      {/* Modal viaje entrante */}
      {pendingTrip && (
        <TripRequestModal trip={pendingTrip} onAccept={handleAccept} onReject={handleReject} />
      )}
    </div>
  );
}
