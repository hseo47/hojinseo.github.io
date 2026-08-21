const fs = require("node:fs");
const path = require("node:path");
const d3 = require("d3-geo");
const topojson = require("topojson-client");

const outputPath = path.resolve(__dirname, "..", "conference-map.svg");
const sourceUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

async function generate() {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Map source returned HTTP ${response.status}`);

  const world = await response.json();
  const countries = topojson.feature(world, world.objects.countries);
  const coast = topojson.mesh(
    world,
    world.objects.countries,
    (featureA, featureB) => featureA === featureB,
  );
  const projection = d3.geoEquirectangular()
    .rotate([-190, 0])
    .scale(290)
    .translate([480, 362])
    .clipExtent([[0, 0], [960, 420]]);
  const geoPath = d3.geoPath(projection);
  const graticule = d3.geoGraticule10();

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 420" role="img" aria-labelledby="map-title map-description">',
    '  <title id="map-title">Conference locations across the northern Pacific</title>',
    '  <desc id="map-description">Natural Earth country geography cropped from East Asia through the eastern United States and Mexico.</desc>',
    '  <!-- Natural Earth public-domain geography via World Atlas 2 -->',
    '  <style>.conference-map-grid{fill:none;stroke:#ededed;stroke-width:.7}.conference-map-land{fill:#e7e7e7;stroke:#fff;stroke-width:.6}.conference-map-coast{fill:none;stroke:#aaa;stroke-width:.8}</style>',
    `  <path class="conference-map-grid" d="${geoPath(graticule)}"/>`,
    `  <path class="conference-map-land" d="${geoPath(countries)}"/>`,
    `  <path class="conference-map-coast" d="${geoPath(coast)}"/>`,
    '</svg>',
    '',
  ].join("\n");

  fs.writeFileSync(outputPath, svg, "utf8");
}

generate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
