// Parliamentary Word Watch: everything the page does.
//
// When you press "Chart it":
//   1. getSpeeches   asks Hansard for every speech containing the words
//   2. keepMatches   keeps only those where the words appear together
//   3. getHistories  looks up each speaker's parties and seats, with dates
//   4. drawChart     draws one bar per month, split by party
//   5. showMap       puts each MP's speeches on a map of constituencies
//
// The browser isn't allowed to ask Parliament directly, so every request
// goes to our own server (server.mjs), which passes it on.


// --- Settings ----------------------------------------------------------------

// Party colours. Anything not listed counts as Other.
const COLOURS = {
  Con:    "#0087dc",
  Lab:    "#e4003b",
  LD:     "#faa61a",
  SNP:    "#e6c800",
  Reform: "#12b6cf",
  Green:  "#02a95b",
  CB:     "#8e6bbf",
  Other:  "#9a9a96",
};

// Party names as the Members API gives them, and the short labels we use.
// Anything not listed counts as Other.
const SHORT_NAMES = {
  "Conservative": "Con",
  "Labour": "Lab",
  "Labour (Co-op)": "Lab",
  "Liberal Democrat": "LD",
  "Scottish National Party": "SNP",
  "Reform UK": "Reform",
  "Green Party": "Green",
  "Crossbench": "CB",
};

// The seats were redrawn for the July 2024 election, so there are two maps.
// Each speech goes on the map of the seats in use when it was made.
// Scotland's seats were drawn in 2005 and unchanged in 2010, so the 2010 map
// covers them too. The newest map comes first: it's the one shown when a
// search needs both.
const MAPS = {
  current: {
    file: "/maps/constituencies-2024.hexjson",
    from: "2024-07-04", to: "9999-12-31",
    label: "Seats since 2024",
    which: " on the seats used since July 2024",
    when: "after the July 2024 election",
  },
  old: {
    file: "/maps/constituencies-2010.hexjson",
    from: "2010-05-06", to: "2024-07-04",
    label: "2010–2024 seats",
    which: " on the seats used from 2010 to 2024",
    when: "before the July 2024 election",
  },
};

// Bands for the map's "By how often" view: [lowest count in the band, label]
const COUNT_BANDS = [[1, "1"], [2, "2"], [3, "3–5"], [6, "6–10"], [11, "11+"]];

// One of these fills the search box when the page opens
const SAMPLE_PHRASES = [
  "nuclear submarine", "grey belt", "brexit", "electoral reform", "dodgy dave",
  "hs2", "number ten north", "gaza", "ukraine", "donald trump", "small boats",
  "child poverty", "harry and meghan", "immigration reform", "elon musk",
  "video assistant referee", "iran war", "cost of living", "green energy", "wind farm",
];

// Parliament stops a search at 2,000 speeches, 100 at a time
const PAGE_SIZE = 100;
const MAX_SPEECHES = 2000;

// How many members or links to look up at once, so we don't flood Parliament
const BATCH_SIZE = 20;


// --- Small helpers -----------------------------------------------------------

const tooltip = document.getElementById("tooltip");

function setStatus(message) {
  document.getElementById("status").textContent = message;
}

// Like fetch, but if our server can't be reached at all, say so plainly
// (instead of the browser's "NetworkError" or "Failed to fetch").
async function ask(path) {
  try {
    return await fetch(path);
  } catch (error) {
    throw new Error("Couldn’t reach the server. Check Terminal is still running node server.mjs, and that the address bar says http://localhost:3000.");
  }
}

// Make text safe to put inside HTML (so a stray < in a speech can't break the page)
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// "1 speech", "3 speeches"
function speechCount(n) {
  return n + (n === 1 ? " speech" : " speeches");
}

// Oldest first; within a day, in the order they were said
function inOrder(speeches) {
  return [...speeches].sort((a, b) =>
    a.SittingDate.localeCompare(b.SittingDate) || a.OrderInDebateSection - b.OrderInDebateSection);
}

// The speech text comes with bits of HTML in it. This turns it into
// plain text, and turns codes like &amp; back into &.
function plainText(speech) {
  const html = speech.ContributionTextFull ?? "";
  return new DOMParser().parseFromString(html, "text/html").body.textContent;
}

// A date as the date boxes want it: 2025-03-09
function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

// Is this date inside a spell (of party membership, or holding a seat)?
// Spells have a startDate and an endDate, which is null if it hasn't ended.
function during(spell, date) {
  const started = spell.startDate.slice(0, 10);
  const ended = spell.endDate === null ? null : spell.endDate.slice(0, 10);
  return started <= date && (ended === null || date < ended);
}


// --- Setting up the form -----------------------------------------------------

// A sample phrase, and dates covering the last year
document.getElementById("word").value = SAMPLE_PHRASES[Math.floor(Math.random() * SAMPLE_PHRASES.length)];
const today = new Date();
const yearAgo = new Date();
yearAgo.setFullYear(today.getFullYear() - 1);
document.getElementById("start").value = isoDate(yearAgo);
document.getElementById("end").value = isoDate(today);

// Opened by double-clicking the file? Then there's no server to ask.
if (location.protocol === "file:") {
  setStatus("This page needs its server. In Terminal, in this folder, run node server.mjs, then open http://localhost:3000.");
}


// --- 1. Fetch every speech, 100 at a time ------------------------------------

async function getSpeeches(word, start, end, house) {
  let speeches = [];
  let skip = 0;

  while (true) {
    const settings = new URLSearchParams({
      "queryParameters.searchTerm": word,
      "queryParameters.startDate": start,
      "queryParameters.endDate": end,
      "queryParameters.take": PAGE_SIZE,
      "queryParameters.skip": skip,
    });
    // Only ask for one House if one was chosen. "Both" means leave it out.
    if (house !== "") {
      settings.set("queryParameters.house", house);
    }
    const response = await ask("/api/speeches?" + settings);
    if (response.status === 500) {
      // Parliament's search gives up after about 30 seconds on very common words
      throw new Error("Parliament’s search gave up. The phrase may be too common. Try a more distinctive phrase or a shorter date range.");
    }
    if (!response.ok) {
      throw new Error("the server replied " + response.status);
    }
    const data = await response.json();
    const page = data.Results;
    speeches = speeches.concat(page);
    skip = skip + PAGE_SIZE;
    setStatus("Fetched " + speeches.length + " of " + data.TotalResultCount + "…");
    if (page.length === 0 || skip >= data.TotalResultCount || skip >= MAX_SPEECHES) {
      break;
    }
  }
  return speeches;
}


// --- 2. Keep only speeches with the phrase -----------------------------------
//
// Parliament's search matches the words anywhere in a speech, so
// "grey belt" also finds "grey water ... green belt". This keeps only
// speeches where the words appear together, in order. A hyphen counts
// as a space, so "grey-belt" is kept too.
//
// The phrase can also sit inside longer words, so "wind farm" finds
// "wind farms" and "migration reform" finds "immigration reform".

// Turn "wind farm" into the pattern: any letters, then wind, then spaces
// or hyphens, then farm, then any letters. Taking in the extra letters
// means the whole of "wind farms" gets highlighted, not just "wind farm".
function makePattern(phrase) {
  const words = phrase.trim().split(/\s+/);
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp("\\p{L}*" + escaped.join("[\\s\\-]+") + "\\p{L}*", "iu");
}

function keepMatches(speeches, pattern) {
  return speeches.filter((speech) => pattern.test(plainText(speech)));
}


// --- 3. Look up each speaker's parties and seats -----------------------------
//
// Hansard's names often have no party in them ("Matthew Pennycook"), so
// instead we look each speaker up by their MemberId in Parliament's Members
// API, which lists every party and seat they've had, with dates.

// Remembered between searches, so we only look each member up once:
// { 4520: { parties: [...], seats: [...] } }
const histories = {};

async function getHistories(speeches) {
  // Everyone who spoke and hasn't been looked up yet, each listed once
  const ids = [...new Set(speeches.map((s) => s.MemberId))].filter((id) => !(id in histories));

  for (let i = 0; i < ids.length; i = i + BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (id) => {
      const response = await ask("/api/member?id=" + id);
      if (response.ok) {
        const data = await response.json();
        histories[id] = {
          parties: data.value.partyAffiliations,   // every party, with dates
          seats: data.value.representations,       // every constituency, with dates (none for peers)
        };
      } else {
        histories[id] = { parties: [], seats: [] };   // couldn't find them: they'll count as Other
      }
    }));
    setStatus("Looked up " + Math.min(i + BATCH_SIZE, ids.length) + " of " + ids.length + " speakers…");
  }
}

// Which party was this member in on this date?
function getParty(memberId, date) {
  const spell = (histories[memberId]?.parties ?? []).find((p) => during(p, date));
  return spell ? SHORT_NAMES[spell.name] ?? "Other" : "Other";
}

// Which constituency did this member represent on this date? (null for peers)
function getSeat(memberId, date) {
  const spell = (histories[memberId]?.seats ?? []).find((s) => during(s, date));
  return spell ? spell.name : null;
}

// Which map a speech on this date belongs on: "current", "old", or null (before 2010)
function getMap(date) {
  for (const era in MAPS) {
    if (MAPS[era].from <= date && date < MAPS[era].to) return era;
  }
  return null;
}


// --- 4. Sort the speeches into months ----------------------------------------

// { "2024-12": [speech, speech, ...], "2025-01": [...] }
// Each speech also gets a .party, .seat and .map, so we only work them out once.
function groupByMonth(speeches) {
  const months = {};
  for (const speech of speeches) {
    const date = speech.SittingDate.slice(0, 10);
    speech.party = getParty(speech.MemberId, date);
    speech.seat = getSeat(speech.MemberId, date);
    speech.map = getMap(date);
    const month = date.slice(0, 7);
    if (!(month in months)) {
      months[month] = [];
    }
    months[month].push(speech);
  }
  return months;
}

// How many speeches from each party in a list: { Con: 3, Lab: 5 }
function countParties(speeches) {
  const counts = {};
  for (const speech of speeches) {
    counts[speech.party] = (counts[speech.party] ?? 0) + 1;
  }
  return counts;
}

// Every month from start to end, including the ones nobody spoke in.
// monthRange("2024-11-15", "2025-02-01") -> ["2024-11", "2024-12", "2025-01", "2025-02"]
function monthRange(start, end) {
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const endYear = Number(end.slice(0, 4));
  const endMonth = Number(end.slice(5, 7));
  const months = [];
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(year + "-" + String(month).padStart(2, "0"));
    month = month + 1;
    if (month === 13) {
      month = 1;
      year = year + 1;
    }
  }
  return months;
}

// "2024-12" -> "Dec 2024", or "December 2024" when long is true
function monthLabel(month, long = false) {
  const date = new Date(month + "-01T12:00:00");
  return date.toLocaleDateString("en-GB", { month: long ? "long" : "short", year: "numeric" });
}


// --- 5. Draw the chart -------------------------------------------------------

let latestMonths = {};   // the latest search's speeches by month, for the tooltip and the lists

function drawChart(months, allMonths) {
  latestMonths = months;

  // The key
  let keyHtml = "";
  for (const party in COLOURS) {
    keyHtml += `<span><span class="swatch" style="background:${COLOURS[party]}"></span>${party}</span>`;
  }
  document.getElementById("key").innerHTML = keyHtml;

  // The busiest month sets the full width; every other bar is scaled to it.
  const biggest = Math.max(0, ...Object.values(months).map((list) => list.length));

  // One row per month, including empty ones
  let chartHtml = "";
  for (const month of allMonths) {
    const speeches = months[month] ?? [];
    const counts = countParties(speeches);
    const total = speeches.length;

    if (total === 0) {
      chartHtml += `<div class="row empty"><span class="month">${monthLabel(month)}</span><div class="bar none"></div><span class="total">0</span></div>`;
      continue;
    }

    let segments = "";
    for (const party in COLOURS) {
      const n = counts[party] ?? 0;
      if (n > 0) {
        const width = (n / biggest) * 100;
        segments += `<div class="segment" style="width:${width}%; background:${COLOURS[party]}" data-month="${month}" data-party="${party}"></div>`;
      }
    }
    chartHtml += `<div class="row clickable" data-month="${month}" tabindex="0" role="button" aria-expanded="false"><span class="month">${monthLabel(month)}</span><div class="bar">${segments}</div><span class="total">${total}</span></div>`;
  }
  document.getElementById("chart").innerHTML = chartHtml;
}


// --- 6. The tooltip ----------------------------------------------------------

// Show the tooltip just below-right of the mouse, but keep it on screen
function placeTooltip(event) {
  tooltip.style.display = "block";
  let x = event.clientX + 14;
  let y = event.clientY + 14;
  if (x + tooltip.offsetWidth > window.innerWidth - 8) {
    x = event.clientX - tooltip.offsetWidth - 14;
  }
  if (y + tooltip.offsetHeight > window.innerHeight - 8) {
    y = event.clientY - tooltip.offsetHeight - 14;
  }
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
}

function hideTooltip() {
  tooltip.style.display = "none";
}

// Over a bar: that month's breakdown by party, with the hovered party picked out
document.getElementById("chart").addEventListener("mousemove", (event) => {
  const segment = event.target.closest(".segment");
  if (segment === null) return hideTooltip();

  const month = segment.dataset.month;
  const hovered = segment.dataset.party;
  const counts = countParties(latestMonths[month]);

  let html = `<div class="tip-month">${monthLabel(month, true)}</div>`;
  let total = 0;
  for (const party in COLOURS) {
    const n = counts[party] ?? 0;
    if (n > 0) {
      const current = party === hovered ? " current" : "";
      html += `<div class="tip-row${current}"><span><span class="swatch" style="background:${COLOURS[party]}"></span>${party}</span><span>${n}</span></div>`;
      total = total + n;
    }
  }
  html += `<div class="tip-total"><span>Total</span><span>${total}</span></div>`;
  html += `<div class="tip-hint">Click to read the speeches</div>`;
  tooltip.innerHTML = html;
  placeTooltip(event);
});

document.getElementById("chart").addEventListener("mouseleave", hideTooltip);


// --- 7. Reading the speeches -------------------------------------------------
//
// Clicking a month (or a seat on the map) opens a list of its speeches,
// each with the bit around the phrase and a link to it in Hansard.

let latestPattern = null;   // the phrase pattern from the latest search
const links = {};           // Hansard web links already looked up, by speech ID

// The bit of the speech around the phrase, with the phrase highlighted
function snippet(speech) {
  const text = plainText(speech).replace(/\s+/g, " ");
  const match = latestPattern.exec(text);
  if (match === null) {
    return escapeHtml(text.slice(0, 300)) + "…";
  }
  let from = Math.max(0, match.index - 220);
  let to = Math.min(text.length, match.index + match[0].length + 220);
  // Don't cut words in half
  if (from > 0) from = text.indexOf(" ", from) + 1;
  if (to < text.length) to = text.lastIndexOf(" ", to);

  const before = escapeHtml(text.slice(from, match.index));
  const phrase = escapeHtml(match[0]);
  const after = escapeHtml(text.slice(match.index + match[0].length, to));
  return (from > 0 ? "…" : "") + before + "<mark>" + phrase + "</mark>" + after + (to < text.length ? "…" : "");
}

function speechHtml(speech) {
  const date = new Date(speech.SittingDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const id = speech.ContributionExtId;
  const link = links[id]
    ? `<a class="link" href="${links[id]}" target="_blank" rel="noopener">Read in Hansard ↗</a>`
    : `<a class="link waiting" data-id="${id}">Finding link…</a>`;
  return `
    <div class="speech">
      <div class="who"><span class="swatch" style="background:${COLOURS[speech.party]}"></span>${escapeHtml(speech.MemberName)} <span class="meta">(${speech.party})</span></div>
      <div class="meta">${date} · ${speech.House} · ${escapeHtml(speech.DebateSection.trim())}</div>
      <p class="quote">${snippet(speech)}</p>
      ${link}
    </div>`;
}

// The list's heading and speeches, oldest first
function speechListHtml(heading, speeches) {
  return `<h2>${heading}</h2>` + inOrder(speeches).map(speechHtml).join("");
}

// Ask Hansard for the web address of each speech in a list, a batch at a time,
// and swap each "Finding link…" for the real link as it arrives
async function fillInLinks(panel, speeches) {
  const missing = speeches.filter((s) => !(s.ContributionExtId in links));
  for (let i = 0; i < missing.length; i = i + BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (speech) => {
      const id = speech.ContributionExtId;
      try {
        const response = await ask("/api/link?id=" + id);
        if (response.ok) {
          const path = await response.json();   // like "/Commons/2024-12-12/debates/..."
          links[id] = "https://hansard.parliament.uk" + path;
        }
      } catch (error) {
        // Leave it: the link will say it couldn't be found
      }
      const a = panel.querySelector(`[data-id="${id}"]`);
      if (a === null) return;
      if (links[id]) {
        a.href = links[id];
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "Read in Hansard ↗";
        a.classList.remove("waiting");
      } else {
        a.textContent = "Couldn’t find the link";
      }
    }));
  }
}

// Open a month's speeches under its bar, or close them if they're already open
function toggleMonth(row) {
  const month = row.dataset.month;
  const alreadyOpen = row.classList.contains("open");

  // Close whatever is open
  for (const panel of document.querySelectorAll("#chart .details")) panel.remove();
  for (const open of document.querySelectorAll(".row.open")) {
    open.classList.remove("open");
    open.setAttribute("aria-expanded", "false");
  }
  if (alreadyOpen) return;

  const speeches = latestMonths[month];
  const panel = document.createElement("div");
  panel.className = "details";
  panel.innerHTML = speechListHtml(`${monthLabel(month, true)}: ${speechCount(speeches.length)}`, speeches);
  row.after(panel);
  row.classList.add("open");
  row.setAttribute("aria-expanded", "true");
  fillInLinks(panel, speeches);
}

document.getElementById("chart").addEventListener("click", (event) => {
  const row = event.target.closest(".row.clickable");
  if (row !== null) {
    hideTooltip();
    toggleMonth(row);
  }
});

// Keyboard: Enter or Space on a focused month opens it too
document.getElementById("chart").addEventListener("keydown", (event) => {
  const row = event.target.closest(".row.clickable");
  if (row !== null && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    toggleMonth(row);
  }
});


// --- 8. The constituency map -------------------------------------------------
//
// Each map file has one hexagon per constituency:
//   "E14001063": { "n": "Greenwich and Woolwich", "q": 66, "r": -40 }
// n is the name; q is the column and r the row (higher r is further north).

const hexMaps = {};        // each map, loaded once: { current: { hexes, names }, old: ... }
let hexes = null;          // the hexagons of the map on screen
let shownMap = "current";  // which map is on screen: "current" or "old"
let mapSpeeches = [];      // the latest search's speeches
let seatData = {};         // { "Greenwich and Woolwich": { speeches: [...], mps: [...], party: "Lab" } }
let mapView = "party";     // "party" or "count"
let pickedSeat = null;     // the seat whose speeches are open, if any

// Which band (1 to 5) a count falls in
function band(n) {
  let result = 0;
  for (let i = 0; i < COUNT_BANDS.length; i++) {
    if (n >= COUNT_BANDS[i][0]) result = i + 1;
  }
  return result;
}

// Seat names are written slightly differently in different places
// ("Brighton, Kemptown", "Ynys Môn"), so compare them in a plain form:
// "Brighton, Kemptown" -> "brighton kemptown", "Ynys Môn" -> "ynys mon"
function plainName(name) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

async function loadHexes(era) {
  if (era in hexMaps) return;
  const response = await ask(MAPS[era].file);
  if (!response.ok) {
    throw new Error("couldn’t load " + MAPS[era].file.slice(1));
  }
  const map = (await response.json()).hexes;
  // So a seat's hexagon can be found from the plain form of its name
  const names = {};
  for (const code in map) {
    names[plainName(map[code].n)] = map[code].n;
  }
  hexMaps[era] = { hexes: map, names: names };
}

// Find each MP's seat on its map. Sets speech.hex to the seat's name as
// the map spells it, or null if it isn't on a map.
function findHexes(speeches) {
  const notFound = new Set();
  for (const speech of speeches) {
    speech.hex = null;
    if (speech.seat === null || speech.map === null) continue;   // peers, and speeches before 2010
    speech.hex = hexMaps[speech.map]?.names[plainName(speech.seat)] ?? null;
    if (speech.hex === null) notFound.add(speech.seat);
  }
  if (notFound.size > 0) {
    // Seats that Parliament names differently from the map. Shows in the browser's console.
    console.warn("Seats not found on the map:", [...notFound]);
  }
}

// Group one map's speeches by the constituency the speaker represented at the time
function groupBySeat(speeches, era) {
  const seats = {};
  for (const speech of speeches) {
    if (speech.map !== era || speech.hex === null) continue;
    const name = speech.hex;
    if (!(name in seats)) {
      seats[name] = { speeches: [], mps: [] };
    }
    seats[name].speeches.push(speech);
    if (!seats[name].mps.includes(speech.MemberName)) {
      seats[name].mps.push(speech.MemberName);
    }
  }
  // Colour each seat by the party of its most recent speech
  // (so an MP who defected shows in their new party)
  for (const name in seats) {
    const list = inOrder(seats[name].speeches);
    seats[name].party = list[list.length - 1].party;
  }
  return seats;
}

// Start a new search's map: work out which maps the dates need, and explain
// what the map leaves out
async function showMap(speeches, start, end) {
  const range = document.getElementById("map-range");

  // Dates entirely before 2010: neither map covers them, so show no map
  const noMap = end < MAPS.old.from;
  document.getElementById("map-lede").hidden = noMap;
  document.getElementById("map-body").hidden = noMap;
  document.getElementById("map-section").hidden = false;
  if (noMap) {
    range.textContent = "The map only goes back to the May 2010 election, so it can’t show these dates. I’m working on extending it further back.";
    return;
  }

  // Which maps the dates cover: one, or both if they span the July 2024 election
  const needed = Object.keys(MAPS).filter((era) => start < MAPS[era].to && end >= MAPS[era].from);
  for (const era of needed) await loadHexes(era);

  mapSpeeches = speeches;
  findHexes(speeches);

  // Explain which dates the map leaves out
  const notes = [];
  if (start < MAPS.old.from) {
    notes.push("Speeches from before the May 2010 election aren’t on the map.");
  }
  if (needed.length > 1) {
    notes.push("The seats were redrawn at the July 2024 election, so speeches before and after it are on separate maps. Use the switch to move between them.");
  }
  range.textContent = notes.join(" ");

  // The switch between the two maps appears when the dates span the July 2024 election
  const toggle = document.getElementById("era-toggle");
  toggle.hidden = needed.length < 2;
  for (const button of toggle.querySelectorAll("button")) {
    const era = button.dataset.map;
    const n = speeches.filter((s) => s.map === era && s.hex !== null).length;
    button.textContent = MAPS[era].label + " (" + n + ")";
  }

  // Start on the newest map with speeches on it
  const first = needed.find((era) => speeches.some((s) => s.map === era && s.hex !== null)) ?? needed[0];
  pickMap(first);
}

// Put one of the two maps on screen
function pickMap(era) {
  shownMap = era;
  hexes = hexMaps[era].hexes;
  seatData = groupBySeat(mapSpeeches, era);
  pickedSeat = null;
  document.getElementById("seat-details").innerHTML = "";
  document.getElementById("map-which").textContent = MAPS[era].which;
  for (const button of document.querySelectorAll("#era-toggle button")) {
    button.setAttribute("aria-pressed", button.dataset.map === era ? "true" : "false");
  }
  drawMap();
  drawTopSeats();
  drawMapNote(mapSpeeches);
}

function drawMap() {
  // Pointy-topped hexagons in rows, with every odd row nudged half a
  // hexagon to the right
  const size = 10;
  const w = Math.sqrt(3) * size;   // width of one hexagon
  const all = Object.values(hexes);
  const qMin = Math.min(...all.map((h) => h.q));
  const qMax = Math.max(...all.map((h) => h.q));
  const rMin = Math.min(...all.map((h) => h.r));
  const rMax = Math.max(...all.map((h) => h.r));
  const width = (qMax - qMin + 1.5) * w;
  const height = (rMax - rMin) * 1.5 * size + 2 * size;

  let shapes = "";
  for (const hex of all) {
    const odd = (hex.r & 1) === 1;
    const cx = (hex.q - qMin) * w + (odd ? w / 2 : 0) + w / 2;
    const cy = (rMax - hex.r) * 1.5 * size + size;

    // The six corners, starting top-right and going round
    const corners = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      corners.push((cx + size * Math.cos(angle)).toFixed(1) + "," + (cy + size * Math.sin(angle)).toFixed(1));
    }

    const seat = seatData[hex.n];
    let classes = "zero";
    let style = "";
    if (seat) {
      classes = "said";
      if (mapView === "party") {
        style = ` style="fill:${COLOURS[seat.party]}"`;
      } else {
        classes += " r" + band(seat.speeches.length);
      }
    }
    if (hex.n === pickedSeat) classes += " picked";
    shapes += `<polygon points="${corners.join(" ")}" class="${classes}" data-seat="${escapeHtml(hex.n)}"${style}></polygon>`;
  }

  const saidCount = Object.keys(seatData).length;
  document.getElementById("hexmap").innerHTML =
    `<svg viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" role="img" aria-label="Hex map of the ${all.length} constituencies${MAPS[shownMap].which}. ${saidCount} are filled in because their MP used the phrase. The list alongside gives the top seats.">${shapes}</svg>`;

  // Bring the picked seat to the front so its outline isn't hidden by its neighbours
  const picked = document.querySelector("#hexmap polygon.picked");
  if (picked) picked.parentNode.appendChild(picked);

  drawMapKey();
}

function drawMapKey() {
  let html = "";
  if (mapView === "party") {
    // Only the parties that actually appear on the map
    const present = new Set(Object.values(seatData).map((s) => s.party));
    for (const party in COLOURS) {
      if (present.has(party)) {
        html += `<span><span class="swatch" style="background:${COLOURS[party]}"></span>${party}</span>`;
      }
    }
  } else {
    COUNT_BANDS.forEach(([, label], i) => {
      html += `<span><span class="swatch" style="background:var(--r${i + 1})"></span>${label}</span>`;
    });
  }
  html += `<span><span class="swatch" style="background:var(--zero)"></span>Didn’t say it</span>`;
  document.getElementById("map-key").innerHTML = html;
}

// The ten seats whose MPs said it most. Doubles as a way in for anyone
// who can't use the map, since each one opens that seat's speeches.
function drawTopSeats() {
  const ranked = Object.entries(seatData).sort((a, b) => b[1].speeches.length - a[1].speeches.length).slice(0, 10);
  let html = "";
  for (const [name, seat] of ranked) {
    html += `
      <li><button type="button" data-seat="${escapeHtml(name)}">
        <span class="swatch" style="background:${COLOURS[seat.party]}"></span>
        <span class="seat-name">${escapeHtml(name)}<span class="seat-mp">${escapeHtml(seat.mps.join(", "))} (${seat.party})</span></span>
        <span class="seat-count">${seat.speeches.length}</span>
      </button></li>`;
  }
  document.getElementById("top-seats").innerHTML = html || `<li class="map-note">No MPs used it in this period.</li>`;
}

// Say which speeches aren't on the map on screen, and why
function drawMapNote(speeches) {
  const commons = speeches.filter((s) => s.House === "Commons");
  const peers = speeches.length - commons.length;
  const otherMap = commons.filter((s) => s.map !== shownMap && s.hex !== null);
  const before2010 = commons.filter((s) => s.map === null).length;
  const unmatched = commons.filter((s) => s.map !== null && s.hex === null).length;
  const parts = [];
  if (otherMap.length > 0) parts.push(`${otherMap.length} from ${MAPS[otherMap[0].map].when}, on the other map`);
  if (peers > 0) parts.push(`${peers} by peers, who don’t have constituencies`);
  if (before2010 > 0) parts.push(`${before2010} from before the May 2010 election`);
  if (unmatched > 0) parts.push(`${unmatched} whose speaker couldn’t be matched to a seat`);
  document.getElementById("map-note").textContent = parts.length > 0 ? "Not on this map: " + parts.join("; ") + "." : "";
}

// Open (or close) the list of speeches for one seat
function showSeat(name) {
  const details = document.getElementById("seat-details");
  if (pickedSeat === name) {
    pickedSeat = null;
    details.innerHTML = "";
  } else {
    pickedSeat = name;
    const seat = seatData[name];
    const heading = `${escapeHtml(name)}: ${escapeHtml(seat.mps.join(", "))} (${seat.party}), ${speechCount(seat.speeches.length)}`;
    details.innerHTML = `<div class="details">${speechListHtml(heading, seat.speeches)}</div>`;
    fillInLinks(details, seat.speeches);
    details.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  drawMap();
  for (const button of document.querySelectorAll("#top-seats button")) {
    button.classList.toggle("picked", button.dataset.seat === pickedSeat);
  }
}

// Over a hexagon: the seat, its MP and how often they said it
const hexmap = document.getElementById("hexmap");

hexmap.addEventListener("mousemove", (event) => {
  const shape = event.target.closest("polygon");
  if (shape === null) return hideTooltip();

  const name = shape.dataset.seat;
  const seat = seatData[name];
  let html = `<div class="tip-month">${escapeHtml(name)}</div>`;
  if (seat) {
    html += `<div class="tip-row current"><span><span class="swatch" style="background:${COLOURS[seat.party]}"></span>${escapeHtml(seat.mps.join(", "))}</span><span>${seat.party}</span></div>`;
    html += `<div class="tip-total"><span>Speeches</span><span>${seat.speeches.length}</span></div>`;
    html += `<div class="tip-hint">Click to read them</div>`;
    // Lift it to the front so its hover outline shows in full
    shape.parentNode.appendChild(shape);
  } else {
    html += `<div class="tip-row"><span>Their MP didn’t say it in this period</span></div>`;
  }
  tooltip.innerHTML = html;
  placeTooltip(event);
});

hexmap.addEventListener("mouseleave", hideTooltip);

hexmap.addEventListener("click", (event) => {
  const shape = event.target.closest("polygon.said");
  if (shape !== null) {
    hideTooltip();
    showSeat(shape.dataset.seat);
  }
});

document.getElementById("top-seats").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button !== null) showSeat(button.dataset.seat);
});

// The 2010–2024 / since 2024 switch
document.getElementById("era-toggle").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button !== null) pickMap(button.dataset.map);
});

// The By party / By how often switch
document.getElementById("view-toggle").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button === null) return;
  mapView = button.dataset.view;
  for (const b of document.querySelectorAll("#view-toggle button")) {
    b.setAttribute("aria-pressed", b === button ? "true" : "false");
  }
  drawMap();
});


// --- 9. Run a search when "Chart it" is pressed ------------------------------

document.getElementById("search").addEventListener("submit", async (event) => {
  event.preventDefault();   // stop the page reloading
  const button = event.target.querySelector("button");
  const word = document.getElementById("word").value;
  const start = document.getElementById("start").value;
  const end = document.getElementById("end").value;
  const house = document.getElementById("house").value;

  button.disabled = true;
  try {
    setStatus("Searching Hansard… (more common words can take a little while)");
    const found = await getSpeeches(word, start, end, house);
    latestPattern = makePattern(word);
    const speeches = keepMatches(found, latestPattern);
    const dropped = found.length - speeches.length;
    await getHistories(speeches);
    drawChart(groupByMonth(speeches), monthRange(start, end));

    const where = house === "" ? "Parliament" : "the " + house;
    let message = speechCount(speeches.length) + " in " + where + (speeches.length === 1 ? " says" : " say") + " “" + word + "”.";
    if (dropped > 0) {
      message += " (" + dropped + " more included the words but not together, so they’re left out.)";
    }
    message += " Click a month to read them.";
    setStatus(message);

    // The map is extra: if it can't load, keep the chart and say why
    try {
      await showMap(speeches, start, end);
    } catch (error) {
      document.getElementById("map-section").hidden = true;
      setStatus(message + " (The map didn’t load: " + error.message + ".)");
    }
  } catch (error) {
    setStatus("Something went wrong: " + error.message);
  }
  button.disabled = false;
});
