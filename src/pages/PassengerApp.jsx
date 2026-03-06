import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://fubpzfpystsxmgpqjjol.supabase.co";
const SUPABASE_KEY = "sb_publishable_VJFvgF0mb-Y4jBsL72Gr7w_mx_BCVB1";
const MAPBOX_TOKEN = "pk.eyJ1IjoiaW50YXhpcyIsImEiOiJjbW1lOXBpM2QwN3IyMnRvc2VmNTNhb3pyIn0.rw-kVLlVXVFSmASAS0Y5Cw";
const RIO_GALLEGOS_CENTER = [-69.2135, -51.623];

// ─── FONTS & GLOBAL STYLES ───────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  body { background: #f5f5f0; font-family: 'Plus Jakarta Sans', sans-serif; }
  input::placeholder { color: #bbb; }
  input:focus { outline: none; }
  button { cursor: pointer; font-family: inherit; }

  @keyframes slideUp   { from { opacity:0; transform:translateY(18px) } to { opacity:1; transform:translateY(0) } }
  @keyframes fadeIn    { from { opacity:0 } to { opacity:1 } }
  @keyframes popIn     { 0% { transform:scale(0.85); opacity:0 } 60% { transform:scale(1.04) } 100% { transform:scale(1); opacity:1 } }
  @keyframes bounceY   { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-10px) } }
  @keyframes pulseRing { 0% { transform:scale(1); opacity:.6 } 100% { transform:scale(1.7); opacity:0 } }
  @keyframes shimmer   { 0% { background-position:-200% 0 } 100% { background-position:200% 0 } }
  @keyframes spin      { to { transform:rotate(360deg) } }

  .su  { animation: slideUp .35s cubic-bezier(.22,1,.36,1) forwards; }
  .su2 { animation: slideUp .35s .1s cubic-bezier(.22,1,.36,1) both; }
  .su3 { animation: slideUp .35s .2s cubic-bezier(.22,1,.36,1) both; }
  .fade { animation: fadeIn .4s ease forwards; }

  .pill-tab { transition: all .22s ease; }
  .pill-tab.active { background: #a8e63d; color: #1a2800; }
  .pill-tab:not(.active) { background: #f0f0ea; color: #999; }

  .addr-input:focus-within { border-color: #a8e63d !important; box-shadow: 0 0 0 3px rgba(168,230,61,.15); }

  .confirm-btn { transition: all .18s ease; }
  .confirm-btn:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(168,230,61,.45); }
  .confirm-btn:not(:disabled):active { transform: translateY(0); }

  .suggestion-item:hover { background: #f8f8f2 !important; }
`;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Error");
  return data;
}

async function geocodeAddress(query) {
  if (MAPBOX_TOKEN === "TU_TOKEN_MAPBOX_AQUI") {
    return [
      { place_name: `${query}, Río Gallegos, Santa Cruz`, center: [-69.2135 + Math.random()*.02-.01, -51.623 + Math.random()*.02-.01] },
      { place_name: `${query} 100, Barrio Centro`, center: [-69.22, -51.628] },
      { place_name: `${query} 500, Río Gallegos`, center: [-69.21, -51.62] },
    ];
  }
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query+" Río Gallegos Argentina")}.json?access_token=${MAPBOX_TOKEN}&country=AR&proximity=${RIO_GALLEGOS_CENTER[0]},${RIO_GALLEGOS_CENTER[1]}&limit=4&language=es`;
  const res = await fetch(url);
  const data = await res.json();
  return data.features || [];
}

async function getRouteInfo(origin, dest) {
  if (MAPBOX_TOKEN === "TU_TOKEN_MAPBOX_AQUI") {
    const km = +(2 + Math.random() * 7).toFixed(1);
    return { distance_km: km, duration_minutes: +(km * 2.8).toFixed(0) };
  }
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin[0]},${origin[1]};${dest[0]},${dest[1]}?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.routes?.length) throw new Error("Sin ruta");
  return { distance_km: +(data.routes[0].distance/1000).toFixed(1), duration_minutes: +(data.routes[0].duration/60).toFixed(0) };
}

function calculateFare(config, km, mins) {
  const hour = new Date().getHours();
  const isNight = hour >= (config.night_start_hour||22) || hour < (config.night_end_hour||6);
  const surcharge = isNight ? (config.night_surcharge||1.3) : 1.0;
  const raw = (Number(config.base_fare) + km*Number(config.price_per_km) + mins*Number(config.price_per_minute||80)) * Number(config.adjustment_factor) * surcharge;
  return { fare: Math.max(Math.round(raw), Number(config.minimum_fare||1200)), isNight };
}

function playArrivalSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523,659,784,1047].forEach((freq,i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.value = freq;
      const t = ctx.currentTime + i*.18;
      gain.gain.setValueAtTime(0,t); gain.gain.linearRampToValueAtTime(.3,t+.05); gain.gain.linearRampToValueAtTime(0,t+.3);
      osc.start(t); osc.stop(t+.35);
    });
  } catch(_) {}
}

const MOCK_DRIVER = { full_name: "Carlos Rodríguez", plate: "AA 234 BB", model_name: "Toyota Etios", model_year: 2019, type: "Remis", eta_minutes: 4, rating: 4.8 };

// ─── MAP PLACEHOLDER ─────────────────────────────────────────────────────────
function MapPlaceholder({ label = "Mapa disponible con token MapBox" }) {
  return (
    <div style={{ width:"100%", height:"100%", background:"linear-gradient(135deg,#eef4e8 0%,#e8f0e0 50%,#eef4e8 100%)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8 }}>
      <div style={{ fontSize:32 }}>🗺️</div>
      <div style={{ color:"#aabf88", fontSize:12, fontWeight:600 }}>{label}</div>
    </div>
  );
}

// ─── ADDRESS INPUT ────────────────────────────────────────────────────────────
function AddressInput({ dot, value, onChange, onSelect, placeholder, onGPS, showGPS }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const debRef = useRef(null);

  const handleChange = (v) => {
    onChange(v);
    clearTimeout(debRef.current);
    if (v.length < 3) { setSuggestions([]); return; }
    debRef.current = setTimeout(async () => {
      setLoading(true);
      try { setSuggestions(await geocodeAddress(v)); } finally { setLoading(false); }
    }, 400);
  };

  return (
    <div style={{ position:"relative" }}>
      <div className="addr-input" style={{ display:"flex", alignItems:"center", gap:12, background:"#fff", border:"1.5px solid #e8e8e0", borderRadius:14, padding:"13px 14px", transition:"all .2s" }}>
        {/* Dot indicador */}
        <div style={{ width:10, height:10, borderRadius:"50%", background: dot==="origin" ? "#a8e63d" : "#1a2800", border: dot==="origin" ? "2px solid #a8e63d" : "2px solid #1a2800", flexShrink:0 }} />
        <input
          value={value}
          onChange={e => handleChange(e.target.value)}
          onBlur={() => setTimeout(() => setSuggestions([]), 200)}
          placeholder={placeholder}
          style={{ flex:1, border:"none", background:"none", fontSize:14, color:"#1a2800", fontWeight:500, fontFamily:"inherit" }}
        />
        {loading && <div style={{ width:14, height:14, borderRadius:"50%", border:"2px solid #a8e63d", borderTopColor:"transparent", animation:"spin .7s linear infinite", flexShrink:0 }} />}
        {showGPS && !loading && (
          <button onClick={onGPS} style={{ background:"none", border:"none", padding:0, display:"flex", alignItems:"center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a8e63d" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8" strokeDasharray="2 4"/></svg>
          </button>
        )}
      </div>
      {suggestions.length > 0 && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:300, background:"#fff", borderRadius:14, border:"1px solid #e8e8e0", boxShadow:"0 8px 28px rgba(0,0,0,.08)", overflow:"hidden" }}>
          {suggestions.map((s,i) => (
            <button key={i} className="suggestion-item" onClick={() => { onSelect(s); setSuggestions([]); }}
              style={{ display:"flex", alignItems:"center", gap:10, width:"100%", background:"none", border:"none", padding:"12px 14px", textAlign:"left", borderBottom: i<suggestions.length-1 ? "1px solid #f5f5f0" : "none", transition:"background .15s" }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:"#f0f5e8", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a8e63d" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
              </div>
              <div>
                <div style={{ color:"#1a2800", fontSize:13, fontWeight:600, lineHeight:1.3 }}>{s.place_name.split(",")[0]}</div>
                <div style={{ color:"#aaa", fontSize:11, marginTop:1 }}>{s.place_name.split(",").slice(1).join(",").trim()}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PANTALLA POST-LLEGADA ────────────────────────────────────────────────────
function ArrivedScreen({ trip, driver }) {
  return (
    <div style={{ minHeight:"100vh", background:"#fff", fontFamily:"'Plus Jakarta Sans',sans-serif", display:"flex", flexDirection:"column" }}>
      <style>{GLOBAL_CSS}</style>

      {/* Top verde */}
      <div style={{ background:"#a8e63d", padding:"48px 24px 32px", textAlign:"center", animation:"fadeIn .4s ease" }}>
        <div style={{ fontSize:72, animation:"bounceY .9s ease infinite", marginBottom:12 }}>🚗</div>
        <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:30, fontWeight:800, color:"#1a2800", lineHeight:1.1 }}>¡Tu auto<br/>llegó!</div>
        <div style={{ color:"#1a280099", fontSize:14, marginTop:8, fontWeight:500 }}>Salí que te está esperando afuera</div>
      </div>

      {/* Card del chofer */}
      <div style={{ flex:1, padding:20, display:"flex", flexDirection:"column", gap:12 }}>

        {/* Patente destacada */}
        <div className="su" style={{ background:"#f5f5f0", borderRadius:18, padding:"20px 24px", textAlign:"center", border:"2px solid #a8e63d" }}>
          <div style={{ color:"#aaa", fontSize:10, letterSpacing:2, fontWeight:700, marginBottom:8 }}>BUSCÁ ESTE AUTO</div>
          <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:32, fontWeight:800, color:"#1a2800", letterSpacing:3 }}>{driver.plate}</div>
          <div style={{ color:"#888", fontSize:13, marginTop:6 }}>{driver.model_name} {driver.model_year}</div>
        </div>

        {/* Chofer */}
        <div className="su2" style={{ background:"#fff", borderRadius:18, padding:"16px 18px", border:"1.5px solid #e8e8e0", display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:48, height:48, borderRadius:"50%", background:"#f0f5e8", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>🧑‍✈️</div>
          <div style={{ flex:1 }}>
            <div style={{ color:"#1a2800", fontSize:16, fontWeight:700 }}>{driver.full_name}</div>
            <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:3 }}>
              <span style={{ color:"#a8e63d", fontSize:13 }}>★</span>
              <span style={{ color:"#888", fontSize:13 }}>{driver.rating}</span>
              <span style={{ color:"#e0e0d8", margin:"0 4px" }}>·</span>
              <span style={{ color:"#888", fontSize:13 }}>{driver.type}</span>
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ color:"#aaa", fontSize:11 }}>Total</div>
            <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:22, fontWeight:800, color:"#1a2800" }}>${trip.fare.toLocaleString("es-AR")}</div>
          </div>
        </div>

        {/* Para otra persona */}
        {trip.forName && (
          <div className="su3" style={{ background:"#f5f9ee", borderRadius:14, padding:"12px 16px", display:"flex", gap:10, alignItems:"center", border:"1px solid #d8efc0" }}>
            <span style={{ fontSize:18 }}>👤</span>
            <div>
              <div style={{ color:"#888", fontSize:11 }}>Viaje para</div>
              <div style={{ color:"#1a2800", fontSize:14, fontWeight:700 }}>{trip.forName}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PANTALLA DE ESPERA ───────────────────────────────────────────────────────
function WaitingScreen({ trip, driver, onCancel }) {
  const [seconds, setSeconds] = useState(driver.eta_minutes * 60);
  const [arrived, setArrived] = useState(false);
  const [dots, setDots] = useState(".");
  const firedRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setSeconds(s => {
      if (s <= 1 && !firedRef.current) {
        firedRef.current = true;
        if (navigator.vibrate) navigator.vibrate([300,100,300,100,600]);
        playArrivalSound();
        setArrived(true);
      }
      return Math.max(0, s-1);
    }), 1000);
    const d = setInterval(() => setDots(p => p.length>=3 ? "." : p+"."), 500);
    return () => { clearInterval(t); clearInterval(d); };
  }, []);

  const mins = Math.floor(seconds/60);
  const secs = seconds%60;

  if (arrived) return <ArrivedScreen trip={trip} driver={driver} />;

  return (
    <div style={{ minHeight:"100vh", background:"#f5f5f0", fontFamily:"'Plus Jakarta Sans',sans-serif", display:"flex", flexDirection:"column" }}>
      <style>{GLOBAL_CSS}</style>

      {/* Header */}
      <div style={{ background:"#fff", padding:"16px 20px", display:"flex", alignItems:"center", gap:12, borderBottom:"1px solid #f0f0e8" }}>
        <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:20, fontWeight:800, color:"#1a2800" }}>intaxis</div>
        <div style={{ flex:1 }} />
        <div style={{ background:"#f0f9e0", borderRadius:20, padding:"4px 12px", display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:"#a8e63d", boxShadow:"0 0 0 0 rgba(168,230,61,.4)", animation:"pulseRing 1.2s ease infinite" }} />
          <span style={{ color:"#1a2800", fontSize:12, fontWeight:700 }}>En camino</span>
        </div>
      </div>

      {/* Mapa */}
      <div style={{ height:220, background:"#e8f0e0", position:"relative", overflow:"hidden" }}>
        <MapPlaceholder />
        {/* Overlay info ruta */}
        <div style={{ position:"absolute", bottom:12, left:12, right:12, background:"rgba(255,255,255,.92)", backdropFilter:"blur(8px)", borderRadius:12, padding:"10px 14px", display:"flex", gap:16 }}>
          <div style={{ display:"flex", gap:8, alignItems:"center", flex:1 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:"#a8e63d", flexShrink:0 }} />
            <span style={{ color:"#666", fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{trip.originAddress.split(",")[0]}</span>
          </div>
          <div style={{ width:1, background:"#e8e8e0" }} />
          <div style={{ display:"flex", gap:8, alignItems:"center", flex:1 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:"#1a2800", flexShrink:0 }} />
            <span style={{ color:"#666", fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{trip.destAddress.split(",")[0]}</span>
          </div>
        </div>
      </div>

      {/* Panel deslizable */}
      <div style={{ flex:1, background:"#fff", borderRadius:"24px 24px 0 0", marginTop:-16, padding:"24px 20px", boxShadow:"0 -4px 24px rgba(0,0,0,.06)" }}>

        {/* Countdown */}
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ color:"#bbb", fontSize:11, letterSpacing:2, fontWeight:700, marginBottom:6 }}>LLEGA EN</div>
          <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:52, fontWeight:800, color:"#1a2800", lineHeight:1 }}>
            {mins > 0 ? `${mins}:${secs.toString().padStart(2,"0")}` : `${secs}s`}
          </div>
          <div style={{ color:"#bbb", fontSize:13, marginTop:4 }}>
            {seconds > 0 ? `Tu conductor está llegando${dots}` : "¡Ya llegó!"}
          </div>
        </div>

        {/* Separador */}
        <div style={{ height:1, background:"#f5f5f0", marginBottom:20 }} />

        {/* Info chofer */}
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:18 }}>
          <div style={{ position:"relative", flexShrink:0 }}>
            <div style={{ width:52, height:52, borderRadius:"50%", background:"#f0f5e8", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24 }}>🧑‍✈️</div>
            <div style={{ position:"absolute", bottom:0, right:0, background:"#a8e63d", borderRadius:"50%", width:16, height:16, display:"flex", alignItems:"center", justifyContent:"center", border:"2px solid #fff" }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#1a2800" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ color:"#1a2800", fontSize:16, fontWeight:700 }}>{driver.full_name}</div>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:2 }}>
              <span style={{ color:"#a8e63d", fontSize:12 }}>★ {driver.rating}</span>
              <span style={{ color:"#e0e0d8" }}>·</span>
              <span style={{ color:"#aaa", fontSize:12 }}>{driver.type}</span>
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ color:"#aaa", fontSize:11 }}>Patente</div>
            <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:15, fontWeight:800, color:"#1a2800", letterSpacing:1 }}>{driver.plate}</div>
          </div>
        </div>

        {/* Stats del viaje */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:18 }}>
          {[
            { icon:"🛣️", val:`${trip.distance_km} km`, lbl:"distancia" },
            { icon:"⏱️", val:`~${trip.duration_minutes} min`, lbl:"viaje" },
            { icon:"💰", val:`$${trip.fare.toLocaleString("es-AR")}`, lbl:"total" },
          ].map(item => (
            <div key={item.lbl} style={{ background:"#f8f8f4", borderRadius:14, padding:"12px 10px", textAlign:"center" }}>
              <div style={{ fontSize:18, marginBottom:4 }}>{item.icon}</div>
              <div style={{ color:"#1a2800", fontSize:14, fontWeight:700 }}>{item.val}</div>
              <div style={{ color:"#bbb", fontSize:10, marginTop:2 }}>{item.lbl}</div>
            </div>
          ))}
        </div>



        {/* Para otra persona */}
        {trip.forName && (
          <div style={{ background:"#f5f9ee", borderRadius:12, padding:"10px 14px", display:"flex", gap:8, alignItems:"center", marginBottom:16, border:"1px solid #d8efc0" }}>
            <span style={{ fontSize:15 }}>👤</span>
            <span style={{ color:"#4a7a00", fontSize:13, fontWeight:600 }}>Viaje para {trip.forName}</span>
          </div>
        )}

        {/* Cancelar */}
        {seconds > 30 && (
          <button onClick={onCancel} style={{ width:"100%", background:"none", border:"1.5px solid #e8e8e0", borderRadius:14, padding:"13px", color:"#bbb", fontSize:14, fontWeight:600, transition:"all .2s" }}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#1a2800"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="#e8e8e0"}>
            Cancelar viaje
          </button>
        )}
      </div>
    </div>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────
export default function IntaxisPassenger() {
  const [config, setConfig] = useState(null);
  const [mode, setMode] = useState("self");
  const [forName, setForName] = useState("");
  const [originText, setOriginText] = useState("");
  const [originCoords, setOriginCoords] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [destText, setDestText] = useState("");
  const [destCoords, setDestCoords] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [fareResult, setFareResult] = useState(null);
  const [error, setError] = useState("");
  const [confirmedTrip, setConfirmedTrip] = useState(null);

  useEffect(() => {
    supabaseFetch("global_config?select=*&limit=1")
      .then(d => setConfig(d[0] || {}))
      .catch(() => setConfig({ base_fare:800, price_per_km:350, price_per_minute:80, adjustment_factor:.90, minimum_fare:1200, night_surcharge:1.3, night_start_hour:22, night_end_hour:6 }));
  }, []);

  const getGPS = useCallback(() => {
    if (!navigator.geolocation) { setError("GPS no disponible."); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const coords = [pos.coords.longitude, pos.coords.latitude];
        setOriginCoords(coords);
        if (MAPBOX_TOKEN !== "TU_TOKEN_MAPBOX_AQUI") {
          try {
            const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${coords[0]},${coords[1]}.json?access_token=${MAPBOX_TOKEN}&language=es`);
            const data = await res.json();
            setOriginText(data.features?.[0]?.place_name || "Mi ubicación");
          } catch { setOriginText("Mi ubicación actual"); }
        } else { setOriginText("Mi ubicación actual (GPS)"); }
        setGpsLoading(false);
      },
      () => { setError("No se pudo obtener tu ubicación."); setGpsLoading(false); }
    );
  }, []);

  useEffect(() => {
    if (mode === "self") getGPS();
    else { setOriginText(""); setOriginCoords(null); }
  }, [mode]);

  useEffect(() => {
    if (!originCoords || !destCoords || !config) return;
    setCalculating(true); setRouteInfo(null); setFareResult(null); setError("");
    getRouteInfo(originCoords, destCoords)
      .then(route => { setRouteInfo(route); setFareResult(calculateFare(config, route.distance_km, route.duration_minutes)); })
      .catch(() => setError("No se pudo calcular la ruta."))
      .finally(() => setCalculating(false));
  }, [originCoords, destCoords, config]);

  const handleConfirm = async () => {
    if (!fareResult || !routeInfo) return;
    try {
      await supabaseFetch("trips", { method:"POST", body: JSON.stringify({ origin_lat:originCoords[1], origin_lng:originCoords[0], destination_lat:destCoords[1], destination_lng:destCoords[0], origin_address:originText, destination_address:destText, distance_km:routeInfo.distance_km, duration_minutes:routeInfo.duration_minutes, estimated_fare:fareResult.fare, surcharge_applied:fareResult.surcharge, status:"requested" }) });
    } catch(_) {}
    setConfirmedTrip({ fare:fareResult.fare, isNight:fareResult.isNight, distance_km:routeInfo.distance_km, duration_minutes:routeInfo.duration_minutes, originCoords, destCoords, originAddress:originText, destAddress:destText, forName: mode==="other" ? forName : null });
  };

  const canConfirm = originCoords && destCoords && fareResult && !calculating && (mode==="self" || forName.trim());

  if (confirmedTrip) return (
    <div style={{ maxWidth:480, margin:"0 auto", fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      <style>{GLOBAL_CSS}</style>
      <WaitingScreen trip={confirmedTrip} driver={MOCK_DRIVER} onCancel={() => setConfirmedTrip(null)} />
    </div>
  );

  return (
    <div style={{ maxWidth:480, margin:"0 auto", fontFamily:"'Plus Jakarta Sans',sans-serif", background:"#f5f5f0", minHeight:"100vh" }}>
      <style>{GLOBAL_CSS}</style>

      {/* MAPA PROTAGONISTA */}
      <div style={{ height:260, background:"#e8f0e0", position:"relative" }}>
        <MapPlaceholder />
        {/* Header flotante sobre el mapa */}
        <div style={{ position:"absolute", top:0, left:0, right:0, padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:22, fontWeight:800, color:"#1a2800", background:"rgba(255,255,255,.9)", backdropFilter:"blur(8px)", borderRadius:12, padding:"6px 14px" }}>
            intaxis
          </div>
          <div style={{ background:"rgba(255,255,255,.9)", backdropFilter:"blur(8px)", borderRadius:12, padding:"6px 12px", display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:"#a8e63d" }} />
            <span style={{ color:"#1a2800", fontSize:12, fontWeight:700 }}>Río Gallegos</span>
          </div>
        </div>
      </div>

      {/* PANEL DESLIZABLE */}
      <div style={{ background:"#fff", borderRadius:"24px 24px 0 0", marginTop:-20, padding:"10px 20px 32px", minHeight:"calc(100vh - 240px)", boxShadow:"0 -6px 32px rgba(0,0,0,.07)" }}>

        {/* Handle */}
        <div style={{ width:40, height:4, background:"#e8e8e0", borderRadius:2, margin:"0 auto 20px" }} />

        {/* Toggle Para mí / Para otro */}
        <div style={{ display:"flex", gap:6, background:"#f5f5f0", padding:4, borderRadius:14, marginBottom:20 }}>
          {[{ key:"self", icon:"🧍", label:"Para mí" },{ key:"other", icon:"👥", label:"Para otra persona" }].map(opt => (
            <button key={opt.key} className={`pill-tab ${mode===opt.key?"active":""}`} onClick={() => setMode(opt.key)}
              style={{ flex:1, border:"none", borderRadius:11, padding:"10px 8px", fontSize:13, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              <span>{opt.icon}</span> {opt.label}
            </button>
          ))}
        </div>

        {/* Nombre si es para otro */}
        {mode === "other" && (
          <div className="su" style={{ marginBottom:14 }}>
            <div style={{ color:"#bbb", fontSize:10, letterSpacing:2, fontWeight:700, marginBottom:6 }}>NOMBRE DEL PASAJERO</div>
            <div className="addr-input" style={{ display:"flex", alignItems:"center", gap:12, background:"#fff", border:"1.5px solid #e8e8e0", borderRadius:14, padding:"13px 14px", transition:"all .2s" }}>
              <span style={{ fontSize:16 }}>👤</span>
              <input value={forName} onChange={e=>setForName(e.target.value)} placeholder="Nombre de quien viaja"
                style={{ flex:1, border:"none", background:"none", fontSize:14, color:"#1a2800", fontWeight:500, fontFamily:"inherit" }} />
            </div>
          </div>
        )}

        {/* Inputs de dirección */}
        <div style={{ position:"relative", marginBottom:14 }}>
          {/* Línea conectora */}
          <div style={{ position:"absolute", left:19, top:42, bottom:42, width:2, background:"linear-gradient(to bottom, #a8e63d, #1a2800)", zIndex:0, borderRadius:2 }} />

          <div style={{ position:"relative", zIndex:1, marginBottom:8 }}>
            {mode === "self" ? (
              <div className="addr-input" style={{ display:"flex", alignItems:"center", gap:12, background:"#fff", border:"1.5px solid #e8e8e0", borderRadius:14, padding:"13px 14px" }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:"#a8e63d", flexShrink:0 }} />
                <span style={{ flex:1, fontSize:14, color: originCoords?"#1a2800":"#bbb", fontWeight: originCoords?500:400 }}>
                  {gpsLoading ? "Obteniendo ubicación..." : originText || "Sin ubicación GPS"}
                </span>
                <button onClick={getGPS} style={{ background:"none", border:"none", padding:0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={originCoords?"#a8e63d":"#ccc"} strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
                </button>
              </div>
            ) : (
              <AddressInput dot="origin" value={originText} onChange={setOriginText} onSelect={s=>{setOriginText(s.place_name);setOriginCoords(s.center);}} placeholder="¿Desde dónde?" />
            )}
          </div>

          <div style={{ position:"relative", zIndex:1 }}>
            <AddressInput dot="dest" value={destText} onChange={setDestText} onSelect={s=>{setDestText(s.place_name);setDestCoords(s.center);}} placeholder="¿A dónde vas?" />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background:"#fff5f5", border:"1px solid #fcc", borderRadius:12, padding:"11px 14px", color:"#cc3333", fontSize:13, marginBottom:14 }}>
            {error}
          </div>
        )}

        {/* Calculando */}
        {calculating && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, padding:"20px 0", color:"#bbb" }}>
            <div style={{ width:18, height:18, borderRadius:"50%", border:"2px solid #a8e63d", borderTopColor:"transparent", animation:"spin .7s linear infinite" }} />
            <span style={{ fontSize:14 }}>Calculando precio...</span>
          </div>
        )}

        {/* RESULTADO */}
        {fareResult && routeInfo && !calculating && (
          <div className="su">
            {/* Precio */}
            <div style={{ background:"linear-gradient(135deg,#f5fce8,#eef7d8)", border:"1.5px solid #d0eaa0", borderRadius:18, padding:"20px 20px", marginBottom:14, textAlign:"center" }}>
              
              <div style={{ color:"#7aaa20", fontSize:11, letterSpacing:2, fontWeight:700, marginBottom:4 }}>PRECIO FIJO</div>
              <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:44, fontWeight:800, color:"#1a2800", lineHeight:1 }}>
                ${fareResult.fare.toLocaleString("es-AR")}
              </div>
              <div style={{ color:"#aabf88", fontSize:12, marginTop:4 }}>Sin sorpresas · Precio confirmado</div>

              {/* Stats inline */}
              <div style={{ display:"flex", justifyContent:"center", gap:0, marginTop:16, paddingTop:16, borderTop:"1px solid #d0eaa0" }}>
                {[
                  { val:`${routeInfo.distance_km} km`, lbl:"distancia" },
                  { val:`~${routeInfo.duration_minutes} min`, lbl:"de viaje" },
                  { val:"~4 min", lbl:"de espera" },
                ].map((item, i) => (
                  <div key={i} style={{ flex:1, textAlign:"center", borderLeft: i>0?"1px solid #d0eaa0":"none", padding:"0 8px" }}>
                    <div style={{ color:"#1a2800", fontSize:16, fontWeight:800 }}>{item.val}</div>
                    <div style={{ color:"#aabf88", fontSize:10, marginTop:2 }}>{item.lbl}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Resumen ruta compacto */}
            <div style={{ background:"#f8f8f4", borderRadius:14, padding:"14px 16px", marginBottom:16 }}>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, flexShrink:0 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:"#a8e63d" }} />
                  <div style={{ width:1.5, height:18, background:"#d0d0c8" }} />
                  <div style={{ width:8, height:8, borderRadius:"50%", background:"#1a2800" }} />
                </div>
                <div style={{ flex:1, overflow:"hidden" }}>
                  <div style={{ color:"#1a2800", fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{originText.split(",")[0]}</div>
                  <div style={{ color:"#aaa", fontSize:13, marginTop:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{destText.split(",")[0]}</div>
                </div>
              </div>
              {mode==="other" && forName && (
                <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid #e8e8e0", display:"flex", gap:8, alignItems:"center" }}>
                  <span style={{ fontSize:13 }}>👤</span>
                  <span style={{ color:"#888", fontSize:12 }}>Viaje para <strong style={{ color:"#1a2800" }}>{forName}</strong></span>
                </div>
              )}
            </div>

            {/* BOTÓN CONFIRMAR */}
            <button className="confirm-btn" onClick={handleConfirm} disabled={!canConfirm}
              style={{ width:"100%", background: canConfirm?"#a8e63d":"#f0f0e8", border:"none", borderRadius:16, padding:"16px", fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:16, fontWeight:800, color: canConfirm?"#1a2800":"#ccc", letterSpacing:.5 }}>
              {!canConfirm && mode==="other" && !forName.trim() ? "Ingresá el nombre del pasajero" : "Pedir viaje →"}
            </button>
          </div>
        )}

        {/* Estado vacío — sin destino */}
        {!destCoords && !calculating && (
          <div style={{ textAlign:"center", padding:"20px 0 0", color:"#ccc" }}>
            <div style={{ fontSize:36, marginBottom:8 }}>📍</div>
            <div style={{ fontSize:14, color:"#bbb" }}>Escribí tu destino para ver el precio</div>
          </div>
        )}
      </div>
    </div>
  );
}
