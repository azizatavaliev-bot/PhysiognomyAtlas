// ============ Атлас физиогномики — учебный фронт ============
// Читает ТОЛЬКО data.json + images/ (+ analysis.md для блока «подробнее»).
// Ничего не хардкодим: весь контент идёт из JSON.

const state = {
  data: null,
  analysis: {},        // image filename -> {seen, tradition, perception}
  view: "atlas",
  filter: "all",
  variants: [],        // плоский список всех вариантов
  // тренажёр (флешкарты)
  deck: [],
  deckPos: 0,
  flipped: false,
  score: { right: 0, wrong: 0 },
  // квиз (варианты ответов)
  quizDeck: [],
  quizPos: 0,
  quizScore: { right: 0, wrong: 0 },
  quizCurrent: null,
  quizAnswered: false,
  // SRS (интервальное повторение, Leitner) для быстрого изучения
  srs: {},
};

const $ = (s, r = document) => r.querySelector(s);
const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; };
const esc = (s) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- SRS (Leitner: 5 коробок, знал → дальше, не знал → сначала) ----------
const SRS_KEY = "pa-srs-v1";
const SRS_INTERVALS_DAYS = [0, 1, 2, 4, 9]; // индекс = box
function loadSrs() {
  try { state.srs = JSON.parse(localStorage.getItem(SRS_KEY)) || {}; }
  catch (e) { state.srs = {}; }
}
function saveSrs() {
  try { localStorage.setItem(SRS_KEY, JSON.stringify(state.srs)); } catch (e) { /* ignore */ }
}
function srsGet(id) { return state.srs[id] || { box: 0, dueAt: 0 }; }
function srsAnswer(id, ok) {
  const cur = srsGet(id);
  const box = ok ? Math.min(cur.box + 1, SRS_INTERVALS_DAYS.length - 1) : 0;
  const days = SRS_INTERVALS_DAYS[box];
  state.srs[id] = { box, dueAt: Date.now() + days * 86400000 };
  saveSrs();
}
function srsMasteredCount() {
  return state.variants.filter((v) => srsGet(v.id).box >= SRS_INTERVALS_DAYS.length - 1).length;
}
function srsDueVariants() {
  const now = Date.now();
  return state.variants.filter((v) => srsGet(v.id).dueAt <= now);
}

// ---------- СХЕМАТИЧНЫЕ ИКОНКИ ЛИЦА (вместо фото) ----------
// Рисуем упрощённое лицо-схему в SVG; нужная черта — акцентным цветом и утрированной формой,
// всё остальное — приглушённым контуром. Работает для всех 77 вариантов без единой фотографии.
function headOutlinePath(shape) {
  // viewBox 0 0 200 230, лицо занимает примерно x:40-160 y:20-210
  switch (shape) {
    case "round": return "M100,20 C150,20 168,60 168,110 C168,165 140,205 100,205 C60,205 32,165 32,110 C32,60 50,20 100,20 Z";
    case "square": return "M100,22 C144,22 162,42 162,80 L162,150 C162,185 134,206 100,206 C66,206 38,185 38,150 L38,80 C38,42 56,22 100,22 Z";
    case "rectangle": return "M100,18 C138,18 154,38 154,72 L154,158 C154,192 130,212 100,212 C70,212 46,192 46,158 L46,72 C46,38 62,18 100,18 Z";
    case "triangle": return "M100,26 C126,26 138,44 138,62 C138,90 158,140 150,168 C142,196 122,210 100,210 C78,210 58,196 50,168 C42,140 62,90 62,62 C62,44 74,26 100,26 Z";
    case "inverted_triangle": return "M100,20 C142,20 160,42 158,70 C156,96 140,104 128,130 C118,152 112,182 100,206 C88,182 82,152 72,130 C60,104 44,96 42,70 C40,42 58,20 100,20 Z";
    case "diamond": return "M100,24 C122,24 132,46 148,84 C160,110 160,116 148,142 C132,178 122,204 100,210 C78,204 68,178 52,142 C40,116 40,110 52,84 C68,46 78,24 100,24 Z";
    case "oval":
    default: return "M100,18 C140,18 156,50 156,96 C156,160 132,208 100,208 C68,208 44,160 44,96 C44,50 60,18 100,18 Z";
  }
}
let traitIconUid = 0;
function traitIcon(v) {
  const uid = traitIconUid++;
  const id = v.id;
  const has = (s) => id.includes(s);
  let headShape = "oval";
  let hairlineY = 46, hairlineShape = "arc", browRidge = false;
  let browThick = 4.5, browGapY = 8, browSpread = 25, browShape = "straight", browClose = false, browWide = false;
  let eyeRX = 10, eyeRY = 6.5, eyeSpread = 27, eyeCorner = 0, eyeHooded = false, eyeDeep = false, eyeOpenCrease = false;
  let noseLen = 40, noseBridge = "straight", noseTip = "default", noseTipDir = "level", noseWing = 9;
  let cheekFull = 0, cheekHighlight = false, cheekDimple = false;
  let mouthW = 32, mouthThick = 5, mouthCorner = 0, mouthContour = "normal";
  let chinShape = "round", chinSize = 0, jawWidth = 0, jawHeavy = false, chinCleft = false;
  let earSize = 1, earY = 0, earProtrude = 0, earLobe = 1;
  let highlight = "face";

  if (v.feature === "Лоб") {
    highlight = "forehead";
    if (has("high")) hairlineY = 30;
    else if (has("low")) hairlineY = 60;
    else if (has("wide")) { hairlineY = 40; hairlineShape = "wide"; }
    else if (has("narrow")) { hairlineY = 42; hairlineShape = "narrow"; }
    else if (has("round")) hairlineShape = "convex";
    else if (has("straight")) hairlineShape = "flat";
    else if (has("sloping")) hairlineShape = "slope";
    else if (has("ridges")) { browRidge = true; }
    else if (has("widow")) hairlineShape = "widow";
    else if (has("hairline_even")) hairlineShape = "flat";
  } else if (v.feature === "Брови") {
    highlight = "brows";
    if (has("thick_straight")) { browThick = 6.5; browShape = "straight"; }
    else if (has("thin_arched")) { browThick = 2.5; browShape = "arch"; }
    else if (has("angular")) { browShape = "angle"; browThick = 5; }
    else if (has("low_set")) browGapY = 3;
    else if (has("high_set")) browGapY = 16;
    else if (has("close_set")) browClose = true;
    else if (has("wide_set")) browWide = true;
  } else if (v.feature === "Глаза") {
    highlight = "eyes";
    if (has("eyes_large")) { eyeRX = 14; eyeRY = 9.5; }
    else if (has("eyes_small")) { eyeRX = 6.5; eyeRY = 4.5; }
    else if (has("wide_set")) eyeSpread = 36;
    else if (has("close_set")) eyeSpread = 19;
    else if (has("deep_set")) eyeDeep = true;
    else if (has("protruding")) { eyeRX = 12; eyeRY = 9; }
    else if (has("corners_up")) eyeCorner = -1;
    else if (has("corners_down")) eyeCorner = 1;
    else if (has("hooded")) eyeHooded = true;
    else if (has("open_lid")) eyeOpenCrease = true;
  } else if (v.feature === "Нос") {
    highlight = "nose";
    if (has("humped")) noseBridge = "hump";
    else if (has("nose_long")) noseLen = 52;
    else if (has("nose_short")) noseLen = 28;
    else if (has("nose_straight")) noseBridge = "straight";
    else if (has("concave")) noseBridge = "concave";
    else if (has("tip_pointed")) noseTip = "pointed";
    else if (has("tip_round")) noseTip = "round";
    else if (has("tip_down")) noseTipDir = "down";
    else if (has("tip_up")) noseTipDir = "up";
    else if (has("wings_wide")) noseWing = 15;
    else if (has("wings_narrow")) noseWing = 5;
  } else if (v.feature === "Скулы и щёки") {
    highlight = "cheeks";
    if (has("cheekbones_high")) cheekHighlight = true;
    else if (has("cheekbones_low")) cheekFull = -0.2;
    else if (has("cheekbones_wide")) cheekFull = 0.35;
    else if (has("cheeks_full")) cheekFull = 0.5;
    else if (has("cheeks_hollow")) cheekFull = -0.5;
    else if (has("dimples")) cheekDimple = true;
  } else if (v.feature === "Губы") {
    highlight = "mouth";
    if (has("lips_full")) mouthThick = 9;
    else if (has("lips_thin")) mouthThick = 2.2;
    else if (has("mouth_large")) mouthW = 44;
    else if (has("mouth_small")) mouthW = 20;
    else if (has("corners_up")) mouthCorner = -1;
    else if (has("corners_down")) mouthCorner = 1;
    else if (has("corners_even")) mouthCorner = 0;
    else if (has("defined_contour")) mouthContour = "bold";
    else if (has("soft_contour")) mouthContour = "soft";
  } else if (v.feature === "Челюсть / Подбородок") {
    highlight = "jaw";
    if (has("jaw_square")) { jawWidth = 14; chinShape = "square"; }
    else if (has("chin_large")) chinSize = 14;
    else if (has("chin_small")) chinSize = -12;
    else if (has("chin_pointed")) chinShape = "pointed";
    else if (has("chin_round")) chinShape = "round";
    else if (has("chin_cleft")) chinCleft = true;
    else if (has("jaw_wide_angular")) { jawWidth = 16; chinShape = "square"; }
    else if (has("jaw_narrow_soft")) jawWidth = -14;
    else if (has("jaw_heavy")) jawHeavy = true;
  } else if (v.feature === "Форма лица") {
    highlight = "face";
    if (has("face_round")) headShape = "round";
    else if (has("face_oval")) headShape = "oval";
    else if (has("face_square")) headShape = "square";
    else if (has("face_rectangle")) headShape = "rectangle";
    else if (has("face_triangle") && !has("inverted")) headShape = "triangle";
    else if (has("inverted_triangle")) headShape = "inverted_triangle";
    else if (has("face_diamond")) headShape = "diamond";
  } else if (v.feature === "Уши") {
    highlight = "ears";
    if (has("ears_large")) earSize = 1.5;
    else if (has("ears_small")) earSize = 0.65;
    else if (has("high_set")) earY = -20;
    else if (has("low_set")) earY = 20;
    else if (has("flat")) earProtrude = -6;
    else if (has("protruding")) earProtrude = 12;
    else if (has("lobe_large")) earLobe = 2;
    else if (has("lobe_small")) earLobe = 0.5;
  }

  const on = (part) => (highlight === part ? "trait-on" : "trait-off");
  const cx = 100;

  // --- лоб / линия волос ---
  let hairPath, hx0 = 42, hx1 = 158;
  if (hairlineShape === "widow") { hx0 = 40; hx1 = 160; hairPath = `M${hx0},${hairlineY + 6} Q70,${hairlineY - 4} 100,${hairlineY + 10} Q130,${hairlineY - 4} ${hx1},${hairlineY + 6}`; }
  else if (hairlineShape === "wide") { hx0 = 32; hx1 = 168; hairPath = `M${hx0},${hairlineY + 4} Q100,${hairlineY - 10} ${hx1},${hairlineY + 4}`; }
  else if (hairlineShape === "narrow") { hx0 = 58; hx1 = 142; hairPath = `M${hx0},${hairlineY + 2} Q100,${hairlineY - 6} ${hx1},${hairlineY + 2}`; }
  else if (hairlineShape === "convex") { hairPath = `M${hx0},${hairlineY} Q100,${hairlineY - 22} ${hx1},${hairlineY}`; }
  else if (hairlineShape === "flat") { hairPath = `M${hx0},${hairlineY} L${hx1},${hairlineY}`; }
  else if (hairlineShape === "slope") { hairPath = `M${hx0},${hairlineY - 14} Q100,${hairlineY - 20} 150,${hairlineY + 18}`; hx1 = 150; }
  else { hairPath = `M${hx0},${hairlineY + 2} Q100,${hairlineY - 14} ${hx1},${hairlineY + 2}`; }
  // заливка волос: линия волос как нижняя граница + купол сверху, обрезано по силуэту головы
  const hairDomeY = Math.min(hairlineY, 46) - 34;
  const hairFillPath = `${hairPath} L${hx1 + 14},${hairDomeY} Q100,${hairDomeY - 12} ${hx0 - 14},${hairDomeY} Z`;

  // --- брови ---
  const bGapY = 92 - browGapY;
  const bSpread = browClose ? 12 : browWide ? 34 : browSpread;
  const browPath = (side) => {
    const dir = side === "l" ? -1 : 1;
    const x0 = cx + dir * (bSpread - 12), x1 = cx + dir * (bSpread + 12);
    if (browShape === "arch") return `M${x0},${bGapY + 3} Q${cx + dir * bSpread},${bGapY - 8} ${x1},${bGapY}`;
    if (browShape === "angle") return `M${x0},${bGapY + 4} L${cx + dir * bSpread},${bGapY - 6} L${x1},${bGapY + 1}`;
    return `M${x0},${bGapY} L${x1},${bGapY}`;
  };

  // --- глаза ---
  // уголки наружу поворачиваем вокруг центра глаза (зеркально для л/п), а не сдвигаем по высоте —
  // иначе глаза оказываются на разной высоте и лицо выглядит перекошенным.
  const eyeShape = (side) => {
    const dir = side === "l" ? -1 : 1;
    const ex = cx + dir * eyeSpread, ey = 100;
    const rotate = eyeCorner * 9 * dir;
    let extra = "";
    if (eyeHooded) extra = `<path d="M${ex - eyeRX - 2},${ey - eyeRY + 1} Q${ex},${ey - eyeRY - 7} ${ex + eyeRX + 2},${ey - eyeRY + 1}" class="trait-line-bold ${on("eyes")}" fill="none"/>`;
    if (eyeOpenCrease) extra = `<path d="M${ex - eyeRX + 1},${ey - eyeRY - 4} Q${ex},${ey - eyeRY - 9} ${ex + eyeRX - 1},${ey - eyeRY - 4}" class="trait-line ${on("eyes")}" fill="none"/>`;
    if (eyeDeep) extra += `<path d="M${ex - eyeRX - 4},${ey - eyeRY - 2} Q${ex},${ey - eyeRY - 10} ${ex + eyeRX + 4},${ey - eyeRY - 2}" class="trait-line-soft trait-faint" fill="none"/>`;
    return `<g transform="rotate(${rotate} ${ex} ${ey})"><ellipse cx="${ex}" cy="${ey}" rx="${eyeRX}" ry="${eyeRY}" class="trait-fill ${on("eyes")}"/><circle cx="${ex}" cy="${ey}" r="2.2" class="trait-pupil"/><circle cx="${ex - 1.2}" cy="${ey - 1.4}" r="0.9" class="trait-glint"/></g>${extra}`;
  };

  // --- нос ---
  let noseBridgePath;
  const nx0 = cx, ny0 = 78, ny1 = 78 + noseLen;
  if (noseBridge === "hump") noseBridgePath = `M${nx0},${ny0} Q${nx0 + 7},${ny0 + noseLen * 0.55} ${nx0},${ny1}`;
  else if (noseBridge === "concave") noseBridgePath = `M${nx0},${ny0} Q${nx0 - 6},${ny0 + noseLen * 0.55} ${nx0},${ny1}`;
  else noseBridgePath = `M${nx0},${ny0} L${nx0},${ny1}`;
  const tipDy = noseTipDir === "down" ? 6 : noseTipDir === "up" ? -4 : 2;
  let tipShape = "";
  if (noseTip === "pointed") tipShape = `<path d="M${nx0 - 4},${ny1} L${nx0},${ny1 + 6 + tipDy} L${nx0 + 4},${ny1}" class="trait-line ${on("nose")}" fill="none"/>`;
  else if (noseTip === "round") tipShape = `<circle cx="${nx0}" cy="${ny1 + 3 + tipDy}" r="4.5" class="trait-fill ${on("nose")}"/>`;
  else tipShape = `<path d="M${nx0 - noseWing / 2},${ny1 + 2} Q${nx0},${ny1 + 6 + tipDy} ${nx0 + noseWing / 2},${ny1 + 2}" class="trait-line ${on("nose")}" fill="none"/>`;
  const wingsPath = `<path d="M${nx0 - noseWing},${ny1} Q${nx0},${ny1 + 8} ${nx0 + noseWing},${ny1}" class="trait-line trait-faint" fill="none"/>`;

  // --- щёки ---
  const cheekPath = (side) => {
    const dir = side === "l" ? -1 : 1;
    const bow = 14 * cheekFull;
    return `<path d="M${cx + dir * 46},70 Q${cx + dir * (58 + bow)},110 ${cx + dir * 46},150" class="trait-line ${on("cheeks")}" fill="none"/>`;
  };
  const cheekbonesPath = cheekHighlight ? `<path d="M${cx - 50},92 L${cx - 30},86" class="trait-line ${on("cheeks")}"/><path d="M${cx + 50},92 L${cx + 30},86" class="trait-line ${on("cheeks")}"/>` : "";
  const dimplesPath = cheekDimple ? `<circle cx="${cx - 30}" cy="152" r="2.2" class="trait-fill ${on("cheeks")}"/><circle cx="${cx + 30}" cy="152" r="2.2" class="trait-fill ${on("cheeks")}"/>` : "";

  // --- рот (заполненная форма губ, а не голые линии) ---
  const my = 158, cw = mouthCorner * 6;
  const lipsFill = `M${cx - mouthW / 2},${my + cw} Q${cx},${my - mouthThick * 0.5} ${cx + mouthW / 2},${my + cw} Q${cx},${my + cw + mouthThick} ${cx - mouthW / 2},${my + cw} Z`;
  const mouthLine = `M${cx - mouthW / 2},${my + cw} Q${cx},${my + cw + mouthThick * 0.35} ${cx + mouthW / 2},${my + cw}`;
  const mouthClass = mouthContour === "bold" ? "trait-line-bold" : mouthContour === "soft" ? "trait-line-soft" : "trait-line";

  // --- челюсть/подбородок ---
  const jawL = 46 - jawWidth, jawR = 154 + jawWidth;
  let chinPath;
  if (chinShape === "square") chinPath = `M${jawL},150 L${cx - 24},198 L${cx + 24},198 L${jawR},150`;
  else if (chinShape === "pointed") chinPath = `M${jawL},150 Q${cx},${210 + chinSize} ${jawR},150`;
  else chinPath = `M${jawL},150 Q${cx},${200 + chinSize} ${jawR},150`;
  const cleftPath = chinCleft ? `<line x1="${cx}" y1="188" x2="${cx}" y2="200" class="trait-line ${on("jaw")}"/>` : "";
  const jawClass = jawHeavy ? "trait-line-bold" : "trait-line";

  // --- уши ---
  const earPath = (side) => {
    const dir = side === "l" ? -1 : 1;
    const ex = cx + dir * (78 + earProtrude), ey = 104 + earY;
    return `<ellipse cx="${ex}" cy="${ey}" rx="${7 * earSize}" ry="${13 * earSize}" class="trait-fill ${on("ears")}"/><circle cx="${ex}" cy="${ey + 9 * earSize}" r="${2.4 * earLobe}" class="trait-fill ${on("ears")}"/>`;
  };

  const clipId = `pa-head-clip-${uid}`;
  const shoulderW = 66 + Math.max(jawWidth, 0);
  return `
  <svg viewBox="0 0 200 246" class="trait-svg" role="img" aria-label="${esc(v.label)}">
    <defs><clipPath id="${clipId}"><path d="${headOutlinePath(headShape)}"/></clipPath></defs>
    <path d="M${cx - shoulderW},246 Q${cx - shoulderW},198 ${cx - 30},188 L${cx + 30},188 Q${cx + shoulderW},198 ${cx + shoulderW},246 Z" class="trait-shoulders"/>
    ${earPath("l")}${earPath("r")}
    <path d="${headOutlinePath(headShape)}" class="trait-face ${on("face")}"/>
    <g clip-path="url(#${clipId})">
      <path d="${hairFillPath}" class="trait-hair ${on("forehead")}"/>
    </g>
    <path d="${hairPath}" class="trait-line ${on("forehead")}" fill="none"/>
    ${browRidge ? `<path d="M${cx - 40},68 Q${cx},63 ${cx + 40},68" class="trait-line-bold ${on("forehead")}" fill="none"/>` : ""}
    <path d="${browPath("l")}" class="trait-line ${on("brows")}" fill="none" stroke-width="${browThick}"/>
    <path d="${browPath("r")}" class="trait-line ${on("brows")}" fill="none" stroke-width="${browThick}"/>
    ${eyeShape("l")}${eyeShape("r")}
    ${cheekPath("l")}${cheekPath("r")}${cheekbonesPath}${dimplesPath}
    <path d="${noseBridgePath}" class="trait-line ${on("nose")}" fill="none"/>
    ${wingsPath}${tipShape}
    <path d="${lipsFill}" class="trait-lips ${on("mouth")}"/>
    <path d="${mouthLine}" class="${mouthClass} ${on("mouth")}" fill="none"/>
    <path d="${chinPath}" class="${jawClass} ${on("jaw")}" fill="none"/>
    ${cleftPath}
  </svg>`;
}

// карточка-медиа: всегда схематичная иконка (без фото — по решению пользователя)
function mediaHtml(v, cls) {
  return `<div class="${cls} trait-icon-box">${traitIcon(v)}</div>`;
}

// ---------- INIT ----------
async function init() {
  try {
    state.data = await fetch("data.json").then((r) => r.json());
  } catch (e) {
    $("#view").innerHTML = `<p style="color:var(--bad)">Не удалось загрузить data.json. Запусти через локальный сервер (не открывай файл напрямую).</p>`;
    return;
  }
  // плоский список вариантов с привязкой к feature
  state.variants = state.data.features.flatMap((f) =>
    f.variants.map((v) => ({ ...v, feature: f.feature }))
  );
  // разбор примеров (необязательный)
  try {
    const md = await fetch("analysis.md").then((r) => r.text());
    parseAnalysis(md);
  } catch (e) { /* без подробного разбора — не критично */ }

  // дисклеймер из JSON
  const disc = state.data.disclaimer;
  $("#discText").textContent = disc.length > 90 ? disc.slice(0, 88).trim() + "…" : disc;
  $("#footerDisc").textContent = disc;

  loadSrs();
  bindChrome();
  initTheme();
  route("atlas");
}

// Парсим analysis.md: блоки "### NN_файл.png" с полями Что видно/Традиция/Как читается
function parseAnalysis(md) {
  const blocks = md.split(/^###\s+/m).slice(1);
  for (const b of blocks) {
    const nl = b.indexOf("\n");
    const img = b.slice(0, nl).trim().replace(/\s*\(.*?\)\s*$/, ""); // убираем "(3/4 ракурс)"
    const grab = (label) => {
      const m = b.match(new RegExp("\\*\\*" + label + ":\\*\\*\\s*([^\\n]+)"));
      return m ? m[1].trim() : "";
    };
    state.analysis[img] = {
      seen: grab("Что видно"),
      tradition: grab("Традиция"),
      perception: grab("Как читается"),
    };
  }
}

// ---------- CHROME / NAV ----------
function bindChrome() {
  document.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => route(b.dataset.go))
  );
  $("#discMore").addEventListener("click", showDisclaimerModal);
  $("#modal").addEventListener("click", (e) => { if (e.target.dataset.close !== undefined) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeModal(); return; }
    if (state.view !== "trainer" || !$("#modal") || !$("#modal").hidden) return;
    if (e.key === " ") { e.preventDefault(); const f = $("#flash"); if (f) f.click(); }
    else if (state.flipped) {
      if (e.key === "ArrowRight") advance(true);
      else if (e.key === "ArrowLeft") advance(false);
    }
  });
}

function route(view, arg) {
  state.view = view;
  document.querySelectorAll(".nav-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.go === view)
  );
  const v = $("#view");
  v.classList.remove("fade-in"); void v.offsetWidth; v.classList.add("fade-in");
  if (view === "atlas") renderAtlas();
  else if (view === "detail") renderDetail(arg);
  else if (view === "trainer") renderTrainer();
  else if (view === "quiz") renderQuiz();
  else if (view === "principles") renderPrinciples();
  window.scrollTo({ top: 0, behavior: "instant" });
}

// ---------- THEME ----------
function initTheme() {
  const saved = localStorage.getItem("pa-theme") || "dark";
  document.documentElement.dataset.theme = saved;
  updateThemeIcon();
  $("#themeToggle").addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme;
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("pa-theme", next);
    updateThemeIcon();
  });
}
function updateThemeIcon() {
  $("#themeToggle").textContent = document.documentElement.dataset.theme === "dark" ? "☾" : "☀";
}

// ---------- ATLAS ----------
function renderAtlas() {
  const features = state.data.features.map((f) => f.feature);

  const chips = `<div class="filters">
    <button class="chip ${state.filter === "all" ? "active" : ""}" data-f="all">Все черты</button>
    ${features.map((f) => `<button class="chip ${state.filter === f ? "active" : ""}" data-f="${esc(f)}">${esc(f)}</button>`).join("")}
  </div>`;

  const shown = state.filter === "all" ? features : [state.filter];
  const groups = shown.map((f) => {
    const vs = state.variants.filter((v) => v.feature === f);
    const cards = vs.map((v) => `
      <article class="card" data-id="${v.id}">
        ${mediaHtml(v, "card-img")}
        <div class="card-body">
          <div class="card-feat">${esc(v.feature)}</div>
          <div class="card-label">${esc(v.label)}</div>
          <div class="card-perc">${esc(v.perception)}</div>
        </div>
      </article>`).join("");
    return `<section class="feature-group">
      <h3>${esc(f)} <span class="count">${vs.length} ${plural(vs.length)}</span></h3>
      <div class="grid">${cards}</div>
    </section>`;
  }).join("");

  $("#view").innerHTML = `
    <div class="page-head">
      <div class="page-kicker">Учебный атлас</div>
      <h1 class="page-title">Лицо как язык<br/>восприятия</h1>
      <p class="page-lead">Каждая черта — это не приговор о характере, а визуальный сигнал: «как традиция трактует» и «как считывает зритель». Выбирай черту и сравнивай контрасты.</p>
    </div>
    ${chips}
    ${groups}`;

  document.querySelectorAll(".chip").forEach((c) =>
    c.addEventListener("click", () => { state.filter = c.dataset.f; renderAtlas(); })
  );
  document.querySelectorAll(".card").forEach((c) =>
    c.addEventListener("click", () => route("detail", c.dataset.id))
  );
}
function plural(n) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return "вариант";
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return "варианта";
  return "вариантов";
}

// ---------- DETAIL ----------
function renderDetail(id) {
  const v = state.variants.find((x) => x.id === id);
  if (!v) return route("atlas");
  const extra = state.analysis[v.image];

  // контраст-пара: другие варианты той же черты (если есть)
  const siblings = state.variants.filter((x) => x.feature === v.feature && x.id !== v.id);
  const pair = siblings.length ? siblings : [];

  const contrastHtml = pair.length ? `
    <div class="contrast">
      <div class="contrast-h">Контраст в той же черте</div>
      ${pair.map((p) => `
        <div class="contrast-card" data-id="${p.id}" style="margin-bottom:10px">
          ${mediaHtml(p, "cc-img")}
          <div>
            <div class="cc-label">${esc(p.label)}</div>
            <div class="cc-perc">${esc(p.perception)}</div>
          </div>
        </div>`).join("")}
    </div>` : "";

  const seenHtml = extra && extra.seen ? `
    <div class="detail-block">
      <h4>Что смотреть на схеме</h4>
      <p>${esc(extra.seen)}</p>
    </div>` : "";

  $("#view").innerHTML = `
    <button class="back-btn" id="backBtn">← Назад к атласу</button>
    <div class="detail">
      <div>
        ${mediaHtml(v, "detail-img")}
      </div>
      <div>
        <div class="detail-feat">${esc(v.feature)}</div>
        <h2 class="detail-title">${esc(v.label)}</h2>

        ${seenHtml}

        <div class="detail-block is-tradition">
          <h4>Традиция <span class="tag-foklor">фольклор, не факт</span></h4>
          <p>${esc(v.tradition)}</p>
        </div>

        <div class="detail-block">
          <h4>Как читается зрителем</h4>
          <p>${esc(v.perception)}</p>
        </div>

        ${contrastHtml}
      </div>
    </div>`;

  $("#backBtn").addEventListener("click", () => route("atlas"));
  document.querySelectorAll(".contrast-card").forEach((c) =>
    c.addEventListener("click", () => route("detail", c.dataset.id))
  );
}

// ---------- TRAINER ----------
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function newDeck() {
  // приоритет: сначала карточки "к повторению" (просрочен srs-интервал), слабые (низкий box) — первыми
  let due = srsDueVariants();
  if (!due.length) due = state.variants.slice(); // всё выучено на сейчас — свободный повтор всей колоды
  due.sort((a, b) => srsGet(a.id).box - srsGet(b.id).box);
  // лёгкая перетасовка внутри одинакового box, чтобы не запоминать порядок
  const grouped = {};
  due.forEach((v) => { const b = srsGet(v.id).box; (grouped[b] = grouped[b] || []).push(v); });
  state.deck = Object.keys(grouped).sort((a, b) => a - b).flatMap((b) => shuffle(grouped[b]));
  state.deckPos = 0;
  state.flipped = false;
  state.score = { right: 0, wrong: 0 };
}
function renderTrainer() {
  if (!state.deck.length || state.deckPos >= state.deck.length) {
    if (state.deckPos >= state.deck.length && state.deck.length) return renderTrainerDone();
    newDeck();
  }
  const card = state.deck[state.deckPos];
  const total = state.deck.length;
  const mastered = srsMasteredCount();
  const allTotal = state.variants.length;

  $("#view").innerHTML = `
    <div class="page-head" style="text-align:center">
      <div class="page-kicker">Быстрое изучение · интервальное повторение</div>
      <h1 class="page-title">Угадай черту</h1>
      <p class="page-lead" style="margin-left:auto;margin-right:auto">Плохо знаешь — карточка вернётся скоро. Знаешь хорошо — вернётся через несколько дней. <b>Space</b> перевернуть, <b>←</b> не знал, <b>→</b> знал.</p>
    </div>
    <div class="trainer-wrap">
      <div class="mastery-bar"><div class="mastery-fill" style="width:${Math.round((mastered / allTotal) * 100)}%"></div></div>
      <div class="score-row">
        <span>Карточка <b>${state.deckPos + 1}</b> / ${total}</span>
        <span>Выучено <b>${mastered}</b> / ${allTotal}</span>
        <span>В сессии верно <b>${state.score.right}</b></span>
      </div>
      <div class="flashcard ${state.flipped ? "flipped" : ""}" id="flash">
        <div class="flash-inner">
          <div class="flash-face flash-front">
            ${mediaHtml(card, "flash-img")}
            <div class="flash-hint">Нажми / Space · какая это черта?</div>
          </div>
          <div class="flash-face flash-back">
            <div class="fb-feat">${esc(card.feature)}</div>
            <div class="fb-label">${esc(card.label)}</div>
            <div class="fb-block"><b>Традиция:</b> ${esc(card.tradition)}</div>
            <div class="fb-block"><b>Как читается:</b> ${esc(card.perception)}</div>
          </div>
        </div>
      </div>
      <div id="trainerControls"></div>
      <p class="trainer-tip">Оцени честно — правильно ли ты угадал. Это управляет тем, когда карточка вернётся.</p>
    </div>`;

  $("#flash").addEventListener("click", () => {
    state.flipped = !state.flipped;
    $("#flash").classList.toggle("flipped", state.flipped);
    renderTrainerControls();
  });
  renderTrainerControls();
}
function renderTrainerControls() {
  const box = $("#trainerControls");
  if (!box) return;
  if (!state.flipped) {
    box.innerHTML = `<div class="trainer-actions"><button class="btn btn-primary" id="flipBtn">Показать ответ (Space)</button></div>`;
    $("#flipBtn").addEventListener("click", () => $("#flash").click());
  } else {
    box.innerHTML = `<div class="trainer-actions">
      <button class="btn btn-bad" id="wrongBtn">Не угадал (←)</button>
      <button class="btn btn-good" id="rightBtn">Угадал ✓ (→)</button>
    </div>`;
    $("#rightBtn").addEventListener("click", () => advance(true));
    $("#wrongBtn").addEventListener("click", () => advance(false));
  }
}
function advance(ok) {
  const card = state.deck[state.deckPos];
  srsAnswer(card.id, ok);
  if (ok) state.score.right++; else state.score.wrong++;
  state.deckPos++;
  state.flipped = false;
  renderTrainer();
}
function renderTrainerDone() {
  const { right, wrong } = state.score;
  const total = right + wrong;
  const pct = total ? Math.round((right / total) * 100) : 0;
  const mastered = srsMasteredCount();
  const allTotal = state.variants.length;
  $("#view").innerHTML = `
    <div class="trainer-wrap">
      <div class="page-head" style="text-align:center">
        <div class="page-kicker">Колода пройдена</div>
        <h1 class="page-title">${pct}% точность</h1>
        <p class="page-lead" style="margin:10px auto 0">Верно ${right} из ${total}. Выучено насовсем <b>${mastered}</b> из ${allTotal} черт. Помни: «угадал» здесь = «считал визуальный сигнал так же, как традиция», а не «определил характер человека».</p>
      </div>
      <div class="trainer-actions" style="margin-top:8px">
        <button class="btn" id="toAtlas">В атлас</button>
        <button class="btn btn-primary" id="again">Ещё раз</button>
      </div>
    </div>`;
  $("#again").addEventListener("click", () => { newDeck(); renderTrainer(); });
  $("#toAtlas").addEventListener("click", () => route("atlas"));
}

// ---------- QUIZ (варианты ответов) ----------
function newQuizDeck() {
  state.quizDeck = shuffle(state.variants);
  state.quizPos = 0;
  state.quizScore = { right: 0, wrong: 0 };
  state.quizCurrent = null;
  state.quizAnswered = false;
}
// собираем вопрос: если у черты есть фото — иногда просим угадать label по фото,
// иначе (или в остальных случаях) — угадать традицию/восприятие по названию черты
function buildQuizQuestion(v) {
  const mode = Math.random() < 0.4 ? "label" : (Math.random() < 0.5 ? "tradition" : "perception");

  let prompt, correctText, poolField;
  if (mode === "label") {
    prompt = "На схеме — какой это вариант черты?";
    correctText = v.label;
    poolField = "label";
  } else if (mode === "tradition") {
    prompt = `Черта: «${v.label}» (${v.feature}). Как это трактует традиция?`;
    correctText = v.tradition;
    poolField = "tradition";
  } else {
    prompt = `Черта: «${v.label}» (${v.feature}). Как это обычно считывает зритель?`;
    correctText = v.perception;
    poolField = "perception";
  }

  // дистракторы: сперва из той же черты, потом добираем из остальных вариантов
  const sameFeature = state.variants.filter((x) => x.feature === v.feature && x.id !== v.id);
  const others = state.variants.filter((x) => x.feature !== v.feature && x.id !== v.id);
  const pool = shuffle(sameFeature).concat(shuffle(others));
  const seen = new Set([correctText]);
  const distractors = [];
  for (const p of pool) {
    const t = p[poolField];
    if (t && !seen.has(t)) { seen.add(t); distractors.push(t); }
    if (distractors.length >= 3) break;
  }
  const options = shuffle([correctText, ...distractors]);

  return { mode, prompt, variant: v, correctText, options };
}
function renderQuiz() {
  if (!state.quizDeck.length || state.quizPos >= state.quizDeck.length) {
    if (state.quizPos >= state.quizDeck.length && state.quizDeck.length) return renderQuizDone();
    newQuizDeck();
  }
  if (!state.quizCurrent || state.quizCurrent.variant.id !== state.quizDeck[state.quizPos].id) {
    state.quizCurrent = buildQuizQuestion(state.quizDeck[state.quizPos]);
    state.quizAnswered = false;
  }
  const q = state.quizCurrent;
  const total = state.quizDeck.length;

  const mediaBlock = q.mode === "label" ? `<div class="quiz-media">${mediaHtml(q.variant, "quiz-img")}</div>` : "";

  $("#view").innerHTML = `
    <div class="page-head" style="text-align:center">
      <div class="page-kicker">Квиз · варианты ответов</div>
      <h1 class="page-title">Проверь себя</h1>
      <p class="page-lead" style="margin-left:auto;margin-right:auto">Выбери правильный вариант из четырёх. Это тренирует именно узнавание — как в атласе.</p>
    </div>
    <div class="trainer-wrap quiz-wrap">
      <div class="score-row">
        <span>Вопрос <b>${state.quizPos + 1}</b> / ${total}</span>
        <span>Верно <b>${state.quizScore.right}</b></span>
        <span>Мимо <b>${state.quizScore.wrong}</b></span>
      </div>
      ${mediaBlock}
      <div class="quiz-prompt">${esc(q.prompt)}</div>
      <div class="quiz-options" id="quizOptions">
        ${q.options.map((opt, i) => `<button class="quiz-opt" data-i="${i}">${esc(opt)}</button>`).join("")}
      </div>
      <div id="quizControls"></div>
    </div>`;

  document.querySelectorAll(".quiz-opt").forEach((b) =>
    b.addEventListener("click", () => answerQuiz(b))
  );
}
function answerQuiz(btn) {
  if (state.quizAnswered) return;
  state.quizAnswered = true;
  const q = state.quizCurrent;
  const chosen = btn.textContent;
  const ok = chosen === q.correctText;
  if (ok) state.quizScore.right++; else state.quizScore.wrong++;

  document.querySelectorAll(".quiz-opt").forEach((b) => {
    b.disabled = true;
    if (b.textContent === q.correctText) b.classList.add("is-correct");
    else if (b === btn) b.classList.add("is-wrong");
  });

  $("#quizControls").innerHTML = `<div class="trainer-actions" style="margin-top:16px">
    <button class="btn btn-primary" id="nextQ">${state.quizPos + 1 >= state.quizDeck.length ? "Итоги" : "Дальше →"}</button>
  </div>`;
  $("#nextQ").addEventListener("click", () => {
    state.quizPos++;
    state.quizCurrent = null;
    renderQuiz();
  });
}
function renderQuizDone() {
  const { right, wrong } = state.quizScore;
  const total = right + wrong;
  const pct = total ? Math.round((right / total) * 100) : 0;
  $("#view").innerHTML = `
    <div class="trainer-wrap">
      <div class="page-head" style="text-align:center">
        <div class="page-kicker">Квиз пройден</div>
        <h1 class="page-title">${pct}% точность</h1>
        <p class="page-lead" style="margin:10px auto 0">Верно ${right} из ${total}. Прошёл(-ла) все черты атласа — от лба до ушей.</p>
      </div>
      <div class="trainer-actions" style="margin-top:8px">
        <button class="btn" id="toAtlas2">В атлас</button>
        <button class="btn btn-primary" id="again2">Ещё раз</button>
      </div>
    </div>`;
  $("#again2").addEventListener("click", () => { newQuizDeck(); renderQuiz(); });
  $("#toAtlas2").addEventListener("click", () => route("atlas"));
}

// ---------- PRINCIPLES ----------
function renderPrinciples() {
  const p = state.data.principles || [];
  const z = state.data.zones || [];
  $("#view").innerHTML = `
    <div class="page-head">
      <div class="page-kicker">Как читать лицо</div>
      <h1 class="page-title">Принципы</h1>
      <p class="page-lead">Правила, без которых атлас превращается в стереотипы. Читать перед тренажёром.</p>
    </div>
    <div class="principles-list">
      ${p.map((t, i) => `<div class="principle"><div class="num">${i + 1}</div><p>${esc(t)}</p></div>`).join("")}
    </div>

    <div class="zones-block">
      <h3 class="serif" style="font-size:22px;margin-bottom:4px">Три зоны лица</h3>
      <p class="page-lead">Традиционное деление по вертикали — основа «закона пропорций».</p>
      <div class="zones-grid">
        ${z.map((zone) => `
          <div class="zone-card">
            <div class="z-name">${esc(zone.name)}</div>
            <div class="z-range">${esc(zone.range)}</div>
            <div class="z-trad">${esc(zone.tradition)}</div>
          </div>`).join("")}
      </div>
    </div>

    <div class="big-disclaimer">
      <h4>⚠ Важно</h4>
      <p>${esc(state.data.disclaimer)}</p>
    </div>`;
}

// ---------- MODAL ----------
function showDisclaimerModal() {
  $("#modalCard").innerHTML = `
    <button class="modal-close" data-close>×</button>
    <h3>Что это за проект</h3>
    <p>${esc(state.data.disclaimer)}</p>
    <p style="color:var(--ink-faint)">Здесь нет загрузки и анализа реальных людей. Все лица — вымышленные учебные образцы. Никаких выводов о характере конкретного человека.</p>`;
  $("#modalCard").querySelector("[data-close]").addEventListener("click", closeModal);
  $("#modal").hidden = false;
}
function closeModal() { $("#modal").hidden = true; }

init();
