// Beach Dog — Cromer beach-walking conditions.
// All data comes from keyless Open-Meteo endpoints so the app can be hosted
// statically (e.g. GitHub Pages) with zero backend.

const CROMER = { lat: 52.9333, lon: 1.3020, tz: "Europe/London" };

const WX_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${CROMER.lat}&longitude=${CROMER.lon}` +
  `&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day` +
  `&hourly=precipitation_probability,weather_code` +
  `&wind_speed_unit=mph&temperature_unit=celsius&timezone=${encodeURIComponent(CROMER.tz)}&forecast_days=2`;

const MARINE_URL =
  `https://marine-api.open-meteo.com/v1/marine?latitude=${CROMER.lat}&longitude=${CROMER.lon}` +
  `&hourly=sea_level_height_msl&timezone=${encodeURIComponent(CROMER.tz)}&forecast_days=2`;

// WMO weather-code → { label, emoji }. Covers the codes Open-Meteo emits.
const WX_CODES = {
  0:  ["Clear", "☀️"],
  1:  ["Mostly clear", "🌤️"],
  2:  ["Partly cloudy", "⛅"],
  3:  ["Overcast", "☁️"],
  45: ["Foggy", "🌫️"],
  48: ["Freezing fog", "🌫️"],
  51: ["Light drizzle", "🌦️"],
  53: ["Drizzle", "🌦️"],
  55: ["Heavy drizzle", "🌧️"],
  56: ["Freezing drizzle", "🌧️"],
  57: ["Freezing drizzle", "🌧️"],
  61: ["Light rain", "🌦️"],
  63: ["Rain", "🌧️"],
  65: ["Heavy rain", "🌧️"],
  66: ["Freezing rain", "🌧️"],
  67: ["Freezing rain", "🌧️"],
  71: ["Light snow", "🌨️"],
  73: ["Snow", "🌨️"],
  75: ["Heavy snow", "❄️"],
  77: ["Snow grains", "🌨️"],
  80: ["Rain showers", "🌦️"],
  81: ["Rain showers", "🌧️"],
  82: ["Heavy showers", "⛈️"],
  85: ["Snow showers", "🌨️"],
  86: ["Snow showers", "❄️"],
  95: ["Thunderstorm", "⛈️"],
  96: ["Thunder w/ hail", "⛈️"],
  99: ["Thunder w/ hail", "⛈️"],
};

const COMPASS = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];

// ---------- Fetching ----------

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

// ---------- Tide from sea-level-height series ----------
// Open-Meteo marine gives hourly astronomical sea-level height (metres, MSL).
// The next local max is the next high tide; next local min is the next low
// tide. Hourly resolution is good enough for "walk in an hour?" decisions.
function nextTideEvents(times, heights, now = new Date()) {
  const events = [];
  for (let i = 1; i < heights.length - 1; i++) {
    const prev = heights[i - 1], cur = heights[i], next = heights[i + 1];
    if (cur > prev && cur >= next) events.push({ kind: "high", time: new Date(times[i]), height: cur });
    else if (cur < prev && cur <= next) events.push({ kind: "low",  time: new Date(times[i]), height: cur });
  }
  const future = events.filter(e => e.time > now);
  return {
    nextHigh: future.find(e => e.kind === "high") || null,
    nextLow:  future.find(e => e.kind === "low")  || null,
    all: future,
  };
}

function currentTideState(times, heights, now = new Date()) {
  // Find the hourly index closest to now, compare with an hour ago.
  let idx = 0;
  for (let i = 0; i < times.length; i++) {
    if (new Date(times[i]) <= now) idx = i; else break;
  }
  const here = heights[idx];
  const before = heights[Math.max(0, idx - 1)];
  const rising = here >= before;
  return { height: here, rising };
}

// ---------- Busyness heuristic ----------
// No crowd API — estimate from weekday, hour, weather, temp.
// Cromer is a popular Norfolk seaside town; weekends + sun = crowded promenade.
function estimateBusyness({ now, tempC, weatherCode, precip, windMph }) {
  const day = now.getDay();           // 0 Sun .. 6 Sat
  const hr  = now.getHours();
  const isWeekend = day === 0 || day === 6;
  const isSchoolHolidayGuess = isSchoolHoliday(now);

  let score = 0;
  // Time of day — beach tends to peak 11:00–16:00.
  if (hr >= 11 && hr <= 16) score += 3;
  else if (hr >= 9 && hr <= 18) score += 2;
  else if (hr >= 7 && hr <= 20) score += 1;

  if (isWeekend) score += 2;
  if (isSchoolHolidayGuess) score += 2;

  // Weather effect.
  const niceWx = [0, 1, 2].includes(weatherCode);
  if (niceWx) score += 2;
  if (tempC >= 18) score += 2;
  else if (tempC >= 13) score += 1;
  else if (tempC < 6) score -= 2;

  if (precip > 0.3) score -= 3;
  if (windMph > 25) score -= 2;

  let label, emoji;
  if (score <= 1)       { label = "Deserted";   emoji = "🦀"; }
  else if (score <= 3)  { label = "Quiet";      emoji = "🌾"; }
  else if (score <= 5)  { label = "Steady";     emoji = "👣"; }
  else if (score <= 7)  { label = "Busy";       emoji = "👥"; }
  else                  { label = "Packed";     emoji = "🎡"; }

  return { score, label, emoji, isWeekend, isSchoolHolidayGuess };
}

// Rough English school-holiday calendar (good enough for a heuristic).
// Covers: Easter fortnight, May half-term week, summer (late Jul–early Sep),
// October half-term, Christmas fortnight.
function isSchoolHoliday(d) {
  const m = d.getMonth(); // 0-indexed
  const day = d.getDate();
  if (m === 7) return true;                              // August
  if (m === 6 && day >= 22) return true;                 // late July
  if (m === 8 && day <= 5) return true;                  // early September
  if (m === 11 && day >= 20) return true;                // late December
  if (m === 0 && day <= 3) return true;                  // early January
  if (m === 3 && day >= 1 && day <= 20) return true;     // Easter window (approx)
  if (m === 4 && day >= 24 && day <= 31) return true;    // May half-term (approx)
  if (m === 9 && day >= 20 && day <= 31) return true;    // October half-term
  return false;
}

// Wind-comfort multipliers for each of the 16 compass points, as experienced
// at Cromer beach. S is sheltered (offshore from warm Norfolk), E and SSW are
// decent, SW/SE third best, and N/NNE/NNW etc. are the North-Sea blast zone.
const CROMER_WIND_MUL = {
  N:   1.8, NNE: 1.6, NE:  1.5, ENE: 1.3,
  E:   0.5, ESE: 0.7, SE:  0.8, SSE: 0.5,
  S:   0.3, SSW: 0.5, SW:  0.8, WSW: 1.0,
  W:   1.3, WNW: 1.5, NW:  1.6, NNW: 1.7,
};

function windMultiplierAtCromer(deg) {
  if (deg == null) return 1;
  const mul = CROMER_WIND_MUL[bearingToCompass(deg)];
  return mul == null ? 1 : mul;
}

// ---------- Walk score ----------
// Blends weather/wind/tide/temp into a 0–100 score with a friendly verdict.
function computeWalkScore({ tempC, feelsC, windMph, gustMph, windDirDeg, precip, weatherCode, isDay, tide }) {
  let score = 100;
  const reasons = [];

  // Precipitation — dogs don't mind drizzle, but heavy rain is a no.
  if (precip >= 2)        { score -= 45; reasons.push("heavy rain"); }
  else if (precip >= 0.5) { score -= 20; reasons.push("rain"); }
  else if (precip > 0)    { score -= 8;  reasons.push("a spit of drizzle"); }

  // Thunderstorm, snow, freezing — hard knocks.
  if ([95, 96, 99].includes(weatherCode)) { score -= 40; reasons.push("thunder about"); }
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) { score -= 20; reasons.push("snowy"); }
  if ([45, 48].includes(weatherCode)) { score -= 10; reasons.push("foggy"); }

  // Wind — Cromer direction sensitivity: S sheltered, N/NW/NE North-Sea blast.
  const windMul = windMultiplierAtCromer(windDirDeg);
  const windLabel = windMul >= 1.5 ? " off the sea" : windMul <= 0.6 ? " (sheltered)" : "";
  if (gustMph >= 40)      { score -= Math.round(35 * windMul); reasons.push(`gale${windLabel}`); }
  else if (gustMph >= 25) { score -= Math.round(18 * windMul); reasons.push(`stiff gusts${windLabel}`); }
  else if (gustMph >= 18) { score -= Math.round(9 * windMul);  reasons.push(`breezy${windLabel}`); }
  else if (windMph >= 14 && windMul >= 1.3) { score -= 5; reasons.push("nippy sea breeze"); }

  // Temperature — feels-like for pup (and owner) comfort; actual for hot-paws.
  const feels = feelsC != null ? feelsC : tempC;
  if (feels <= 0)       { score -= 22; reasons.push("feels freezing"); }
  else if (feels <= 4)  { score -= 14; reasons.push("feels nippy"); }
  else if (feels <= 8)  { score -= 6;  reasons.push("feels cool"); }
  if (tempC >= 28)      { score -= 25; reasons.push("too hot for paws"); }
  else if (tempC >= 24) { score -= 10; reasons.push("warm — bring water"); }

  // Darkness — harder to see paws, dog-poo bags, and the tide line.
  if (!isDay) { score -= 18; reasons.push("it's dark"); }

  // Tide — at Cromer, spring high tide swallows most of the beach (MHWN ≈ 1.3m).
  if (tide) {
    if (tide.height >= 1.3)       { score -= 14; reasons.push("high tide — little beach"); }
    else if (tide.height >= 0.6)  { score -= 4; }
    else if (tide.height <= -0.3) { score += 6;  reasons.push("low tide — loads of sand"); }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let level, emoji, headline;
  if (score >= 75)      { level = "good"; emoji = "🐕"; headline = "Leads on — perfect beach-dog weather"; }
  else if (score >= 55) { level = "ok";   emoji = "🐾"; headline = "Decent — grab a coat and go"; }
  else if (score >= 35) { level = "meh";  emoji = "🐾"; headline = "Only if they really need it"; }
  else                  { level = "bad";  emoji = "🛋️"; headline = "Stay in — proper nasty out there"; }

  return { score, level, emoji, headline, reasons };
}

// ---------- Formatting helpers ----------

const fmtTime = t => t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const fmtRel = t => {
  const mins = Math.round((t - Date.now()) / 60000);
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
};
const bearingToCompass = deg => COMPASS[Math.round(((deg % 360) / 22.5)) % 16];

function toneFromScore(score, good, ok) {
  if (score >= good) return "good";
  if (score >= ok)   return "ok";
  return "bad";
}

// ---------- Render ----------

function render({ wx, marine }) {
  const now = new Date();
  const c = wx.current;
  const weatherCode = c.weather_code;
  const [wxLabel, wxEmoji] = WX_CODES[weatherCode] || ["—", "❓"];

  // Weather card
  document.getElementById("weatherValue").textContent = `${wxEmoji} ${wxLabel}`;
  const pop = nextHourValue(wx.hourly?.time, wx.hourly?.precipitation_probability, now);
  document.getElementById("weatherMeta").textContent =
    pop == null ? `${c.precipitation} mm now` : `${pop}% rain next hour`;

  // Temperature card
  document.getElementById("tempValue").textContent = `${Math.round(c.temperature_2m)}°C`;
  document.getElementById("tempMeta").textContent = `feels like ${Math.round(c.apparent_temperature)}°C`;

  // Wind card
  document.getElementById("windValue").textContent = `${Math.round(c.wind_speed_10m)} mph`;
  document.getElementById("windMeta").textContent =
    `${bearingToCompass(c.wind_direction_10m)} · gusts ${Math.round(c.wind_gusts_10m)}`;

  // Tide card
  const tideState = currentTideState(marine.hourly.time, marine.hourly.sea_level_height_msl, now);
  const tideEvents = nextTideEvents(marine.hourly.time, marine.hourly.sea_level_height_msl, now);
  const arrow = tideState.rising ? "▲ rising" : "▼ falling";
  document.getElementById("tideValue").textContent = `${tideState.height.toFixed(2)} m ${arrow}`;
  const nextEvent = tideEvents.nextHigh && tideEvents.nextLow
    ? (tideEvents.nextHigh.time < tideEvents.nextLow.time ? tideEvents.nextHigh : tideEvents.nextLow)
    : (tideEvents.nextHigh || tideEvents.nextLow);
  document.getElementById("tideMeta").textContent = nextEvent
    ? `next ${nextEvent.kind} tide ${fmtTime(nextEvent.time)} (${fmtRel(nextEvent.time)})`
    : "tide data unavailable";

  // Busyness card
  const busy = estimateBusyness({
    now,
    tempC: c.temperature_2m,
    weatherCode,
    precip: c.precipitation,
    windMph: c.wind_speed_10m,
  });
  document.getElementById("busyValue").textContent = `${busy.emoji} ${busy.label}`;
  const bits = [];
  if (busy.isWeekend) bits.push("weekend");
  if (busy.isSchoolHolidayGuess) bits.push("school hols");
  document.getElementById("busyMeta").textContent =
    bits.length ? `probably ${busy.label.toLowerCase()} · ${bits.join(" + ")}` : `a guess based on time & weather`;

  // Per-card tone
  setCardTone("weather", toneFromScore(100 - (c.precipitation * 20), 90, 60));
  setCardTone("temp",    toneFromScore(100 - Math.abs(c.temperature_2m - 14) * 4, 85, 55));
  setCardTone("wind",    toneFromScore(100 - c.wind_gusts_10m * 1.8, 80, 55));
  setCardTone("tide",    tideState.rising && tideState.height > 1 ? "ok" : "good");
  setCardTone("busy",    busy.score >= 8 ? "bad" : busy.score >= 5 ? "ok" : "good");

  // Verdict
  const walk = computeWalkScore({
    tempC: c.temperature_2m,
    feelsC: c.apparent_temperature,
    windMph: c.wind_speed_10m,
    gustMph: c.wind_gusts_10m,
    windDirDeg: c.wind_direction_10m,
    precip: c.precipitation,
    weatherCode,
    isDay: !!c.is_day,
    tide: tideState,
  });
  const verdictEl = document.getElementById("verdict");
  verdictEl.dataset.level = walk.level;
  const dogsEl = document.querySelector(".dogs");
  if (dogsEl) dogsEl.dataset.mood = walk.level === "meh" ? "ok" : walk.level;
  document.getElementById("verdictEmoji").textContent = walk.emoji;
  document.getElementById("verdictScore").textContent = `${walk.score}/100 · ${walk.headline}`;
  document.getElementById("verdictSub").textContent =
    walk.reasons.length ? `Watch out for: ${walk.reasons.slice(0, 3).join(", ")}.` : `Nothing to watch out for — off you trot.`;

  document.getElementById("updated").textContent = `Updated ${fmtTime(now)}`;
  document.body.dataset.state = "ready";
}

function setCardTone(factor, tone) {
  const el = document.querySelector(`.card[data-factor="${factor}"]`);
  if (el) el.dataset.tone = tone;
}

function nextHourValue(times, values, now) {
  if (!times || !values) return null;
  for (let i = 0; i < times.length; i++) {
    if (new Date(times[i]) >= now) return values[i];
  }
  return null;
}

function renderError(err) {
  document.body.dataset.state = "error";
  document.getElementById("verdictEmoji").textContent = "😿";
  document.getElementById("verdictScore").textContent = "Couldn't fetch conditions";
  document.getElementById("verdictSub").textContent = err.message;
}

// ---------- Boot ----------

async function boot() {
  document.body.dataset.state = "loading";
  try {
    const [wx, marine] = await Promise.all([fetchJSON(WX_URL), fetchJSON(MARINE_URL)]);
    render({ wx, marine });
  } catch (err) {
    console.error(err);
    renderError(err);
  }
}

boot();
// Refresh every 10 minutes so an open tab stays current.
setInterval(boot, 10 * 60 * 1000);
