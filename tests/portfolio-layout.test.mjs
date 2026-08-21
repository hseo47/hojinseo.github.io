import assert from "node:assert/strict";
import vm from "node:vm";

const baseUrl = process.env.PORTFOLIO_URL ?? "http://localhost:8000";
const [pageResponse, cssResponse] = await Promise.all([
  fetch(`${baseUrl}/`),
  fetch(`${baseUrl}/style.css`),
]);

assert.equal(pageResponse.ok, true, "portfolio page should be served");
assert.equal(cssResponse.ok, true, "portfolio stylesheet should be served");

const mapResponse = await fetch(`${baseUrl}/conference-map.svg`);
assert.equal(mapResponse.ok, true, "the local conference basemap should be served");
const mapSvg = await mapResponse.text();
assert.match(mapSvg, /<svg[^>]*viewBox="0 0 960 420"/);
assert.match(mapSvg, /class="conference-map-grid"/);
assert.match(mapSvg, /class="conference-map-land"/);
assert.match(mapSvg, /class="conference-map-coast"/);
assert.match(mapSvg, /\.conference-map-land\{fill:#e7e7e7;stroke:#fff/);
assert.match(mapSvg, /Natural Earth/);

const html = await pageResponse.text();
const css = await cssResponse.text();

assert.match(
  html,
  /<link rel="stylesheet" href="style\.css\?v=20260821-7">/,
  "the page should request a versioned stylesheet so layout updates bypass stale browser caches",
);
assert.match(
  html,
  /<meta name="viewport" content="width=device-width, initial-scale=1">/,
  "mobile browsers should use the device-width layout viewport",
);

assert.doesNotMatch(
  html,
  /under construction|stay tuned/i,
  "the public page should not display construction messaging",
);

assert.doesNotMatch(html, /<header>/, "the page should not render a separate name header");
assert.match(
  html,
  /<img src="Headshot\.png" alt="Hojin Seo" class="headshot">\s*<h1 class="profile-name">Hojin Seo<\/h1>/,
  "the name should appear directly beneath the headshot",
);
assert.match(
  css,
  /\.profile-name\s*\{[^}]*text-align:\s*center[^}]*margin:\s*0 0 1\.5rem/s,
  "the name beneath the headshot should remain centered",
);

assert.doesNotMatch(
  html,
  /Recent Projects|Past Projects/,
  "projects should not be split into current and past categories",
);
assert.match(html, /<div class="project-label">Projects:<\/div>/);
assert.equal(
  [...html.matchAll(/<div class="project-list">/g)].length,
  1,
  "all projects should share one continuous list",
);
assert.match(html, /<div class="project-label" id="conferences-heading">Conferences:<\/div>/);
assert.match(html, /<img src="conference-map\.svg"/);
const conferencePins = [...html.matchAll(/<button type="button" class="conference-pin[^>]*data-city="([^"]+)"/g)];
assert.deepEqual(
  conferencePins.map((match) => match[1]),
  ["Chicago", "Jeju", "Atlanta", "Busan", "Guadalajara", "Tokyo"],
);
assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
const projectsSectionEnd = html.indexOf("</section>\n\n    <section class=\"conference-section\"");
const conferenceSectionStart = html.indexOf('<section class="conference-section" aria-labelledby="conferences-heading">');
const socialIconsStart = html.indexOf('<div class="social-icons">');
const footerStart = html.indexOf('<footer>');
assert.ok(projectsSectionEnd !== -1, "the conference section should follow the projects section");
assert.ok(conferenceSectionStart !== -1, "the conference section should be present");
assert.ok(socialIconsStart !== -1, "the social icons block should be present");
assert.ok(footerStart !== -1, "the footer should be present");
assert.ok(projectsSectionEnd < conferenceSectionStart, "the conference section should come after the projects section");
assert.ok(conferenceSectionStart < socialIconsStart, "the conference section should appear before the social icons");
assert.ok(conferenceSectionStart < footerStart, "the conference section should appear before the footer");
assert.doesNotMatch(html, /Conference Map · Shanghai to Atlanta|A tighter real-world crop/);
assert.doesNotMatch(html, /maps\.google|mapbox|openstreetmap|world-atlas@2/);
assert.doesNotMatch(html, /<legend\b/i);
assert.doesNotMatch(html, /\bzoom\b|\bfilter\b/i);
assert.equal((html.match(/<div class="conference-list">/g) ?? []).length, 0, "the conference section should not duplicate list markup");
assert.match(html, /function selectConferencePin\(pin\)/);
assert.match(html, /pin\.setAttribute\("aria-pressed", "true"\)/);
assert.match(html, /conference-title/);
assert.match(html, /conference-award/);
assert.match(html, /querySelectorAll\("\.conference-pin"\)/);

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function parseAttributes(source) {
  return Object.fromEntries(
    [...source.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [
      match[1],
      decodeHtml(match[2]),
    ]),
  );
}

class TestClassList {
  constructor(value = "") {
    this.values = new Set(value.split(/\s+/).filter(Boolean));
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  toggle(value, force) {
    if (force === undefined ? !this.values.has(value) : force) {
      this.values.add(value);
      return true;
    }
    this.values.delete(value);
    return false;
  }

  contains(value) {
    return this.values.has(value);
  }
}

class TestElement {
  constructor(attributes = {}) {
    this.attributes = new Map(Object.entries(attributes));
    this.classList = new TestClassList(attributes.class);
    this.dataset = Object.fromEntries(
      Object.entries(attributes)
        .filter(([name]) => name.startsWith("data-"))
        .map(([name, value]) => [name.slice(5), value]),
    );
    this.inlineStyle = attributes.style ?? "";
    this.listeners = new Map();
    this.style = {};
    this.textContent = "";
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  click() {
    this.listeners.get("click")?.();
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

const pinElements = [...html.matchAll(/<button\b([^>]*)>\s*<span>([^<]+)<\/span><\/button>/g)]
  .filter((match) => match[1].includes("conference-pin"))
  .map((match) => new TestElement(parseAttributes(match[1])));

const detailIds = [
  "conference-type",
  "conference-date",
  "conference-title",
  "conference-event",
  "conference-location",
  "conference-award",
];
const elementsById = new Map(detailIds.map((id) => [id, new TestElement({ id })]));
for (let index = 1; index <= 6; index += 1) {
  const id = index === 1 ? "projectModal" : `projectModal${index}`;
  elementsById.set(id, new TestElement({ id, class: "modal" }));
}

const documentHarness = {
  body: new TestElement(),
  getElementById(id) {
    return elementsById.get(id) ?? null;
  },
  querySelectorAll(selector) {
    return selector === ".conference-pin" ? pinElements : [];
  },
};
const windowHarness = {};
const scriptSource = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(scriptSource, "the page controller script should be present");
const controllerContext = { document: documentHarness, window: windowHarness };
vm.runInNewContext(scriptSource, controllerContext);

const expectedConferenceDetails = {
  Chicago: [
    "Oral",
    "Aug 2026",
    "Enable Flexible Chitosan Films via Hydro-Softening",
    "ACS Fall Meeting",
    "Chicago, USA",
    "",
  ],
  Jeju: [
    "Oral",
    "Nov 2024",
    "Dynamic Substrate-Driven Reconfiguration of Polymers",
    "2024 Korean Society of Biomaterials Fall Meeting & Symposium",
    "Jeju, South Korea",
    "Outstanding Paper Award.",
  ],
  Atlanta: [
    "Poster",
    "Sep 2024",
    "Dynamic Reconfiguration of Antimicrobial Agents in Phase Transition",
    "The 22nd International Society of Coating Science and Technology Symposium",
    "Atlanta, USA",
    "",
  ],
  Busan: [
    "Poster",
    "May 2023",
    "Geometry-Optimized, All-Printed, Graphene Thin-Film Wearable Bio-Patch for Early Detection of Post-Surgical Hypertrophic Scars",
    "33rd Anniversary World Congress on Biosensors",
    "Busan, South Korea",
    "",
  ],
  Guadalajara: [
    "Oral",
    "Nov 2021",
    "Inverse Kinematics of a Parallel Mechanism with an Offset Structural Design for Prosthetic Wrist Motions",
    "Annual International Conference of the IEEE Engineering in Medicine and Biology Society",
    "Guadalajara, Mexico",
    "",
  ],
  Tokyo: [
    "Oral",
    "Nov 2020",
    "Quasi-Static Analysis of Transoral Surgical Tendon-Driven Articulated Robot Units",
    "Asian Conference on Computer Aided Surgery (ACCAS)",
    "Tokyo, Japan",
    "",
  ],
};

for (const pin of pinElements) {
  pin.click();
  assert.equal(
    pinElements.filter((candidate) => candidate.getAttribute("aria-pressed") === "true").length,
    1,
    `selecting ${pin.dataset.city} should leave exactly one pressed pin`,
  );
  assert.equal(pin.classList.contains("is-selected"), true);
  assert.deepEqual(
    detailIds.map((id) => elementsById.get(id).textContent),
    expectedConferenceDetails[pin.dataset.city],
    `selecting ${pin.dataset.city} should render all of its detail fields`,
  );
}

controllerContext.openModal4();
assert.equal(elementsById.get("projectModal4").style.display, "grid");
assert.equal(documentHarness.body.style.overflow, "hidden");
controllerContext.closeModal4();
assert.equal(elementsById.get("projectModal4").style.display, "none");
assert.equal(documentHarness.body.style.overflow, "");
controllerContext.openModal();
windowHarness.onclick({ target: elementsById.get("projectModal") });
assert.equal(elementsById.get("projectModal").style.display, "none");
assert.equal(documentHarness.body.style.overflow, "");

function customProperties(style) {
  return Object.fromEntries(
    style.split(";")
      .map((declaration) => declaration.split(":").map((part) => part.trim()))
      .filter(([name, value]) => name?.startsWith("--") && value),
  );
}

function numericProperty(properties, name, unit, fallback = 0) {
  const value = properties[name];
  if (value === undefined) return fallback;
  assert.ok(value.endsWith(unit), `${name} should use ${unit}`);
  return Number.parseFloat(value);
}

const pinGeometry = pinElements.map((pin) => ({
  city: pin.dataset.city,
  properties: customProperties(pin.inlineStyle),
}));
const chicagoGeometry = pinGeometry.find(({ city }) => city === "Chicago").properties;
const jejuGeometry = pinGeometry.find(({ city }) => city === "Jeju").properties;
const busanGeometry = pinGeometry.find(({ city }) => city === "Busan").properties;
assert.equal(chicagoGeometry["--pin-x"], "93.43%", "Chicago's geographic anchor should remain unchanged");
assert.equal(chicagoGeometry["--pin-y"], "35.73%", "Chicago's geographic anchor should remain unchanged");
assert.equal(jejuGeometry["--pin-x"], "16.54%", "Jeju's geographic anchor should remain unchanged");
assert.equal(jejuGeometry["--pin-y"], "45.82%", "Jeju's geographic anchor should remain unchanged");
assert.equal(busanGeometry["--pin-x"], "17.87%", "Busan's geographic anchor should remain unchanged");
assert.equal(busanGeometry["--pin-y"], "43.80%", "Busan's geographic anchor should remain unchanged");

for (const viewportWidth of [1024, 736, 600, 360]) {
  const stageWidth = Math.min(720, viewportWidth - 64);
  const stageHeight = stageWidth * 420 / 960;
  const targets = pinGeometry.map(({ city, properties }) => ({
    city,
    x: stageWidth * numericProperty(properties, "--pin-x", "%") / 100
      + numericProperty(properties, "--pin-offset-x", "px"),
    y: stageHeight * numericProperty(properties, "--pin-y", "%") / 100
      + numericProperty(properties, "--pin-offset-y", "px"),
  }));

  for (let leftIndex = 0; leftIndex < targets.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < targets.length; rightIndex += 1) {
      const left = targets[leftIndex];
      const right = targets[rightIndex];
      const centerDistance = Math.hypot(left.x - right.x, left.y - right.y);
      assert.ok(centerDistance >= 32, `${left.city} and ${right.city} targets should not overlap at ${viewportWidth}px`);
    }
  }
}

assert.equal(pinElements.find((pin) => pin.dataset.city === "Atlanta").classList.contains("pin-label-left"), true);
assert.equal(pinElements.find((pin) => pin.dataset.city === "Chicago").classList.contains("pin-label-left"), true);
assert.equal(pinElements.find((pin) => pin.dataset.city === "Guadalajara").classList.contains("pin-label-left"), true);
assert.match(css, /\.conference-pin-offset::before\s*\{[^}]*pointer-events:\s*none/s);
assert.match(css, /\.conference-pin-offset::after\s*\{[^}]*background:\s*#cc0066[^}]*pointer-events:\s*none/s);

const projectRows = [...html.matchAll(/<article class="project-row" onclick="(openModal\d*\(\))">/g)];
assert.equal(projectRows.length, 6, "all six projects should render as full-width rows");
assert.deepEqual(
  projectRows.map((match) => match[1]),
  ["openModal4()", "openModal5()", "openModal6()", "openModal3()", "openModal()", "openModal2()"],
  "project rows should remain clickable and ordered newest-first",
);
assert.doesNotMatch(
  html,
  /AQUA|openModal7|projectModal7/,
  "AQUA should not be rendered or registered as an interactive project",
);

assert.match(
  html,
  /function showProjectModal\(id\) \{[^}]*style\.display = "grid";[^}]*document\.body\.style\.overflow = "hidden";/s,
  "project modals should open in a centered viewport grid and lock background scrolling",
);
assert.match(
  html,
  /function hideProjectModal\(id\) \{[^}]*style\.display = "none";[^}]*document\.body\.style\.overflow = "";/s,
  "closing a project modal should restore background scrolling",
);
assert.match(
  css,
  /\.modal\s*\{[^}]*inset:\s*0[^}]*padding:\s*1rem[^}]*overflow:\s*hidden/s,
  "the modal overlay should remain bounded to the viewport",
);
assert.match(
  css,
  /\.modal-content\s*\{[^}]*max-height:\s*calc\(100dvh - 2rem\)[^}]*overflow-y:\s*auto[^}]*box-sizing:\s*border-box/s,
  "long modal content should scroll inside the visible viewport",
);
assert.match(
  css,
  /\.close-button\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/s,
  "the modal close control should remain visible while content scrolls",
);

assert.match(
  css,
  /\.project-row\s*\{[^}]*grid-template-columns:\s*210px 1fr[^}]*gap:\s*1\.5rem[^}]*padding:\s*0/s,
  "each project should use separate fixed-image and wide-content columns",
);

assert.match(
  css,
  /\.project-row:not\(:last-child\)\s*\{[^}]*border-bottom:\s*2px solid #cc0066/s,
  "full-width purple rules should divide project rows",
);

assert.match(
  css,
  /\.project-row-media,\s*\.project-row-copy\s*\{[^}]*border:\s*1px solid #d8d8d8/s,
  "the image and content should be separate neutral panels",
);

assert.match(
  css,
  /\.project-row-link\s*\{[^}]*position:\s*absolute[^}]*top:\s*1\.5rem[^}]*right:\s*1\.5rem/s,
  "read more should sit at the content panel's upper-right",
);

assert.match(css, /\.conference-map-stage\s*\{[^}]*position:\s*relative/s);
assert.match(css, /\.conference-map-image\s*\{[^}]*width:\s*100%/s);
assert.match(css, /\.conference-pin\s*\{[^}]*min-width:\s*32px[^}]*min-height:\s*32px/s);
assert.match(css, /left:\s*var\(--pin-x\)/);
assert.match(css, /top:\s*var\(--pin-y\)/);
assert.match(css, /\.conference-pin\[aria-pressed="true"\]/);
assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.conference-detail\s*\{[^}]*grid-template-columns:\s*1fr/s);
