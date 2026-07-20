import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Home, ScanLine, Tag, MapPin, ChevronRight, ChevronDown, Search, X, Check,
  Camera, CameraOff, Clock, Phone, TrendingUp, Loader2, Bookmark,
  Wheat, Milk, Egg, Baby, Cookie, Sparkles, Navigation2, QrCode, Barcode,
  Store, ThumbsUp, AlertTriangle, Bell, ExternalLink, RefreshCw, Locate,
  WifiOff, Info, Plus, ShieldCheck, ShieldOff, ArrowUpLeft,
} from "lucide-react";

/* ==================================================================== */
/*  NOTE ON SIMULATION BOUNDARIES                                       */
/*  - Geolocation: REAL browser Geolocation API, real Haversine math.   */
/*  - Camera: REAL getUserMedia live video stream.                      */
/*  - Barcode/QR *decoding*: this file has no computer-vision decoder   */
/*    dependency, so detection is a tap-to-confirm on the live feed     */
/*    rather than true pixel decoding. Rendered barcodes/QR codes in    */
/*    the Deals tab are deterministic visual mockups (not scannable by  */
/*    a real reader) — wire in a decoder lib (e.g. zxing) to go live.   */
/* ==================================================================== */

/* ------------------------------------------------------------------ */
/* UTILITIES                                                          */
/* ------------------------------------------------------------------ */

const BOSTON_DEFAULT = { lat: 42.3503, lng: -71.0809 }; // Copley Square
const PROGRAM_OPTIONS = ["SNAP", "WIC"];
const PROGRAM_META = {
  SNAP: { color: "sky", label: "SNAP", detail: "Supplemental Nutrition Assistance Program" },
  WIC: { color: "violet", label: "WIC", detail: "Women, Infants, and Children" },
};

function getSelectedPrograms(programs) {
  return (programs || []).filter((program) => PROGRAM_OPTIONS.includes(program));
}

function programsMatchSelection(programs, selectedPrograms) {
  const normalized = getSelectedPrograms(selectedPrograms);
  if (!normalized.length) return true;
  return (programs || []).some((program) => normalized.includes(program));
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hashStr(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NEIGHBORHOODS = [
  { name: "Back Bay", lat: 42.3503, lng: -71.081 },
  { name: "South End", lat: 42.3388, lng: -71.0765 },
  { name: "Downtown Boston", lat: 42.356, lng: -71.058 },
  { name: "Roxbury", lat: 42.3266, lng: -71.0942 },
  { name: "Dorchester", lat: 42.3016, lng: -71.0676 },
  { name: "Jamaica Plain", lat: 42.3097, lng: -71.1151 },
  { name: "Fenway", lat: 42.3467, lng: -71.1 },
  { name: "Charlestown", lat: 42.3782, lng: -71.0602 },
];

function nearestNeighborhood(lat, lng) {
  let best = NEIGHBORHOODS[0];
  let bestD = Infinity;
  for (const n of NEIGHBORHOODS) {
    const d = haversineMiles(lat, lng, n.lat, n.lng);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best.name;
}

/* ------------------------------------------------------------------ */
/* MOCK DATA — products, stores, coupons, food banks                  */
/* ------------------------------------------------------------------ */

const STORE_LOCATIONS = [
  { name: "Stop & Shop – South Bay", lat: 42.3308, lng: -71.0625 },
  { name: "Star Market – Fenway", lat: 42.3428, lng: -71.1006 },
  { name: "Walmart – Everett", lat: 42.4084, lng: -71.0537 },
];

const productDB = [
  {
    id: "p1",
    upc: "078742013427",
    name: "Great Value White Bread",
    brand: "Great Value",
    category: "Bread & Bakery",
    description: "A versatile loaf that works for sandwiches, toast, and everyday meals.",
    nutrition: "About 80 calories per slice with 3g protein and 2g fiber.",
    icon: Wheat,
    stores: [
      { store: "Stop & Shop – South Bay", price: 2.79, coupon: 1.1, snap: true, wic: false },
      { store: "Star Market – Fenway", price: 2.59, coupon: 0.9, snap: true, wic: false },
      { store: "Walmart – Everett", price: 2.48, coupon: 0.8, snap: true, wic: false },
    ],
  },
  {
    id: "p2",
    upc: "041303001657",
    name: "Horizon Organic Whole Milk",
    brand: "Horizon Organic",
    category: "Dairy",
    description: "Organic whole milk with a creamy texture and strong daily nutrition value.",
    nutrition: "Contains 8g protein and calcium-rich nutrients per serving.",
    icon: Milk,
    stores: [
      { store: "Stop & Shop – South Bay", price: 6.19, coupon: 1.0, snap: true, wic: true },
      { store: "Star Market – Fenway", price: 5.99, coupon: 1.2, snap: true, wic: true },
      { store: "Walmart – Everett", price: 5.79, coupon: 0.9, snap: true, wic: true },
    ],
  },
  {
    id: "p3",
    upc: "016000275270",
    name: "Cheerios Original 18oz",
    brand: "General Mills",
    category: "Cereal",
    description: "A family breakfast staple made for quick and filling mornings.",
    nutrition: "Provides whole-grain goodness with 4g fiber and iron fortification.",
    icon: Sparkles,
    stores: [
      { store: "Stop & Shop – South Bay", price: 5.69, coupon: 2.4, snap: true, wic: true },
      { store: "Star Market – Fenway", price: 5.49, coupon: 2.5, snap: true, wic: true },
      { store: "Walmart – Everett", price: 5.29, coupon: 2.3, snap: true, wic: true },
    ],
  },
  {
    id: "p4",
    upc: "050000334409",
    name: "Gerber Infant Formula",
    brand: "Gerber",
    category: "Baby & Infant",
    description: "Infant formula designed for an easy feeding routine and nutrition support.",
    nutrition: "Balanced nutrients for infant growth and development.",
    icon: Baby,
    stores: [
      { store: "Stop & Shop – South Bay", price: 27.99, coupon: 4.5, snap: false, wic: true },
      { store: "Star Market – Fenway", price: 26.49, coupon: 3.5, snap: false, wic: false },
      { store: "Walmart – Everett", price: 25.99, coupon: 3.0, snap: false, wic: true },
    ],
  },
  {
    id: "p5",
    upc: "070038411756",
    name: "Doritos Nacho Cheese",
    brand: "Frito-Lay",
    category: "Snacks",
    description: "A crunchy snack with bold flavor for shareable treats.",
    nutrition: "Best used as an occasional snack with moderate serving size.",
    icon: Cookie,
    stores: [
      { store: "Stop & Shop – South Bay", price: 5.49, coupon: 0, snap: false, wic: false },
      { store: "Star Market – Fenway", price: 5.29, coupon: 0, snap: false, wic: false },
      { store: "Walmart – Everett", price: 4.98, coupon: 0, snap: false, wic: false },
    ],
  },
];

const qrCatalog = [
  {
    code: "QR-STARMKT-MILK-0120",
    type: "coupon",
    label: "Star Market loyalty coupon",
    dealId: "d2",
  },
  {
    code: "QR-ROUTE-STOPSHOP-SOUTHBAY",
    type: "route",
    label: "Stop & Shop South Bay – store link",
    store: "Stop & Shop – South Bay",
  },
  {
    code: "QR-WALMART-CEREAL-0230",
    type: "coupon",
    label: "Walmart digital coupon",
    dealId: "d3",
  },
];

const initialDeals = [
  {
    id: "d1", name: "Great Value White Bread", brand: "Great Value · Bread & Bakery",
    price: 1.68, was: 2.48, off: 32, exp: "Jul 20", tags: ["SNAP"],
    note: "Digital coupon", icon: Wheat, clipped: false,
    redemption: ["barcode", "deep_link"], nearStore: "Walmart – Everett",
  },
  {
    id: "d2", name: "Horizon Organic Whole Milk", brand: "Horizon · Dairy",
    price: 4.79, was: 5.99, off: 20, exp: "Jul 31", tags: ["SNAP", "WIC"],
    note: "WIC approved", icon: Milk, clipped: false,
    redemption: ["qr", "deep_link"], nearStore: "Star Market – Fenway",
  },
  {
    id: "d3", name: "Cheerios Original 18oz", brand: "General Mills · Cereal",
    price: 2.99, was: 5.49, off: 46, exp: "Aug 5", tags: ["SNAP", "WIC"],
    note: "WIC-eligible cereal", icon: Sparkles, clipped: true,
    redemption: ["barcode", "qr"], nearStore: "Walmart – Everett",
  },
  {
    id: "d4", name: "Gerber Infant Formula", brand: "Gerber · Baby & Infant",
    price: 22.99, was: 27.05, off: 15, exp: "Aug 12", tags: ["WIC"],
    note: "WIC food package", icon: Baby, clipped: false,
    redemption: ["deep_link"], nearStore: "Stop & Shop – South Bay",
  },
  {
    id: "d5", name: "Market Basket Frozen Broccoli", brand: "Market Basket · Frozen",
    price: 1.49, was: 1.99, off: 25, exp: "Jul 25", tags: ["SNAP"],
    note: "Store coupon", icon: Sparkles, clipped: false,
    redemption: ["barcode"], nearStore: "Stop & Shop – South Bay",
  },
  {
    id: "d6", name: "Stop & Shop Large Eggs", brand: "Stop & Shop · Dairy & Eggs",
    price: 3.29, was: 4.0, off: 18, exp: "Jul 22", tags: ["WIC"],
    note: "WIC approved", icon: Egg, clipped: false,
    redemption: ["qr", "barcode"], nearStore: "Stop & Shop – South Bay",
  },
];

const LEVELS = ["HIGH", "LOW", "RUNNING OUT", "EMPTY"];
const LEVEL_STYLE = {
  HIGH: { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
  LOW: { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50" },
  "RUNNING OUT": { dot: "bg-orange-500", text: "text-orange-700", bg: "bg-orange-50" },
  EMPTY: { dot: "bg-rose-500", text: "text-rose-700", bg: "bg-rose-50" },
};
const CATEGORIES = ["Produce", "Dairy", "Grains", "Dry Goods"];

const initialFoodBanks = [
  {
    id: "f1", name: "Boston Community Food Pantry",
    address: "45 Dimock St, Roxbury, MA 02119",
    lat: 42.3266, lng: -71.0942, open: true,
    tags: ["SNAP", "WIC"], hours: "Mon–Fri · 9:00am – 4:00pm", phone: "(617) 555-0142",
    inventory: { Produce: "HIGH", Dairy: "LOW", Grains: "HIGH", "Dry Goods": "HIGH" },
    reports: [
      { id: "r1", category: "Dairy", level: "LOW", note: "Milk was almost gone by noon.", minsAgo: 40, upvotes: 3 },
    ],
  },
  {
    id: "f2", name: "Greater Boston Food Bank",
    address: "70 South Bay Ave, Boston, MA 02118",
    lat: 42.3308, lng: -71.0625, open: true,
    tags: ["SNAP", "WIC"], hours: "Mon–Sat · 8:00am – 6:00pm", phone: "(617) 555-0198",
    inventory: { Produce: "HIGH", Dairy: "HIGH", Grains: "HIGH", "Dry Goods": "RUNNING OUT" },
    reports: [
      { id: "r2", category: "Produce", level: "HIGH", note: "Big delivery of fresh produce this morning.", minsAgo: 12, upvotes: 7 },
    ],
  },
  {
    id: "f3", name: "Dorchester Bay Neighborhood Pantry",
    address: "1500 Dorchester Ave, Dorchester, MA 02122",
    lat: 42.3016, lng: -71.0676, open: false,
    tags: ["WIC"], hours: "Tue & Thu · 10:00am – 2:00pm", phone: "(617) 555-0176",
    inventory: { Produce: "LOW", Dairy: "EMPTY", Grains: "LOW", "Dry Goods": "LOW" },
    reports: [],
  },
  {
    id: "f4", name: "St. Mary's Center Pantry",
    address: "90 Cushing Ave, Dorchester, MA 02125",
    lat: 42.298, lng: -71.058, open: true,
    tags: ["SNAP"], hours: "Mon–Fri · 9:00am – 1:00pm", phone: "(617) 555-0134",
    inventory: { Produce: "RUNNING OUT", Dairy: "HIGH", Grains: "HIGH", "Dry Goods": "HIGH" },
    reports: [],
  },
  {
    id: "f5", name: "Haley House Community Pantry",
    address: "23 Dartmouth St, Boston, MA 02116",
    lat: 42.3428, lng: -71.0754, open: false,
    tags: ["SNAP", "WIC"], hours: "Wed only · 12:00pm – 3:00pm", phone: "(617) 555-0111",
    inventory: { Produce: "EMPTY", Dairy: "LOW", Grains: "RUNNING OUT", "Dry Goods": "LOW" },
    reports: [],
  },
];

/* ------------------------------------------------------------------ */
/* HOOKS — real Geolocation + real Camera                             */
/* ------------------------------------------------------------------ */

function useGeolocation() {
  const [state, setState] = useState({
    status: "requesting", // requesting | granted | denied | unsupported
    coords: BOSTON_DEFAULT,
    real: false,
  });
  const [override, setOverride] = useState(null);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "unsupported", coords: BOSTON_DEFAULT, real: false });
      return;
    }
    setState((s) => ({ ...s, status: "requesting" }));
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setState({
            status: "granted",
            coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            real: true,
          });
        },
        () => {
          setState({ status: "denied", coords: BOSTON_DEFAULT, real: false });
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    } catch {
      setState({ status: "denied", coords: BOSTON_DEFAULT, real: false });
    }
  }, []);

  useEffect(() => {
    request();
  }, [request]);

  const coords = override || state.coords;
  return { ...state, coords, retry: request, setOverride };
}

function useCamera(active) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | requesting | granted | denied | unsupported

  useEffect(() => {
    let stream;
    if (!active) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }
    setStatus("requesting");
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
        setStatus("granted");
      })
      .catch(() => setStatus("denied"));

    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  return { videoRef, status };
}

function usePersistentState(key, initialValue) {
  const [state, setState] = useState(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const storedValue = window.localStorage.getItem(key);
      return storedValue ? JSON.parse(storedValue) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);

  return [state, setState];
}

/* ------------------------------------------------------------------ */
/* CODE RENDERERS — deterministic mock barcode / QR visuals           */
/* ------------------------------------------------------------------ */

function BarcodeSVG({ value, width = 280, height = 84 }) {
  const rand = mulberry32(hashStr(value));
  const count = 46;
  const bars = Array.from({ length: count }, (_, i) => ({
    w: 1 + Math.floor(rand() * 3),
    on: rand() > 0.42,
  }));
  const totalW = bars.reduce((s, b) => s + b.w, 0);
  let x = 0;
  return (
    <svg viewBox={`0 0 ${totalW} 40`} width={width} height={height} className="block">
      <rect x="0" y="0" width={totalW} height="40" fill="#fff" />
      {bars.map((b, i) => {
        const rect = b.on ? (
          <rect key={i} x={x} y="0" width={b.w} height="40" fill="#0a0f0d" />
        ) : null;
        x += b.w;
        return rect;
      })}
    </svg>
  );
}

function QrSVG({ value, size = 168 }) {
  const n = 21;
  const rand = mulberry32(hashStr(value));
  const m = Array.from({ length: n }, () => Array(n).fill(false));
  const drawFinder = (r0, c0) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const border = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        m[r0 + r][c0 + c] = border || core;
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, n - 7);
  drawFinder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) {
    m[6][i] = i % 2 === 0;
    m[i][6] = i % 2 === 0;
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const inFinderZone = (r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8);
      const inTiming = r === 6 || c === 6;
      if (inFinderZone || inTiming) continue;
      m[r][c] = rand() > 0.56;
    }
  }
  const cell = 8;
  const pad = cell * 2;
  const total = n * cell + pad * 2;
  return (
    <svg viewBox={`0 0 ${total} ${total}`} width={size} height={size}>
      <rect width={total} height={total} fill="#fff" />
      {m.map((row, r) =>
        row.map(
          (v, c) =>
            v && (
              <rect
                key={`${r}-${c}`}
                x={pad + c * cell}
                y={pad + r * cell}
                width={cell}
                height={cell}
                fill="#0a0f0d"
              />
            )
        )
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* SHARED UI PIECES                                                   */
/* ------------------------------------------------------------------ */

function ProgramTag({ program }) {
  const styles =
    program === "SNAP" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700";
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide ${styles}`}>
      {program}
    </span>
  );
}

function TicketCard({ children, className = "", pageBg = "#f7faf8" }) {
  return (
    <div className={`relative bg-white rounded-2xl border border-emerald-900/[0.06] shadow-[0_1px_2px_rgba(6,40,26,0.06),0_8px_24px_-12px_rgba(6,40,26,0.15)] ${className}`}>
      <div className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full" style={{ background: pageBg }} />
      <div className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full" style={{ background: pageBg }} />
      {children}
    </div>
  );
}

function TicketDivider() {
  return (
    <div className="relative flex items-center px-4">
      <div className="flex-1 border-t border-dashed border-emerald-900/15" />
    </div>
  );
}

function LogoPlaceholder({ label = "Logo", compact = false }) {
  return (
    <div className={`flex items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-bold ${compact ? "h-10 w-10 text-[11px]" : "h-12 w-12 text-[13px]"}`}>
      {label}
    </div>
  );
}

function AuthScreen({ mode, onModeChange, email, setEmail, password, setPassword, onSubmit, error }) {
  return (
    <div className="min-h-screen bg-[#f7faf8] px-4 py-8 flex items-center justify-center">
      <div className="w-full max-w-md rounded-[28px] border border-emerald-100 bg-white p-5 shadow-[0_20px_50px_-24px_rgba(6,95,70,0.35)]">
        <div className="flex items-center gap-3">
          <LogoPlaceholder />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600">SnapSaver</p>
            <h1 className="text-[22px] font-extrabold text-emerald-950">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          </div>
        </div>

        <p className="mt-4 text-[13px] leading-6 text-slate-600">
          Sign in or create an account to save favorite coupons, track benefit eligibility, and keep your pantry plan organized.
        </p>

        <div className="mt-5 flex rounded-2xl border border-emerald-100 bg-emerald-50 p-1">
          <button
            type="button"
            onClick={() => onModeChange("login")}
            className={`flex-1 rounded-xl px-3 py-2 text-[12px] font-bold transition-colors ${mode === "login" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600"}`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => onModeChange("signup")}
            className={`flex-1 rounded-xl px-3 py-2 text-[12px] font-bold transition-colors ${mode === "signup" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600"}`}
          >
            Sign up
          </button>
        </div>

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <label className="block text-[12px] font-semibold text-slate-700">
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[13px] text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          <label className="block text-[12px] font-semibold text-slate-700">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter a password"
              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[13px] text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          {error ? <p className="text-[12px] font-medium text-rose-600">{error}</p> : null}

          <button
            type="submit"
            className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-[13px] font-bold text-white transition-colors hover:bg-emerald-700"
          >
            {mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Sparkline({ data, width = 120, height = 34, ghost = false }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const lastX = width;
  const lastY = height - ((data[data.length - 1] - min) / range) * height;
  const stroke = ghost ? "#cbd5e1" : "#6ee7b7";
  const dot = ghost ? "#5eead4" : "#6ee7b7";
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={ghost ? "1.5" : "2"} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={ghost ? "2.5" : "3"} fill={dot} />
    </svg>
  );
}

function LevelPill({ level, small }) {
  const s = LEVEL_STYLE[level];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-bold ${s.bg} ${s.text} ${small ? "px-1.5 py-0.5 text-[9.5px]" : "px-2.5 py-1 text-[11px]"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {level}
    </span>
  );
}

/* Toast stack */
function ToastStack({ toasts, dismiss }) {
  return (
    <div className="absolute top-3 left-3 right-3 z-40 space-y-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-2.5 bg-emerald-950 text-white rounded-2xl px-3.5 py-3 shadow-xl shadow-black/30 animate-[toastIn_0.25s_ease-out]"
        >
          <Bell size={15} className="text-emerald-300 mt-0.5 shrink-0" />
          <p className="text-[12.5px] leading-snug flex-1">{t.message}</p>
          <button onClick={() => dismiss(t.id)} className="shrink-0 text-emerald-300/70">
            <X size={13} />
          </button>
        </div>
      ))}
      <style>{`@keyframes toastIn { from { transform: translateY(-12px); opacity:0 } to { transform: translateY(0); opacity:1 } }`}</style>
    </div>
  );
}

/* Ultra-minimal "ghost" location line — used on the white Home + Food Banks headers */
function LocationChip({ location }) {
  const label = useMemo(
    () => nearestNeighborhood(location.coords.lat, location.coords.lng),
    [location.coords]
  );
  if (location.status === "requesting") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-light text-[#CBD5E1]">
        <Loader2 size={12} className="animate-spin" /> Locating you…
      </span>
    );
  }
  if (location.status === "granted" && location.real) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-light text-[#94A3B8]">
        <ArrowUpLeft size={13} strokeWidth={1.75} />
        Near {label} · live GPS
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-light text-[#94A3B8]">
      <ArrowUpLeft size={13} strokeWidth={1.75} />
      Using approximate Boston location
      <button
        onClick={location.retry}
        className="underline underline-offset-2 decoration-[#CBD5E1] text-[#94A3B8] font-normal ml-0.5"
      >
        retry
      </button>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* ONBOARDING / PERSONALIZATION                                       */
/* ------------------------------------------------------------------ */

function OnboardingModal({ selectedPrograms, onContinue, onToggleProgram }) {
  const draft = selectedPrograms;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/70 px-3 py-4">
      <div className="w-full max-w-md rounded-[28px] border border-emerald-900/20 bg-white p-5 shadow-2xl shadow-black/30">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600">Personalize your plan</p>
        <h2 className="mt-2 text-[22px] font-extrabold text-emerald-950">Which benefits do you use?</h2>
        <p className="mt-2 text-[13px] leading-6 text-slate-600">
          Choose the programs you currently use or can access so SnapSaver can focus eligibility, coupons, and store offers for you.
        </p>

        <div className="mt-4 grid gap-2.5">
          {PROGRAM_OPTIONS.map((program) => {
            const active = draft.includes(program);
            return (
              <button
                key={program}
                onClick={() => onToggleProgram(program)}
                className={`flex items-center justify-between rounded-2xl border px-3.5 py-3 text-left transition-all active:scale-[0.98] ${active ? "border-emerald-400 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-white text-slate-700"}`}
              >
                <div>
                  <p className="text-[13px] font-bold">{program}</p>
                  <p className="text-[11.5px] text-slate-500">{PROGRAM_META[program].detail}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${active ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                  {active ? "Selected" : "Add"}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={onContinue}
          disabled={draft.length === 0}
          className={`mt-5 w-full rounded-2xl px-4 py-3 text-[13px] font-bold transition-colors ${draft.length === 0 ? "bg-slate-200 text-slate-500" : "bg-emerald-800 text-white active:bg-emerald-900"}`}
        >
          Continue to SnapSaver
        </button>
      </div>
    </div>
  );
}

function FoodDetailModal({ item, selectedPrograms, onClose }) {
  const visibleStores = (item?.stores || []).filter((store) => {
    if (!selectedPrograms.length) return true;
    return selectedPrograms.some((program) => (program === "SNAP" ? store.snap : store.wic));
  });

  const eligibility = visibleStores.some((store) => store.snap || store.wic)
    ? visibleStores.map((store) => `${store.store} · ${[store.snap ? "SNAP" : null, store.wic ? "WIC" : null].filter(Boolean).join(" + ")}`).join(" • ")
    : "No matching store eligibility for your selected programs.";

  if (!item) return null;

  const Icon = item.icon;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-emerald-950/65 px-3 py-4">
      <div className="w-full max-w-md rounded-[28px] border border-emerald-900/15 bg-white p-4 shadow-2xl shadow-black/30">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Icon size={22} />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-600">Food details</p>
              <h3 className="text-[18px] font-extrabold text-emerald-950">{item.name}</h3>
              <p className="text-[12px] text-slate-500">{item.brand} · {item.category}</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600">×</button>
        </div>

        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
          <p className="text-[12px] font-semibold text-emerald-900">About this food</p>
          <p className="mt-1 text-[12.5px] leading-6 text-slate-700">{item.description}</p>
          <p className="mt-2 text-[12px] font-semibold text-emerald-900">Nutrition</p>
          <p className="mt-1 text-[12px] text-slate-700">{item.nutrition}</p>
        </div>

        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-900/60">Program eligibility</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedPrograms.length ? selectedPrograms.map((program) => <span key={program} className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">{program}</span>) : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">Browse all programs</span>}
          </div>
          <p className="mt-2 text-[12px] leading-6 text-slate-600">{eligibility}</p>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Nearby store comparison</p>
          <div className="mt-2 space-y-2">
            {visibleStores.map((store) => {
              const trueCost = store.price - store.coupon;
              return (
                <div key={`${item.id}-${store.store}`} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <div>
                    <p className="text-[12px] font-semibold text-slate-800">{store.store}</p>
                    <p className="text-[11px] text-slate-500">${trueCost.toFixed(2)} est. after coupon</p>
                  </div>
                  <div className="flex gap-1.5">
                    {store.snap && <span className="rounded-full bg-sky-100 px-2 py-1 text-[10px] font-bold text-sky-700">SNAP</span>}
                    {store.wic && <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-bold text-violet-700">WIC</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* HOME VIEW                                                          */
/* ------------------------------------------------------------------ */

const SAVINGS_TREND = [12, 16, 15, 21, 26, 24, 30, 34, 31, 38, 43, 47.8];

function HomeView({ recentScans, goTo, location, onSimulate, selectedPrograms, onEditPrograms, searchQuery, onSearchChange, searchResults, onOpenFood, onRequestNotifications, onSignOut, userName }) {
  return (
    <div className="pb-6">
      <div className="bg-[#f7fff8] px-5 pt-7 pb-6 rounded-b-[28px] border-b border-emerald-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-light tracking-[0.18em] text-emerald-600 uppercase font-mono">Good morning</p>
            <h1 className="mt-1 text-[26px] leading-[1.15] font-extrabold text-emerald-950 tracking-tight font-display">
              Make every<br />dollar count.
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onSignOut} className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-700">Sign out</button>
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold shrink-0">{(userName || "MA").slice(0, 2).toUpperCase()}</div>
          </div>
        </div>

        <div className="mt-3"><LocationChip location={location} /></div>

        <div className="mt-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">This month's savings</p>
            <p className="mt-1 text-[32px] font-extrabold text-emerald-950 font-mono tracking-tight">$47.80</p>
            <p className="mt-1 flex items-center gap-1 text-[12px] font-light text-slate-500">
              <TrendingUp size={13} strokeWidth={1.75} className="text-emerald-600" /> $12 more than last month
            </p>
          </div>
          <Sparkline data={SAVINGS_TREND} ghost />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <button onClick={() => goTo("scan")} className="bg-white rounded-2xl py-3 flex flex-col items-center gap-1.5 active:scale-95 transition-transform border border-emerald-100 shadow-sm hover:border-emerald-400/50">
            <span className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center"><Camera size={17} className="text-emerald-600" /></span>
            <span className="text-[11.5px] font-semibold text-emerald-950">Scan Item</span>
          </button>
          <button onClick={() => goTo("deals")} className="bg-white rounded-2xl py-3 flex flex-col items-center gap-1.5 active:scale-95 transition-transform border border-emerald-100 shadow-sm hover:border-amber-400/50">
            <span className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center"><Tag size={17} className="text-amber-600" /></span>
            <span className="text-[11.5px] font-semibold text-emerald-950">Find Deals</span>
          </button>
          <button onClick={() => goTo("foodbanks")} className="bg-white rounded-2xl py-3 flex flex-col items-center gap-1.5 active:scale-95 transition-transform border border-emerald-100 shadow-sm hover:border-rose-400/50">
            <span className="w-9 h-9 rounded-xl bg-rose-500/15 flex items-center justify-center"><MapPin size={17} className="text-rose-600" /></span>
            <span className="text-[11.5px] font-semibold text-emerald-950">Food Banks</span>
          </button>
        </div>
      </div>

      <div className="px-5 mt-6">
        <div className="rounded-2xl border border-emerald-100 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-600 uppercase">Your programs</p>
              <p className="mt-1 text-[12px] text-slate-600">{selectedPrograms.length ? selectedPrograms.join(" + ") : "Showing all available programs"}</p>
            </div>
            <button onClick={onEditPrograms} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700">Edit</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedPrograms.length ? selectedPrograms.map((program) => <span key={program} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">{program}</span>) : ["SNAP", "WIC"].map((program) => <span key={program} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">{program}</span>)}
          </div>
        </div>
      </div>

      <div className="px-5 mt-6">
        <TicketCard className="px-4 py-3.5 bg-white border-emerald-100">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0"><Bell size={16} className="text-emerald-700" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-emerald-50">Proximity alerts are on</p>
              <p className="text-[11.5px] text-emerald-100/70 leading-snug mt-0.5">
                We'll notify you when you're near a store with a clipped coupon, or a food bank that's well stocked. Try it:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={onSimulate}
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-emerald-200 bg-emerald-500/15 px-3 py-1.5 rounded-full active:scale-95 transition-transform"
                >
                  <Navigation2 size={12} /> Simulate walking near Star Market
                </button>
                <button
                  onClick={onRequestNotifications}
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-amber-200 bg-amber-500/15 px-3 py-1.5 rounded-full active:scale-95 transition-transform"
                >
                  <Bell size={12} /> Enable alerts
                </button>
              </div>
            </div>
          </div>
        </TicketCard>
      </div>

      <div className="px-5 mt-6">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-600 uppercase">Recent scans</p>
          <button onClick={() => goTo("scan")} className="text-[11.5px] font-semibold text-emerald-700 flex items-center gap-0.5">Scan more <ChevronRight size={13} /></button>
        </div>
        <div className="space-y-2.5">
          {recentScans.map((item) => {
            const Icon = item.icon;
            return (
              <TicketCard key={item.id} className="px-4 py-3 bg-white border-emerald-100">
                <div className="flex items-center gap-3">
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${item.eligible ? "bg-emerald-50" : "bg-rose-50"}`}>
                    <Icon size={16} className={item.eligible ? "text-emerald-700" : "text-rose-500"} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-emerald-50 truncate">{item.name}</p>
                    <p className="text-[11.5px] text-emerald-100/65">{item.brand}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {item.eligible ? (
                      <>
                        <div className="flex justify-end gap-1 mb-1">{item.tags.map((t) => <ProgramTag key={t} program={t} />)}</div>
                        <p className="text-[12px] font-mono font-bold text-emerald-300">Save ${item.save.toFixed(2)}</p>
                      </>
                    ) : (
                      <p className="text-[12px] font-semibold text-rose-300">Not eligible</p>
                    )}
                  </div>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${item.eligible ? "bg-emerald-500" : "bg-rose-100"}`}>
                    {item.eligible ? <Check size={13} className="text-white" strokeWidth={3} /> : <X size={13} className="text-rose-500" strokeWidth={3} />}
                  </span>
                </div>
              </TicketCard>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SCAN VIEW                                                          */
/* ------------------------------------------------------------------ */

function ScanView({ onSaveProduct, onCoupon, selectedPrograms }) {
  const [mode, setMode] = useState("barcode"); // barcode | qr
  const { videoRef, status: camStatus } = useCamera(true);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null); // {type:'product'|'coupon'|'route', data}
  const [saved, setSaved] = useState(false);

  const handleTapProduct = (product) => {
    setSaved(false);
    setResult(null);
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      setResult({ type: "product", data: product });
    }, 900);
  };

  const handleTapQr = (qr) => {
    setSaved(false);
    setResult(null);
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      if (qr.type === "coupon") {
        setResult({ type: "coupon", data: qr });
      } else {
        setResult({ type: "route", data: qr });
      }
    }, 900);
  };

  const handleSaveScan = () => {
    if (!result || result.type !== "product") return;
    onSaveProduct(result.data);
    setSaved(true);
  };

  const handleClipFromScan = () => {
    if (!result || result.type !== "coupon") return;
    onCoupon(result.data.dealId);
    setSaved(true);
  };

  const camLabel = {
    idle: "",
    requesting: "Requesting camera access…",
    granted: "",
    denied: "Camera unavailable — using demo picker below",
    unsupported: "Camera not supported here — using demo picker below",
  }[camStatus];

  return (
    <div className="rounded-b-[24px] border border-emerald-100 bg-[#f7fff8] px-5 pt-7 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.18em] text-emerald-600 uppercase font-mono">Scan</p>
          <h1 className="mt-1 text-[24px] font-extrabold text-emerald-950 tracking-tight font-display">Barcode &amp; QR Scanner</h1>
          <p className="text-[13px] text-slate-500 mt-0.5">Check SNAP &amp; WIC eligibility instantly</p>
        </div>
        <LogoPlaceholder label="SNAP" compact />
      </div>

      <div className="mt-4 flex gap-2">
        {[{ id: "barcode", label: "Barcode / UPC", Icon: Barcode }, { id: "qr", label: "QR Code", Icon: QrCode }].map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => { setMode(id); setResult(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[12.5px] font-bold transition-colors ${mode === id ? "bg-emerald-950 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div className="mt-4 relative rounded-3xl bg-[#0a0f0d] aspect-square overflow-hidden">
        {camStatus === "granted" ? (
          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-80" />
        ) : (
          <div
            className="absolute inset-0 opacity-20"
            style={{ backgroundImage: "linear-gradient(#1f2f28 1px, transparent 1px), linear-gradient(90deg, #1f2f28 1px, transparent 1px)", backgroundSize: "24px 24px" }}
          />
        )}

        {["top-6 left-6 border-t-2 border-l-2 rounded-tl-xl", "top-6 right-6 border-t-2 border-r-2 rounded-tr-xl", "bottom-6 left-6 border-b-2 border-l-2 rounded-bl-xl", "bottom-6 right-6 border-b-2 border-r-2 rounded-br-xl"].map((c, i) => (
          <div key={i} className={`absolute w-9 h-9 border-emerald-400 ${c}`} />
        ))}

        <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          {scanning ? (
            <>
              <Loader2 size={30} className="text-emerald-400 animate-spin" />
              <p className="mt-3 text-emerald-300 text-[13px] font-medium">Checking eligibility…</p>
            </>
          ) : result ? (
            <>
              <ScanLine size={26} className="text-emerald-400" />
              <p className="mt-3 text-emerald-300 text-[13px] font-medium">Scan complete — see details below</p>
            </>
          ) : (
            <>
              {camStatus === "requesting" ? (
                <Loader2 size={26} className="text-emerald-500/70 animate-spin" />
              ) : camStatus === "granted" ? (
                <ScanLine size={26} className="text-emerald-400" />
              ) : (
                <CameraOff size={26} className="text-emerald-500/50" />
              )}
              <p className="mt-3 text-slate-300 text-[13px]">{camLabel || "Tap a product below to confirm what the camera sees"}</p>
            </>
          )}
        </div>

        {scanning && (
          <div className="absolute left-0 right-0 h-0.5 bg-emerald-400/80 shadow-[0_0_12px_2px_rgba(52,211,153,0.6)] animate-[scanline_1s_ease-in-out_infinite]" />
        )}
      </div>

      <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-900/50 uppercase mt-6 mb-2.5">
        {mode === "barcode" ? "Demo — tap a detected UPC" : "Demo — tap a detected QR code"}
      </p>

      {mode === "barcode" ? (
        <div className="space-y-2.5">
          {productDB.filter((p) => {
            if (!selectedPrograms.length) return true;
            return p.stores.some((store) => (selectedPrograms.includes("SNAP") ? store.snap : false) || (selectedPrograms.includes("WIC") ? store.wic : false));
          }).map((p) => {
            const Icon = p.icon;
            const eligible = p.stores.some((s) => s.snap || s.wic);
            return (
              <button key={p.id} onClick={() => handleTapProduct(p)} className="w-full flex items-center gap-3 bg-white rounded-2xl px-3.5 py-3 border border-emerald-900/[0.06] shadow-sm active:scale-[0.98] transition-transform text-left">
                <span className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0"><Icon size={16} className="text-emerald-700" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-slate-900 truncate">{p.name}</p>
                  <p className="text-[11.5px] text-slate-400 truncate font-mono">{p.upc}</p>
                </div>
                {!eligible && <span className="text-[11px] font-semibold text-rose-500 shrink-0">Not eligible</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2.5">
          {qrCatalog.map((q) => (
            <button key={q.code} onClick={() => handleTapQr(q)} className="w-full flex items-center gap-3 bg-white rounded-2xl px-3.5 py-3 border border-emerald-900/[0.06] shadow-sm active:scale-[0.98] transition-transform text-left">
              <span className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0"><QrCode size={16} className="text-violet-700" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-slate-900 truncate">{q.label}</p>
                <p className="text-[11px] text-slate-400 truncate font-mono">{q.code}</p>
              </div>
              <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400 shrink-0">{q.type}</span>
            </button>
          ))}
        </div>
      )}

      {result && (
        <div className="fixed inset-0 z-30 flex items-end justify-center">
          <div className="absolute inset-0 bg-emerald-950/40 backdrop-blur-[2px]" onClick={() => setResult(null)} />
          <div className="relative w-full max-w-md bg-white rounded-t-[28px] px-5 pt-3 pb-7 max-h-[80%] overflow-y-auto animate-[slideUp_0.25s_ease-out]">
            <div className="w-9 h-1 bg-slate-200 rounded-full mx-auto mb-4" />

            {result.type === "product" && (
              <ProductResult data={result.data} saved={saved} onSave={handleSaveScan} onClose={() => setResult(null)} />
            )}
            {result.type === "coupon" && (
              <CouponScanResult qr={result.data} saved={saved} onClip={handleClipFromScan} onClose={() => setResult(null)} />
            )}
            {result.type === "route" && (
              <RouteScanResult qr={result.data} onClose={() => setResult(null)} />
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes scanline { 0%, 100% { top: 12%; } 50% { top: 85%; } }
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
}

function ProductResult({ data, saved, onSave, onClose }) {
  const Icon = data.icon;
  const eligible = data.stores.some((s) => s.snap || s.wic);
  const cheapest = [...data.stores].sort((a, b) => a.price - a.coupon - (b.price - b.coupon))[0];

  return (
    <>
      <div className="flex items-start gap-3">
        <span className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0"><Icon size={24} className="text-emerald-700" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-bold text-emerald-950 leading-tight font-display">{data.name}</h3>
          <p className="text-[12.5px] text-slate-400">{data.brand} · <span className="font-mono">{data.upc}</span></p>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><X size={14} className="text-slate-500" /></button>
      </div>

      <div className="mt-3 flex gap-1.5">
        {data.stores.some((s) => s.snap) && <ProgramTag program="SNAP" />}
        {data.stores.some((s) => s.wic) && <ProgramTag program="WIC" />}
        {!eligible && <span className="text-[12px] font-semibold text-rose-500">Not eligible on any program</span>}
      </div>

      <p className="mt-4 text-[11px] font-bold tracking-[0.12em] text-emerald-900/50 uppercase">Price comparison — True Cost = price − coupon</p>
      <div className="mt-2 space-y-2">
        {data.stores.map((s) => {
          const trueCost = s.price - s.coupon;
          const isBest = s.store === cheapest.store;
          return (
            <div key={s.store} className={`rounded-xl border px-3.5 py-3 ${isBest ? "border-emerald-300 bg-emerald-50/60" : "border-slate-100 bg-slate-50/60"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Store size={13} className="text-slate-400 shrink-0" />
                  <span className="text-[12.5px] font-semibold text-slate-800 truncate">{s.store}</span>
                  {isBest && <span className="text-[9.5px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full shrink-0">BEST</span>}
                </div>
                <span className="text-[13.5px] font-mono font-bold text-emerald-700 shrink-0">${trueCost.toFixed(2)}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10.5px] font-mono text-slate-400">
                  ${s.price.toFixed(2)} − ${s.coupon.toFixed(2)} coupon
                </span>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold ${s.snap ? "text-sky-600" : "text-slate-300"}`}>
                    {s.snap ? <ShieldCheck size={11} /> : <ShieldOff size={11} />} SNAP
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold ${s.wic ? "text-violet-600" : "text-slate-300"}`}>
                    {s.wic ? <ShieldCheck size={11} /> : <ShieldOff size={11} />} WIC
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={onSave}
        disabled={saved}
        className={`mt-5 w-full rounded-2xl py-3.5 flex items-center justify-center gap-2 text-[14px] font-bold transition-colors ${saved ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-emerald-800 text-white active:bg-emerald-900"}`}
      >
        {saved ? (<><Check size={16} strokeWidth={2.5} /> Saved to recent</>) : (<><Bookmark size={16} /> Save item to recent</>)}
      </button>
    </>
  );
}

function CouponScanResult({ qr, saved, onClip, onClose }) {
  const deal = initialDeals.find((d) => d.id === qr.dealId);
  return (
    <>
      <div className="flex items-start gap-3">
        <span className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center shrink-0"><QrCode size={24} className="text-violet-700" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-bold text-emerald-950 leading-tight font-display">{qr.label}</h3>
          <p className="text-[12px] text-slate-400 font-mono">{qr.code}</p>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><X size={14} className="text-slate-500" /></button>
      </div>
      {deal && (
        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-3">
          <p className="text-[13px] font-semibold text-emerald-950">{deal.name}</p>
          <p className="text-[12px] font-mono text-emerald-700 mt-0.5">${deal.price.toFixed(2)} <span className="text-slate-300 line-through">${deal.was.toFixed(2)}</span> · {deal.off}% off</p>
        </div>
      )}
      <button
        onClick={onClip}
        disabled={saved}
        className={`mt-5 w-full rounded-2xl py-3.5 flex items-center justify-center gap-2 text-[14px] font-bold transition-colors ${saved ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-emerald-800 text-white active:bg-emerald-900"}`}
      >
        {saved ? (<><Check size={16} strokeWidth={2.5} /> Coupon clipped</>) : (<><Tag size={16} /> Clip this coupon</>)}
      </button>
    </>
  );
}

function RouteScanResult({ qr, onClose }) {
  return (
    <>
      <div className="flex items-start gap-3">
        <span className="w-14 h-14 rounded-2xl bg-sky-50 flex items-center justify-center shrink-0"><Store size={24} className="text-sky-700" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-bold text-emerald-950 leading-tight font-display">Store routing link</h3>
          <p className="text-[12.5px] text-slate-400">{qr.store}</p>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><X size={14} className="text-slate-500" /></button>
      </div>
      <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/60 px-3.5 py-3 text-[12.5px] text-sky-800 leading-snug">
        This QR code routes you to <strong>{qr.store}</strong>'s digital circular and loyalty program sign-up.
      </div>
      <button onClick={onClose} className="mt-5 w-full rounded-2xl py-3.5 flex items-center justify-center gap-2 text-[14px] font-bold bg-emerald-800 text-white active:bg-emerald-900">
        <ExternalLink size={15} /> Open store page
      </button>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* DEALS VIEW                                                         */
/* ------------------------------------------------------------------ */

function DealsView({ deals, setDeals }) {
  const [filter, setFilter] = useState("All Deals");
  const [redeemDeal, setRedeemDeal] = useState(null);

  const filtered = useMemo(() => {
    if (filter === "All Deals") return deals;
    return deals.filter((d) => d.tags.includes(filter));
  }, [deals, filter]);

  const totalSavings = useMemo(
    () => deals.filter((d) => d.clipped).reduce((sum, d) => sum + (d.was - d.price), 0),
    [deals]
  );
  const clippedCount = deals.filter((d) => d.clipped).length;

  const toggleClip = (id) => {
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, clipped: !d.clipped } : d)));
  };

  return (
    <div className="pb-6">
      <div className="rounded-b-[28px] border border-emerald-100 bg-[#f7fff8] px-5 pt-7 pb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.18em] text-emerald-600 uppercase font-mono">Deals</p>
            <h1 className="mt-1 text-[24px] font-extrabold text-emerald-950 tracking-tight font-display">Deals &amp; Coupons</h1>
            <p className="text-[13px] text-slate-500 mt-0.5">Eligible brands near you</p>
          </div>
          <LogoPlaceholder label="DEALS" compact />
        </div>

        <div className="mt-4 rounded-2xl border border-emerald-100 bg-white px-4 py-3.5 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">Potential savings</p>
            <p className="mt-0.5 text-[26px] font-extrabold text-emerald-950 font-mono tracking-tight">
              ${totalSavings.toFixed(2)}
              <span className="text-[13px] font-semibold text-slate-500 ml-1.5">on {clippedCount} item{clippedCount === 1 ? "" : "s"}</span>
            </p>
          </div>
          <span className="w-11 h-11 rounded-full bg-emerald-50 flex items-center justify-center shrink-0"><Tag size={19} className="text-emerald-700" /></span>
        </div>
      </div>

      <div className="px-5 mt-4">
        <div className="flex gap-2">
          {["All Deals", "SNAP", "WIC"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-full text-[12.5px] font-bold transition-colors ${filter === f ? "bg-emerald-950 text-white" : "bg-white text-slate-500 border border-slate-200"}`}>
              {f}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {filtered.map((d) => {
            const Icon = d.icon;
            return (
              <TicketCard key={d.id} className="overflow-hidden">
                <div className="px-4 pt-3.5 pb-3 flex items-start gap-3">
                  <span className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0"><Icon size={17} className="text-emerald-700" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-slate-900 truncate">{d.name}</p>
                    <p className="text-[11.5px] text-slate-400">{d.brand}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-block text-[11px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">{d.off}% off</span>
                    <p className="mt-1 text-[13.5px] font-mono font-bold text-emerald-700">
                      ${d.price.toFixed(2)} <span className="text-[11px] font-normal text-slate-300 line-through">${d.was.toFixed(2)}</span>
                    </p>
                    <p className="text-[10.5px] text-slate-400">Exp {d.exp}</p>
                  </div>
                </div>
                <TicketDivider />
                <div className="px-4 py-2.5 bg-emerald-50/30">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {d.tags.map((t) => <ProgramTag key={t} program={t} />)}
                      <span className="text-[11px] text-slate-400 truncate">{d.note}</span>
                    </div>
                    <button
                      onClick={() => toggleClip(d.id)}
                      className={`px-3.5 py-1.5 rounded-full text-[11.5px] font-bold flex items-center gap-1 transition-colors shrink-0 ${d.clipped ? "bg-emerald-100 text-emerald-700" : "bg-emerald-950 text-white active:bg-emerald-900"}`}
                    >
                      {d.clipped && <Check size={12} strokeWidth={3} />}
                      {d.clipped ? "Clipped" : "Clip"}
                    </button>
                  </div>
                  {d.clipped && (
                    <button
                      onClick={() => setRedeemDeal(d)}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 text-[11.5px] font-bold text-emerald-700 bg-white border border-emerald-200 rounded-full py-1.5 active:scale-[0.98] transition-transform"
                    >
                      {d.redemption.includes("qr") && <QrCode size={13} />}
                      {d.redemption.includes("barcode") && <Barcode size={13} />}
                      View redemption options
                    </button>
                  )}
                </div>
              </TicketCard>
            );
          })}
        </div>
      </div>

      {redeemDeal && <RedemptionSheet deal={redeemDeal} onClose={() => setRedeemDeal(null)} />}
    </div>
  );
}

function RedemptionSheet({ deal, onClose }) {
  const [tab, setTab] = useState(deal.redemption[0]);
  const [deepLinkState, setDeepLinkState] = useState("idle"); // idle | opening | opened
  const storeName = deal.nearStore || "your store's app";

  const openDeepLink = () => {
    setDeepLinkState("opening");
    setTimeout(() => setDeepLinkState("opened"), 1100);
  };

  const tabMeta = {
    deep_link: { label: "Store App", Icon: ExternalLink },
    barcode: { label: "Barcode", Icon: Barcode },
    qr: { label: "QR Code", Icon: QrCode },
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <div className="absolute inset-0 bg-emerald-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-t-[28px] px-5 pt-3 pb-7 animate-[slideUp_0.25s_ease-out]">
        <div className="w-9 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15.5px] font-bold text-emerald-950 leading-tight font-display">{deal.name}</h3>
            <p className="text-[12px] text-slate-400 mt-0.5">Redeem at checkout</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><X size={14} className="text-slate-500" /></button>
        </div>

        <div className="mt-4 flex gap-2">
          {deal.redemption.map((r) => {
            const { label, Icon } = tabMeta[r];
            return (
              <button key={r} onClick={() => setTab(r)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-bold transition-colors ${tab === r ? "bg-emerald-950 text-white" : "bg-slate-50 text-slate-500 border border-slate-200"}`}>
                <Icon size={13} /> {label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-col items-center">
          {tab === "barcode" && (
            <div className="w-full rounded-2xl border border-slate-100 bg-white px-4 py-5 flex flex-col items-center">
              <BarcodeSVG value={`${deal.id}-${deal.name}`} />
              <p className="mt-2 text-[12px] font-mono tracking-widest text-slate-500">{hashStr(deal.id).toString().slice(0, 12)}</p>
              <p className="mt-1 text-[11px] text-slate-400">Show this to the cashier to scan</p>
            </div>
          )}
          {tab === "qr" && (
            <div className="w-full rounded-2xl border border-slate-100 bg-white px-4 py-5 flex flex-col items-center">
              <QrSVG value={`${deal.id}-${deal.name}`} />
              <p className="mt-2 text-[11px] text-slate-400">Scan for loyalty points + this coupon</p>
            </div>
          )}
          {tab === "deep_link" && (
            <div className="w-full rounded-2xl border border-slate-100 bg-emerald-50/50 px-4 py-6 flex flex-col items-center text-center">
              {deepLinkState === "idle" && (
                <>
                  <ExternalLink size={22} className="text-emerald-700" />
                  <p className="mt-2 text-[13px] text-emerald-900 font-medium">Load this coupon directly into {storeName}'s loyalty app.</p>
                  <button onClick={openDeepLink} className="mt-3 px-5 py-2.5 rounded-full bg-emerald-800 text-white text-[12.5px] font-bold active:bg-emerald-900">
                    Open {storeName}
                  </button>
                </>
              )}
              {deepLinkState === "opening" && (
                <>
                  <Loader2 size={22} className="text-emerald-700 animate-spin" />
                  <p className="mt-2 text-[13px] text-emerald-900 font-medium">Opening {storeName}…</p>
                </>
              )}
              {deepLinkState === "opened" && (
                <>
                  <Check size={22} className="text-emerald-600" strokeWidth={2.5} />
                  <p className="mt-2 text-[13px] text-emerald-900 font-medium">Coupon loaded to your loyalty account.</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FOOD BANKS VIEW                                                    */
/* ------------------------------------------------------------------ */

function ReportModal({ bank, onClose, onSubmit }) {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [level, setLevel] = useState("HIGH");
  const [note, setNote] = useState("");

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <div className="absolute inset-0 bg-emerald-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-t-[28px] px-5 pt-3 pb-7 animate-[slideUp_0.25s_ease-out]">
        <div className="w-9 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
        <h3 className="text-[15.5px] font-bold text-emerald-950 font-display">Report status</h3>
        <p className="text-[12px] text-slate-400 mt-0.5">{bank.name} · seen by the community instantly</p>

        <p className="mt-4 text-[11px] font-bold tracking-[0.12em] text-emerald-900/50 uppercase">Category</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${category === c ? "bg-emerald-950 text-white" : "bg-slate-50 text-slate-500 border border-slate-200"}`}>
              {c}
            </button>
          ))}
        </div>

        <p className="mt-4 text-[11px] font-bold tracking-[0.12em] text-emerald-900/50 uppercase">Stock level</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {LEVELS.map((l) => {
            const s = LEVEL_STYLE[l];
            const active = level === l;
            return (
              <button key={l} onClick={() => setLevel(l)} className={`px-3 py-1.5 rounded-full text-[11.5px] font-bold flex items-center gap-1.5 transition-colors ${active ? `${s.bg} ${s.text} ring-2 ring-inset ring-current` : "bg-slate-50 text-slate-400 border border-slate-200"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} /> {l}
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-[11px] font-bold tracking-[0.12em] text-emerald-900/50 uppercase">Note (optional)</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Milk was in stock 15 minutes ago"
          rows={2}
          className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[13px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow resize-none"
        />

        <button
          onClick={() => onSubmit({ category, level, note })}
          className="mt-5 w-full rounded-2xl py-3.5 flex items-center justify-center gap-2 text-[14px] font-bold bg-emerald-800 text-white active:bg-emerald-900"
        >
          <AlertTriangle size={16} /> Submit report
        </button>
      </div>
    </div>
  );
}

function FoodBankCard({ bank, expanded, onToggle, distance, onUpvote, onReport }) {
  return (
    <TicketCard className="overflow-hidden">
      <button onClick={onToggle} className="w-full text-left px-4 py-3.5 flex items-start gap-3">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bank.open ? "bg-emerald-50" : "bg-slate-100"}`}>
          <MapPin size={17} className={bank.open ? "text-emerald-700" : "text-slate-400"} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-slate-900 truncate">{bank.name}</p>
          <p className="text-[11px] text-slate-400 truncate mt-0.5">{bank.address}</p>
          <div className="mt-1.5 flex items-center gap-2.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${bank.open ? "text-emerald-600" : "text-slate-400"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${bank.open ? "bg-emerald-500" : "bg-slate-300"}`} />
              {bank.open ? "Open" : "Closed"}
            </span>
            <span className="text-[11px] font-mono text-slate-500">{distance.toFixed(1)} mi</span>
            <div className="flex gap-1">{bank.tags.map((t) => <ProgramTag key={t} program={t} />)}</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                {c}: <LevelPill level={bank.inventory[c]} small />
              </span>
            ))}
          </div>
        </div>
        <ChevronDown size={16} className={`text-slate-300 shrink-0 mt-1 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <>
          <TicketDivider />
          <div className="px-4 py-3 space-y-3 bg-emerald-50/30">
            <div className="flex items-center gap-2 text-[12.5px] text-slate-600"><Clock size={13} className="text-emerald-600 shrink-0" />{bank.hours}</div>
            <div className="flex items-center gap-2 text-[12.5px] text-slate-600"><Phone size={13} className="text-emerald-600 shrink-0" />{bank.phone}</div>

            <button
              onClick={onReport}
              className="w-full flex items-center justify-center gap-1.5 text-[12px] font-bold text-emerald-700 bg-white border border-emerald-200 rounded-full py-2 active:scale-[0.98] transition-transform"
            >
              <AlertTriangle size={13} /> Report status update
            </button>

            {bank.reports.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10.5px] font-bold tracking-[0.1em] text-emerald-900/50 uppercase">Community reports</p>
                {bank.reports.map((r) => (
                  <div key={r.id} className="flex items-start gap-2 bg-white rounded-xl px-3 py-2.5 border border-emerald-900/[0.05]">
                    <LevelPill level={r.level} small />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-slate-700 leading-snug">
                        {r.category}{r.note ? ` — ${r.note}` : ""}
                      </p>
                      <p className="text-[10.5px] text-slate-400 mt-0.5">{r.minsAgo === 0 ? "Just now" : `${r.minsAgo} min ago`}</p>
                    </div>
                    <button onClick={() => onUpvote(r.id)} className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                      <ThumbsUp size={12} /> {r.upvotes}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </TicketCard>
  );
}

function FoodBanksView({ foodBanks, setFoodBanks, location }) {
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [reportingBankId, setReportingBankId] = useState(null);

  const openCount = foodBanks.filter((b) => b.open).length;

  const withDistance = useMemo(() => {
    return foodBanks
      .map((b) => ({ ...b, distance: haversineMiles(location.coords.lat, location.coords.lng, b.lat, b.lng) }))
      .sort((a, b) => a.distance - b.distance);
  }, [foodBanks, location.coords]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return withDistance;
    return withDistance.filter((b) => b.name.toLowerCase().includes(q) || b.address.toLowerCase().includes(q));
  }, [withDistance, query]);

  const handleUpvote = (bankId, reportId) => {
    setFoodBanks((prev) =>
      prev.map((b) =>
        b.id !== bankId ? b : { ...b, reports: b.reports.map((r) => (r.id === reportId ? { ...r, upvotes: r.upvotes + 1 } : r)) }
      )
    );
  };

  const handleSubmitReport = ({ category, level, note }) => {
    setFoodBanks((prev) =>
      prev.map((b) => {
        if (b.id !== reportingBankId) return b;
        const newReport = { id: `r-${Date.now()}`, category, level, note, minsAgo: 0, upvotes: 1 };
        return { ...b, inventory: { ...b.inventory, [category]: level }, reports: [newReport, ...b.reports] };
      })
    );
    setReportingBankId(null);
  };

  const reportingBank = foodBanks.find((b) => b.id === reportingBankId);

  return (
    <div className="pb-6">
      <div className="rounded-b-[24px] border border-emerald-100 bg-[#f7fff8] px-5 pt-7 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-light tracking-[0.18em] text-emerald-600 uppercase font-mono">Food banks</p>
            <h1 className="mt-1 text-[24px] font-extrabold text-emerald-950 tracking-tight font-display">Nearby Food Banks</h1>
            <p className="text-[13px] font-light text-slate-500 mt-2">Boston, MA · {openCount} open now</p>
            <div className="mt-2"><LocationChip location={location} /></div>
          </div>
          <LogoPlaceholder label="MAP" compact />
        </div>
      </div>

      <div className="px-5">
        <div className="relative rounded-2xl bg-gradient-to-br from-[#052e1f] to-[#0f4a33] border border-emerald-900/10 aspect-[16/10] overflow-hidden">
          <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "linear-gradient(#2f6a4d 1px, transparent 1px), linear-gradient(90deg, #2f6a4d 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
          {withDistance.map((b, i) => {
            const top = 10 + ((hashStr(b.id) % 70));
            const left = 8 + ((hashStr(b.id + "x") % 80));
            return (
              <div key={b.id} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ top: `${top}%`, left: `${left}%` }}>
                <span className={`w-6 h-6 rounded-full border-2 border-white/80 flex items-center justify-center text-[10.5px] font-bold text-white shadow-lg ${b.open ? "bg-emerald-500" : "bg-slate-400"}`}>{i + 1}</span>
              </div>
            );
          })}
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-sky-400 ring-4 ring-sky-400/30" title="You" />
          <span className="absolute bottom-2.5 right-3 text-[10px] font-semibold text-emerald-200/60 flex items-center gap-1"><Navigation2 size={10} /> Map view</span>
        </div>
      </div>

      <div className="px-5 mt-4">
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or address…"
            className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-[13px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-shadow"
          />
        </div>

        <div className="mt-3.5 space-y-2.5">
          {filtered.length === 0 ? (
            <p className="text-center text-[13px] text-slate-400 py-8">No food banks match "{query}".</p>
          ) : (
            filtered.map((bank) => (
              <FoodBankCard
                key={bank.id}
                bank={bank}
                distance={bank.distance}
                expanded={expandedId === bank.id}
                onToggle={() => setExpandedId(expandedId === bank.id ? null : bank.id)}
                onUpvote={(reportId) => handleUpvote(bank.id, reportId)}
                onReport={() => setReportingBankId(bank.id)}
              />
            ))
          )}
        </div>
      </div>

      {reportingBank && <ReportModal bank={reportingBank} onClose={() => setReportingBankId(null)} onSubmit={handleSubmitReport} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* BOTTOM NAV                                                         */
/* ------------------------------------------------------------------ */

function BottomNav({ active, goTo }) {
  const items = [
    { id: "home", label: "Home", icon: Home },
    { id: "scan", label: "Scan", icon: ScanLine },
    { id: "deals", label: "Deals", icon: Tag },
    { id: "foodbanks", label: "Food Banks", icon: MapPin },
  ];
  return (
    <div className="absolute bottom-3 left-3 right-3">
      <div className="bg-[#0a1a13]/95 backdrop-blur-md rounded-[22px] px-2 py-2 flex items-center justify-between shadow-2xl shadow-black/30">
        {items.map((it) => {
          const Icon = it.icon;
          const isActive = active === it.id;
          return (
            <button key={it.id} onClick={() => goTo(it.id)} className={`flex-1 flex flex-col items-center gap-1 py-1.5 rounded-2xl transition-colors ${isActive ? "bg-emerald-500/15" : ""}`}>
              <Icon size={18} className={isActive ? "text-emerald-400" : "text-slate-500"} strokeWidth={isActive ? 2.4 : 2} />
              <span className={`text-[10px] font-semibold ${isActive ? "text-emerald-400" : "text-slate-500"}`}>{it.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* APP ROOT                                                            */
/* ------------------------------------------------------------------ */

const initialRecentScans = [
  { id: "rs1", name: "Great Value White Bread", brand: "Walmart Brand", tags: ["SNAP"], save: 0.8, eligible: true, icon: Wheat },
  { id: "rs2", name: "Horizon Organic Whole Milk", brand: "Horizon", tags: ["WIC"], save: 1.2, eligible: true, icon: Milk },
  { id: "rs3", name: "Doritos Nacho Cheese", brand: "Frito-Lay", tags: [], save: 0, eligible: false, icon: Cookie },
];

export default function App() {
  const [tab, setTab] = useState("home");
  const [recentScans, setRecentScans] = useState(initialRecentScans);
  const [deals, setDeals] = useState(initialDeals);
  const [foodBanks, setFoodBanks] = useState(initialFoodBanks);
  const [toasts, setToasts] = useState([]);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("snapsaver-authenticated") === "true";
    } catch {
      return false;
    }
  });
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authUser, setAuthUser] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.localStorage.getItem("snapsaver-auth-user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [selectedPrograms, setSelectedPrograms] = usePersistentState("snapsaver-selected-programs", []);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("snapsaver-onboarding-complete") !== "true";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFood, setSelectedFood] = useState(null);
  const notifiedRef = useRef(new Set());
  const location = useGeolocation();

  const pushToast = useCallback((message) => {
    const id = `t-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);
  const dismissToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("snapsaver-onboarding-complete", showOnboarding ? "false" : "true");
  }, [showOnboarding]);

  const handleToggleProgram = (program) => {
    setSelectedPrograms((prev) => (prev.includes(program) ? prev.filter((item) => item !== program) : [...prev, program]));
  };

  const handleContinueOnboarding = () => {
    setShowOnboarding(false);
  };

  const handleAuthSubmit = (event) => {
    event.preventDefault();
    setAuthError("");

    const normalizedEmail = authEmail.trim().toLowerCase();
    const normalizedPassword = authPassword.trim();

    if (!normalizedEmail || !normalizedPassword) {
      setAuthError("Please enter both an email and a password.");
      return;
    }

    if (typeof window === "undefined") return;

    try {
      const existingUsers = JSON.parse(window.localStorage.getItem("snapsaver-users") || "{}") || {};
      if (authMode === "signup") {
        if (existingUsers[normalizedEmail]) {
          setAuthError("An account already exists for that email.");
          return;
        }
        existingUsers[normalizedEmail] = normalizedPassword;
        window.localStorage.setItem("snapsaver-users", JSON.stringify(existingUsers));
      } else {
        if (existingUsers[normalizedEmail] !== normalizedPassword) {
          setAuthError("That email and password do not match an existing account.");
          return;
        }
      }

      const nextUser = { email: normalizedEmail };
      window.localStorage.setItem("snapsaver-authenticated", "true");
      window.localStorage.setItem("snapsaver-auth-user", JSON.stringify(nextUser));
      setAuthUser(nextUser);
      setIsAuthenticated(true);
      setAuthPassword("");
    } catch {
      setAuthError("We could not save your sign-in information right now.");
    }
  };

  const handleSignOut = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("snapsaver-authenticated");
      window.localStorage.removeItem("snapsaver-auth-user");
    }
    setIsAuthenticated(false);
    setAuthMode("login");
    setAuthEmail("");
    setAuthPassword("");
    setAuthError("");
    setAuthUser(null);
  };

  const handleSaveScan = (product) => {
    const cheapest = [...product.stores].sort((a, b) => a.price - a.coupon - (b.price - b.coupon))[0];
    setRecentScans((prev) => {
      const withoutDupe = prev.filter((p) => p.name !== product.name);
      return [
        {
          id: `rs-${Date.now()}`,
          name: product.name,
          brand: product.brand,
          tags: [cheapest.snap && "SNAP", cheapest.wic && "WIC"].filter(Boolean),
          save: +(cheapest.coupon).toFixed(2),
          eligible: cheapest.snap || cheapest.wic,
          icon: product.icon,
        },
        ...withoutDupe,
      ].slice(0, 6);
    });
  };

  const handleCouponFromScan = (dealId) => {
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, clipped: true } : d)));
  };

  const handleRequestNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      pushToast("Notifications are unavailable in this browser.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      pushToast("Notifications enabled for deal and pantry reminders.");
    } else {
      pushToast("Notifications were not enabled. You can still browse deals manually.");
    }
  };

  const handleSimulateProximity = () => {
    const star = STORE_LOCATIONS.find((s) => s.name === "Star Market – Fenway");
    location.setOverride({ lat: star.lat + 0.0007, lng: star.lng + 0.0006 });
    pushToast("GPS simulation: you're now approaching Star Market – Fenway.");
  };

  const visibleRecentScans = useMemo(() => {
    if (!selectedPrograms.length) return recentScans;
    return recentScans.filter((item) => item.tags.some((tag) => selectedPrograms.includes(tag)));
  }, [recentScans, selectedPrograms]);

  const visibleDeals = useMemo(() => {
    if (!selectedPrograms.length) return deals;
    return deals.filter((deal) => deal.tags.some((tag) => selectedPrograms.includes(tag)));
  }, [deals, selectedPrograms]);

  const visibleFoodBanks = useMemo(() => {
    if (!selectedPrograms.length) return foodBanks;
    return foodBanks.filter((bank) => bank.tags.some((tag) => selectedPrograms.includes(tag)));
  }, [foodBanks, selectedPrograms]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return productDB.filter((product) => {
      const matchesText = [product.name, product.brand, product.category].some((field) => field.toLowerCase().includes(query));
      if (!matchesText) return false;
      if (!selectedPrograms.length) return true;
      return product.stores.some((store) => (selectedPrograms.includes("SNAP") ? store.snap : false) || (selectedPrograms.includes("WIC") ? store.wic : false));
    });
  }, [searchQuery, selectedPrograms]);

  // Proximity notifications: check distance to stores (clipped coupons) and food banks (high stock)
  useEffect(() => {
    const { lat, lng } = location.coords;

    STORE_LOCATIONS.forEach((store) => {
      const d = haversineMiles(lat, lng, store.lat, store.lng);
      if (d <= 0.6) {
        const clippedHere = deals.filter((deal) => deal.clipped && deal.nearStore === store.name);
        clippedHere.forEach((deal) => {
          const key = `store-${store.name}-${deal.id}`;
          if (!notifiedRef.current.has(key)) {
            notifiedRef.current.add(key);
            pushToast(`You're near ${store.name}! Your clipped $${(deal.was - deal.price).toFixed(2)} ${deal.name} coupon is ready to use.`);
          }
        });
      }
    });

    foodBanks.forEach((bank) => {
      const d = haversineMiles(lat, lng, bank.lat, bank.lng);
      if (d <= 0.6 && bank.open) {
        const highCats = CATEGORIES.filter((c) => bank.inventory[c] === "HIGH");
        if (highCats.length >= 2) {
          const key = `bank-${bank.id}`;
          if (!notifiedRef.current.has(key)) {
            notifiedRef.current.add(key);
            pushToast(`You're near ${bank.name} — ${highCats.join(" & ")} are well stocked right now.`);
          }
        }
      }
    });
  }, [location.coords, deals, foodBanks, pushToast]);

  if (!isAuthenticated) {
    return (
      <AuthScreen
        mode={authMode}
        onModeChange={setAuthMode}
        email={authEmail}
        setEmail={setAuthEmail}
        password={authPassword}
        setPassword={setAuthPassword}
        onSubmit={handleAuthSubmit}
        error={authError}
      />
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#f7faf8] flex items-center justify-center py-6 px-3">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        .emdc-root, .emdc-root * { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
        .emdc-root .font-display { font-family: 'Outfit', ui-sans-serif, system-ui, sans-serif; }
        .emdc-root .font-mono { font-family: 'Space Mono', ui-monospace, monospace; }
      `}</style>
      <div className="emdc-root relative w-full max-w-md h-[90vh] max-h-[860px] bg-white rounded-[36px] shadow-[0_24px_80px_-28px_rgba(6,95,70,0.35)] overflow-hidden flex flex-col ring-1 ring-emerald-100 border border-emerald-100">
        <ToastStack toasts={toasts} dismiss={dismissToast} />
        <div className="flex-1 overflow-y-auto scroll-smooth [&::-webkit-scrollbar]:hidden">
          {showOnboarding && (
            <OnboardingModal selectedPrograms={selectedPrograms} onContinue={handleContinueOnboarding} onToggleProgram={handleToggleProgram} />
          )}
          {selectedFood && (
            <FoodDetailModal item={selectedFood} selectedPrograms={selectedPrograms} onClose={() => setSelectedFood(null)} />
          )}
          {tab === "home" && (
            <HomeView
              recentScans={visibleRecentScans}
              goTo={setTab}
              location={location}
              onSimulate={handleSimulateProximity}
              selectedPrograms={selectedPrograms}
              onEditPrograms={() => setShowOnboarding(true)}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              searchResults={searchResults}
              onOpenFood={setSelectedFood}
              onRequestNotifications={handleRequestNotifications}
              onSignOut={handleSignOut}
              userName={authUser?.email || "User"}
            />
          )}
          {tab === "scan" && <ScanView onSaveProduct={handleSaveScan} onCoupon={handleCouponFromScan} selectedPrograms={selectedPrograms} />}
          {tab === "deals" && <DealsView deals={visibleDeals} setDeals={setDeals} />}
          {tab === "foodbanks" && <FoodBanksView foodBanks={visibleFoodBanks} setFoodBanks={setFoodBanks} location={location} />}
          <div className="h-20" />
        </div>
        <BottomNav active={tab} goTo={setTab} />
      </div>
    </div>
  );
}