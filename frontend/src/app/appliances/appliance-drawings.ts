/**
 * Les dessins de la bibliothèque d'électroménager : chaque modèle vu comme dans un catalogue, de face (un four, un
 * réfrigérateur), de dessus (une plaque, un évier) ou de profil (un robinet), dans sa finition — inox brossé en
 * dégradé, verre noir avec son reflet, blanc laqué, chromé, laiton. Du SVG, sans image extérieure.
 */
import type { ApplianceDef } from "../../features/appliance-library";

let ids = 0;

/** The SVG of a model in a finish. */
export function applianceDrawing(def: ApplianceDef, finish: string): string {
  const k = `ap${++ids}`;
  const face = finish === "black" ? ["#3b3e42", "#16181a", "#2a2c30"] : finish === "white" ? ["#ffffff", "#e6e7e9", "#f6f6f7"] : finish === "brass" ? ["#e9cf8d", "#a8864a", "#d2b06a"] : finish === "chrome" ? ["#ffffff", "#9aa0a6", "#e3e6e8"] : ["#eef0f2", "#a7abaf", "#d8dbde"];
  const defs = `<defs>
    <linearGradient id="${k}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${face[0]}"/><stop offset=".55" stop-color="${face[2]}"/><stop offset="1" stop-color="${face[1]}"/></linearGradient>
    <linearGradient id="${k}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a4248"/><stop offset=".45" stop-color="#14181b"/><stop offset="1" stop-color="#050607"/></linearGradient>
    <linearGradient id="${k}r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".5" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="${k}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7f8f9"/><stop offset=".5" stop-color="#9ea3a8"/><stop offset="1" stop-color="#e2e4e6"/></linearGradient>
    <radialGradient id="${k}b" cx=".5" cy=".4" r=".65"><stop offset="0" stop-color="#cfd3d6"/><stop offset=".7" stop-color="#8d9297"/><stop offset="1" stop-color="#5f6468"/></radialGradient>
  </defs>`;
  const F = `url(#${k}f)`;
  const G = `url(#${k}g)`;
  const R = `url(#${k}r)`;
  const M = `url(#${k}m)`;
  const B = `url(#${k}b)`;
  const edge = 'stroke="#55595e" stroke-width=".6"';
  const glare = (x: number, y: number, w: number, h: number) => `<path d="M${x} ${y + h}L${x + w * 0.45} ${y}H${x + w * 0.62}L${x + w * 0.17} ${y + h}Z" fill="${R}"/>`;
  const knob = (x: number, y: number, r = 3.2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${M}" ${edge}/><rect x="${x - 0.5}" y="${y - r + 0.6}" width="1" height="${r}" fill="#444"/>`;
  const bar = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${M}" stroke-width="3" stroke-linecap="round"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-opacity=".6" stroke-width=".7" stroke-linecap="round"/>`;
  let body = "";
  let h = 70;
  switch (def.category) {
    case "oven":
      if (def.id === "coffee-builtin") {
        h = 78;
        body = `<rect x="2" y="2" width="96" height="74" rx="2" fill="${F}" ${edge}/><rect x="6" y="6" width="88" height="66" rx="1" fill="${G}"/>${glare(6, 6, 88, 30)}
          <rect x="38" y="10" width="24" height="9" rx="1" fill="#0b0d0f"/><text x="50" y="16.5" font-size="3.6" text-anchor="middle" fill="#7fd3ff" font-family="monospace">2 TASSES</text>
          ${[24, 36, 64, 76].map((x) => `<circle cx="${x}" cy="27" r="2.2" fill="#8d9297"/>`).join("")}
          <rect x="30" y="36" width="40" height="34" rx="1" fill="#050607" stroke="#3a3e42" stroke-width=".6"/><rect x="46" y="38" width="3" height="7" fill="${M}"/><rect x="51" y="38" width="3" height="7" fill="${M}"/>
          <rect x="32" y="64" width="36" height="4" fill="${M}"/>`;
        break;
      }
      if (def.id === "range-90") {
        h = 92;
        body = `<rect x="2" y="12" width="96" height="78" rx="2" fill="${F}" ${edge}/><rect x="2" y="6" width="96" height="6" fill="#26282b"/>
          ${[10, 30, 50, 70, 90].map((x) => `<rect x="${x - 6}" y="2" width="12" height="4" fill="#1a1a1a"/>`).join("")}
          ${[12, 27, 42, 57, 72, 87].map((x) => knob(x, 18, 2.8)).join("")}${bar(12, 28, 88, 28)}
          <rect x="10" y="32" width="80" height="38" rx="2" fill="${G}"/>${glare(10, 32, 80, 38)}<rect x="2" y="74" width="96" height="14" fill="${F}" ${edge}/>`;
        break;
      }
      if (def.id === "drawer-warming") {
        h = 26;
        body = `<rect x="2" y="2" width="96" height="22" rx="2" fill="${F}" ${edge}/>${bar(12, 13, 88, 13)}<rect x="88" y="5" width="5" height="2" fill="#7fd3ff"/>`;
        break;
      }
      h = def.id === "oven-pyro" ? 100 : def.id === "oven-90" ? 58 : 78;
      body = `<rect x="2" y="2" width="96" height="${h - 4}" rx="2" fill="${F}" ${edge}/>
        <rect x="2" y="2" width="96" height="16" fill="${finish === "inox" ? F : G}" ${edge}/>
        <rect x="38" y="6" width="24" height="8" rx="1" fill="${G}"/><text x="50" y="12.2" font-size="5" text-anchor="middle" fill="#7fd3ff" font-family="monospace">12:00</text>
        ${knob(16, 10)}${knob(84, 10)}
        ${bar(12, 25, 88, 25)}
        <rect x="11" y="31" width="78" height="${h - 42}" rx="2" fill="${G}"/>${glare(11, 31, 78, h - 42)}
        ${def.id === "oven-steam" ? `<rect x="80" y="4" width="10" height="10" rx="1" fill="#2b3035"/>` : ""}`;
      break;
    case "microwave":
      h = 62;
      body = `<rect x="2" y="2" width="96" height="58" rx="2" fill="${F}" ${edge}/>
        <rect x="8" y="8" width="58" height="46" rx="2" fill="${G}"/>${glare(8, 8, 58, 46)}
        <rect x="70" y="2" width="28" height="58" fill="${G}"/><text x="84" y="16" font-size="5" text-anchor="middle" fill="#7fd3ff" font-family="monospace">0:30</text>
        <rect x="12" y="12" width="50" height="38" rx="1" fill="#6f7377" opacity=".55"/><ellipse cx="37" cy="44" rx="20" ry="3.5" fill="#cfe3ea" opacity=".7"/>
        ${knob(84, 34, 6)}${[78, 90].flatMap((x) => [44, 50].map((y) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#8d9297"/>`)).join("")}<rect x="76" y="54" width="16" height="3" rx="1" fill="#8d9297"/>${bar(64, 12, 64, 50)}`;
      break;
    case "hob": {
      h = 72;
      if (def.id === "hob-teppan") {
        body = `<rect x="26" y="2" width="48" height="68" rx="3" fill="${F}" ${edge}/><rect x="30" y="18" width="40" height="48" rx="1" fill="${M}" stroke="#777" stroke-width=".5"/>${glare(30, 18, 40, 48)}<rect x="38" y="7" width="24" height="3" rx="1.5" fill="#6d7276"/>`;
      } else if (def.id === "hob-extract") {
        body = `<rect x="2" y="2" width="96" height="68" rx="3" fill="${G}" stroke="#777" stroke-width=".8"/>
          ${[[18, 22], [18, 50], [82, 22], [82, 50]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11" fill="none" stroke="#8a8f94" stroke-width="1.1"/>`).join("")}
          ${Array.from({ length: 7 }, (_, i) => `<rect x="${38 + i * 3.6}" y="14" width="2" height="44" fill="#55595e"/>`).join("")}
          <rect x="34" y="63" width="32" height="3" rx="1.5" fill="#6d7276"/>${glare(4, 4, 92, 64)}`;
      } else if (def.id === "hob-gas") {
        const burners: [number, number, number][] = [[28, 22, 10], [28, 50, 8], [72, 22, 8], [72, 50, 11]];
        body = `<rect x="2" y="2" width="96" height="68" rx="3" fill="${finish === "black" ? G : F}" ${edge}/>
          ${burners.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + 3}" fill="#2a2a2c"/><circle cx="${x}" cy="${y}" r="${r}" fill="#111"/><circle cx="${x}" cy="${y}" r="${r * 0.55}" fill="#3c3c3e"/>`).join("")}
          <path d="M8 10H92M8 36H92M8 62H92M10 8V64M50 8V64M90 8V64" stroke="#1a1a1a" stroke-width="2.2" fill="none" stroke-linecap="round"/>
          ${[20, 40, 60, 80].map((x) => knob(x, 67, 2.4)).join("")}`;
      } else {
        const zones: [number, number, number][] = def.id === "hob-domino" ? [[50, 22, 13], [50, 50, 11]] : [[28, 22, 14], [28, 50, 11], [72, 22, 11], [72, 50, 14]];
        body = `<rect x="${def.id === "hob-domino" ? 26 : 2}" y="2" width="${def.id === "hob-domino" ? 48 : 96}" height="68" rx="3" fill="${G}" stroke="#777" stroke-width=".8"/>
          ${zones.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#8a8f94" stroke-width="1.1"/><circle cx="${x}" cy="${y}" r="${r * 0.5}" fill="none" stroke="#5b6064" stroke-width=".6"/>`).join("")}
          <rect x="${def.id === "hob-domino" ? 38 : 34}" y="63" width="${def.id === "hob-domino" ? 24 : 32}" height="3" rx="1.5" fill="#6d7276"/>${glare(4, 4, 92, 64)}`;
      }
      break;
    }
    case "hood":
      h = 80;
      body =
        def.id === "hood-island"
          ? `<rect x="40" y="0" width="20" height="44" fill="${F}" ${edge}/><rect x="32" y="44" width="36" height="10" fill="${F}" ${edge}/><rect x="4" y="54" width="92" height="10" rx="1" fill="${F}" ${edge}/>${[0, 1, 2, 3].map((i) => `<circle cx="${84 - i * 6}" cy="59" r="1.3" fill="#3d4044"/>`).join("")}`
          : def.id === "hood-builtin"
          ?`<rect x="6" y="20" width="88" height="22" rx="1" fill="#2d3034" ${edge}/><rect x="6" y="38" width="88" height="8" rx="1" fill="${F}" ${edge}/>${[0, 1, 2].map((i) => `<circle cx="${78 - i * 7}" cy="42" r="1.5" fill="#cfd3d6"/>`).join("")}`
          : def.id === "hood-glass"
            ? `<rect x="40" y="2" width="20" height="40" fill="${finish === "white" ? F : "#2b2d31"}" ${edge}/><path d="M6 46L22 40H78L94 46V60H6Z" fill="${finish === "white" ? "#f3f3f4" : G}" ${edge}/>${glare(10, 42, 80, 16)}<rect x="6" y="60" width="88" height="4" fill="#202226"/>`
            : `<rect x="38" y="2" width="24" height="44" fill="${F}" ${edge}/><path d="M28 46H72L94 62H6Z" fill="${F}" ${edge}/><rect x="6" y="62" width="88" height="6" fill="${F}" ${edge}/>${[0, 1, 2, 3].map((i) => `<circle cx="${84 - i * 6}" cy="65" r="1.3" fill="#3d4044"/>`).join("")}`;
      break;
    case "fridge":
      h = 150;
      body =
        def.id === "fridge-french"
          ? `<rect x="2" y="2" width="96" height="146" rx="3" fill="${F}" ${edge}/><line x1="50" y1="2" x2="50" y2="86" stroke="#4a4d52" stroke-width="1"/><line x1="2" y1="86" x2="98" y2="86" stroke="#4a4d52" stroke-width="1"/><line x1="2" y1="117" x2="98" y2="117" stroke="#4a4d52" stroke-width="1"/>${bar(45, 20, 45, 70)}${bar(55, 20, 55, 70)}${bar(25, 92, 75, 92)}${bar(25, 123, 75, 123)}`
          : def.id === "freezer-builtin"
          ? `<rect x="14" y="2" width="72" height="146" rx="2" fill="#f4f5f6" ${edge}/><rect x="18" y="6" width="64" height="138" fill="none" stroke="#d3d6d9" stroke-dasharray="2 2"/><path d="M50 68V88M41 73L59 83M41 83L59 73" stroke="#b8c4cc" stroke-width="1.6" stroke-linecap="round"/>`
          : def.id === "fridge-under"
          ? `<rect x="14" y="52" width="72" height="88" rx="2" fill="#f4f5f6" ${edge}/><rect x="18" y="140" width="64" height="8" fill="#1d1f22"/><rect x="18" y="56" width="64" height="80" fill="none" stroke="#d3d6d9" stroke-dasharray="2 2"/>`
          : def.id === "fridge-builtin"
          ? `<rect x="14" y="2" width="72" height="146" rx="2" fill="#f4f5f6" ${edge}/><line x1="14" y1="98" x2="86" y2="98" stroke="#9aa0a5" stroke-width="1"/><rect x="18" y="6" width="64" height="88" fill="none" stroke="#d3d6d9" stroke-dasharray="2 2"/>`
          : def.id === "fridge-american"
            ? `<rect x="2" y="2" width="96" height="146" rx="3" fill="${F}" ${edge}/><line x1="50" y1="2" x2="50" y2="146" stroke="#4a4d52" stroke-width="1"/>${bar(45, 40, 45, 110)}${bar(55, 40, 55, 110)}<rect x="12" y="54" width="22" height="30" rx="2" fill="${G}"/>${glare(12, 54, 22, 30)}`
            : `<rect x="14" y="2" width="72" height="146" rx="3" fill="${F}" ${edge}/><line x1="14" y1="96" x2="86" y2="96" stroke="#4a4d52" stroke-width="1"/>${bar(80, 30, 80, 80)}${bar(80, 104, 80, 130)}`;
      break;
    case "wine": {
      const column = def.id === "wine-column";
      h = column ? 150 : 92;
      const rows = column ? 12 : 5;
      body = `<rect x="14" y="2" width="72" height="${h - 4}" rx="2" fill="${F}" ${edge}/>
        <rect x="20" y="8" width="60" height="${h - 24}" rx="1" fill="${G}"/>
        ${Array.from({ length: rows }, (_, i) => `<line x1="22" y1="${14 + (i * (h - 36)) / rows}" x2="78" y2="${14 + (i * (h - 36)) / rows}" stroke="#a9825a" stroke-width="2"/>`).join("")}
        ${glare(20, 8, 60, h - 24)}${bar(82, h * 0.3, 82, h * 0.7)}<rect x="14" y="${h - 12}" width="72" height="8" fill="#1d1f22"/>`;
      break;
    }
    case "dishwasher":
      h = 92;
      body = def.id === "dryer-free"
        ? `<rect x="6" y="2" width="88" height="88" rx="2" fill="${F}" ${edge}/><rect x="6" y="2" width="88" height="14" fill="${F}" ${edge}/><rect x="10" y="5" width="22" height="8" rx="1" fill="#e8eaec" ${edge}/><circle cx="72" cy="9" r="4" fill="${M}" ${edge}/>
          <circle cx="50" cy="50" r="31" fill="${M}" ${edge}/><circle cx="50" cy="50" r="23" fill="#6f7377"/>${glare(30, 30, 40, 40)}<rect x="14" y="80" width="72" height="8" rx="1" fill="none" stroke="#9aa0a5"/>`
        : def.id.startsWith("washer")
        ? `<rect x="6" y="2" width="88" height="88" rx="2" fill="${def.id === "washer-builtin" ? "#f4f5f6" : F}" ${edge}/><rect x="6" y="2" width="88" height="14" fill="${def.id === "washer-builtin" ? "#d9dcdf" : F}" ${edge}/>
          <rect x="10" y="5" width="20" height="8" rx="1" fill="#e8eaec" ${edge}/><circle cx="72" cy="9" r="4" fill="${M}" ${edge}/><rect x="44" y="6" width="14" height="6" rx="1" fill="#0b0d0f"/>
          <circle cx="50" cy="52" r="28" fill="${M}" ${edge}/><circle cx="50" cy="52" r="21" fill="${G}"/>${glare(32, 34, 36, 36)}`
        : def.id === "dishwasher-builtin"
          ? `<rect x="6" y="2" width="88" height="88" fill="${F}" ${edge}/><rect x="6" y="2" width="88" height="7" fill="#1e2124"/>${[0, 1, 2, 3].map((i) => `<circle cx="${20 + i * 8}" cy="5.5" r="1.2" fill="#7fd3ff"/>`).join("")}`
          : `<rect x="6" y="2" width="88" height="88" rx="2" fill="${F}" ${edge}/><rect x="6" y="2" width="88" height="12" fill="${G}"/><text x="78" y="10" font-size="4.5" fill="#7fd3ff" font-family="monospace">1:45</text>${bar(18, 22, 82, 22)}<rect x="10" y="82" width="80" height="8" fill="#222"/>`;
      break;
    case "sink": {
      h = 62;
      const two = def.id === "sink-steel-2";
      const granite = def.id === "sink-granite";
      const plate = granite ? (finish === "white" ? "#e9e7e2" : "#1f1f21") : F;
      const bowl = granite ? (finish === "white" ? "#d9d6cf" : "#0d0d0e") : B;
      const bowls: [number, number][] = two ? [[6, 44], [52, 90]] : granite ? [[8, 58]] : [[6, 50]];
      body = `<rect x="2" y="2" width="96" height="58" rx="5" fill="${plate}" ${edge}/>
        ${bowls.map(([a, b]) => `<rect x="${a}" y="8" width="${b - a}" height="46" rx="5" fill="${bowl}" stroke="#444" stroke-width=".6"/><circle cx="${(a + b) / 2}" cy="31" r="3.5" fill="${M}" stroke="#555" stroke-width=".5"/>`).join("")}
        ${!two ? Array.from({ length: 7 }, (_, i) => `<line x1="${bowls[0]![1] + 8}" y1="${12 + i * 6.5}" x2="94" y2="${12 + i * 6.5}" stroke="${granite ? "#555" : "#8b9095"}" stroke-width="1.4" stroke-linecap="round"/>`).join("") : ""}`;
      break;
    }
    case "small": {
      const shell = finish === "black" ? "#26282b" : finish === "white" ? "#f3f3f4" : F;
      h = 92;
      body =
        def.id === "kettle"
          ? `<rect x="22" y="80" width="56" height="8" rx="2" fill="#1d1f22"/><path d="M28 80V30Q28 18 50 18Q72 18 72 30V80Z" fill="${shell}" ${edge}/><path d="M72 32H84V72H72" fill="none" stroke="${shell}" stroke-width="6"/><path d="M28 36L14 30" stroke="${shell}" stroke-width="6" stroke-linecap="round"/><rect x="40" y="12" width="20" height="6" rx="2" fill="${M}"/><circle cx="50" cy="70" r="2" fill="#ff5a3c"/>`
          : def.id === "toaster"
            ? `<rect x="10" y="30" width="80" height="54" rx="10" fill="${shell}" ${edge}/><rect x="22" y="30" width="56" height="4" rx="2" fill="#111"/><rect x="88" y="44" width="8" height="6" rx="1" fill="${M}"/>${knob(70, 64, 4)}<rect x="22" y="60" width="10" height="4" rx="1" fill="#8d9297"/><rect x="36" y="60" width="10" height="4" rx="1" fill="#8d9297"/><rect x="10" y="84" width="80" height="4" fill="#1d1f22"/>`
            : def.id === "espresso"
              ? `<rect x="16" y="6" width="68" height="82" rx="3" fill="${shell}" ${edge}/><rect x="18" y="4" width="64" height="3" fill="${M}"/><rect x="24" y="66" width="52" height="22" fill="#1d1f22"/><rect x="26" y="84" width="48" height="3" fill="${M}"/><rect x="42" y="30" width="16" height="10" rx="2" fill="${M}"/><rect x="36" y="40" width="34" height="5" rx="2" fill="#111"/><rect x="42" y="68" width="14" height="14" rx="2" fill="#f4f5f6" ${edge}/><line x1="76" y1="32" x2="76" y2="56" stroke="${M}" stroke-width="2"/>${knob(26, 18, 4)}${knob(74, 18, 4)}<rect x="40" y="14" width="20" height="6" rx="1" fill="#0b0d0f"/>`
              : `<rect x="10" y="80" width="80" height="8" rx="3" fill="${shell}" ${edge}/><rect x="62" y="24" width="20" height="58" rx="4" fill="${shell}" ${edge}/><rect x="18" y="12" width="70" height="22" rx="11" fill="${shell}" ${edge}/><path d="M22 48H62L58 80H26Z" fill="${M}" ${edge}/><line x1="42" y1="34" x2="42" y2="62" stroke="${M}" stroke-width="3"/>`;
      break;
    }
    case "tap": {
      h = 110;
      const metal = finish === "black" ? "#2a2b2d" : finish === "brass" ? F : M;
      const spring = def.id === "tap-pro" ? Array.from({ length: 9 }, (_, i) => `<ellipse cx="62" cy="${40 + i * 6}" rx="7" ry="2" fill="none" stroke="${metal}" stroke-width="1.6"/>`).join("") : "";
      body = `<rect x="52" y="100" width="20" height="6" rx="2" fill="${metal}" stroke="#555" stroke-width=".5"/>
        <path d="M62 100V40 A20 20 0 0 0 22 40 V52" fill="none" stroke="${metal}" stroke-width="7" stroke-linecap="round"/>
        <path d="M62 100V40 A20 20 0 0 0 22 40 V52" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.4" stroke-linecap="round"/>
        ${spring}<path d="M66 70L84 62" stroke="${metal}" stroke-width="4" stroke-linecap="round"/><rect x="56" y="64" width="12" height="12" rx="3" fill="${metal}" stroke="#555" stroke-width=".5"/>`;
      break;
    }
  }
  return `<svg viewBox="0 0 100 ${h}" class="h-20 w-full" role="img" aria-label="${def.name}">${defs}${body}</svg>`;
}
