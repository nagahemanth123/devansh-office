// Builds js/data/catalog.js and assets/products/** from the real catalogue
// (FoxCut-packs) plus Victura and Poddar Pipes. Run: node tools/build-catalog.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS = join(homedir(), 'FoxCut-packs/devansh-marketing');
const POSTERS = join(homedir(), 'Downloads/devansh-awareness-posters/assets');
const MAX_PX = 400;
const DEFAULT_GST = 18;

// Brand colours were sampled from the logos in assets/brands (largest saturated
// area). Sentini's logo is white-only, so its colour comes from its product photos.
const BRANDS = [
  { key: 'parryware', name: 'Parryware', colour: '#049DCE' },
  { key: 'finolex', name: 'Finolex', colour: '#1D94D1' },
  { key: 'ultravolt', name: 'Ultravolt', colour: '#00DC7A' },
  { key: 'goldmedal', name: 'Goldmedal', colour: '#EE1922' },
  { key: 'kenstar', name: 'Kenstar', colour: '#CF202B' },
  { key: 'sparsh-pearl', name: 'Sparsh Pearl', colour: '#C8A255' },
  { key: 'poddar', name: 'Poddar Pipes', colour: '#F38000' },
  { key: 'sentini', name: 'Sentini Flopipes', colour: '#0274B8' },
  { key: 'victura', name: 'Victura Airmotion', colour: '#DF1F26' },
  { key: 'acebond', name: 'Acebond', colour: '#065A87' },
].map((b) => ({ ...b, logo: `assets/brands/${b.key}.webp` }));

// GST % is sample data. 18% unless listed here (agricultural pipe is taxed lower).
const GST_BY_CATEGORY = { 'Agri pipes': 12 };

// Sample MRP ranges [low, high] for catalogue lines with no printed price.
// Every unpriced product must match a rule, otherwise the build fails.
const SAMPLE_RANGES = {
  'acebond|Tile adhesives': [350, 1200],
  'acebond|Epoxy grouts': [900, 3200],
  'acebond|Cementitious grouts': [450, 1100],
  'acebond|Mortars and screeds': [380, 720],
  'acebond|Waterproofing': [650, 3400],
  'goldmedal|Ceiling fans': [2400, 4800],
  'goldmedal|Personal fans': [1800, 3200],
  'goldmedal|Ventilation fans': [1100, 2600],
  'goldmedal|Modular switches': [95, 420],
  'goldmedal|Accessories': [450, 900],
  'kenstar|Gas water heaters': [6200, 9800],
  'kenstar|Immersion rods': [650, 1450],
  'kenstar|Instant water heaters': [3200, 6500],
  'kenstar|Storage water heaters': [7200, 13500],
  'kenstar|Tankless water heaters': [5800, 9500],
  'sparsh-pearl|Cisterns & seat covers': [1200, 2400],
  'sparsh-pearl|Showers & health faucets': [350, 650],
  'ultravolt|Communication cables': [1800, 4200],
  'ultravolt|Flexible cables': [1500, 9800],
  'ultravolt|House wires': [1600, 4400],
  'ultravolt|Power and industrial cables': [4500, 12500],
  'ultravolt|Solar cables': [9000, 14500],
  'ultravolt|Submersible cables': [7500, 15500],
};

// Victura: 8 fan models from FACTS.md (names as printed on victura.in).
const VICTURA = [
  ['aerowind-bldc', 'Aerowind BLDC ceiling fan, midnight black', 'BLDC ceiling fans', '1200 mm', 4290],
  ['ecowind-led-bldc', 'Ecowind LED BLDC ceiling fan, titan grey', 'BLDC ceiling fans', '1200 mm', 3890],
  ['air-borne-bldc', 'Air Borne BLDC ceiling fan, wooden finish', 'BLDC ceiling fans', '1200 mm', 4190],
  ['glider-bldc', 'Glider BLDC ceiling fan, brown', 'BLDC ceiling fans', '1200 mm', 3990],
  ['nova-bldc', 'Nova BLDC ceiling fan, navy blue', 'BLDC ceiling fans', '1200 mm', 4490],
  ['sky-air-bldc', 'Sky Air BLDC ceiling fan, grey', 'BLDC ceiling fans', '1200 mm', 3790],
  ['aethra-bldc', 'Aethra BLDC ceiling fan, royal blue', 'BLDC ceiling fans', '1200 mm', 4090],
  ['windstorm', 'Windstorm ceiling fan, metallic black', 'Ceiling fans', '1200 mm', 2390],
].map(([slug, name, category, size, mrp]) => ({
  id: `victura-${slug}`, brand: 'victura', category, name, size, mrp, unit: 'per piece',
  src: join(POSTERS, `victura/product-${slug}.png`),
}));

// Poddar Pipes: 12 lines across the six categories on poddarpipes.com.
const PODDAR = [
  ['cpvc-pipe-half-inch', 'CPVC pipe, SDR 11', 'CPVC pipes', '½ inch, 3 m', 285, 'per 3 m pipe', 'cpvc-pipe'],
  ['cpvc-pipe-three-quarter-inch', 'CPVC pipe, SDR 11', 'CPVC pipes', '¾ inch, 3 m', 430, 'per 3 m pipe', 'cpvc-pipe-tall'],
  ['cpvc-fittings-elbow-tee', 'CPVC elbow and tee', 'CPVC fittings', '½ inch', 38, 'per piece', 'fittings-elbow-tee'],
  ['upvc-pipe-1-inch', 'uPVC pressure pipe', 'uPVC pipes', '1 inch, 6 m', 640, 'per 6 m pipe', 'upvc-pipe'],
  ['upvc-pipe-2-inch', 'uPVC pressure pipe', 'uPVC pipes', '2 inch, 6 m', 1480, 'per 6 m pipe', 'upvc-pipe'],
  ['swr-pipe-110', 'SWR drainage pipe, ring joint', 'SWR pipes', '110 mm, 3 m', 1190, 'per 3 m pipe', 'swr-pipe'],
  ['swr-fittings-bend', 'SWR bend and junction', 'SWR fittings', '110 mm', 185, 'per piece', 'fitting-swr-cutout'],
  ['agri-pipe-63', 'Agri uPVC pressure pipe, IS 4985', 'Agri pipes', '63 mm, 6 m', 1540, 'per 6 m pipe', 'agri-column-pipe'],
  ['agri-pipe-90', 'Agri uPVC pressure pipe, IS 4985', 'Agri pipes', '90 mm, 6 m', 2860, 'per 6 m pipe', 'agri-column-pipe'],
  ['ugd-pipe-160', 'UGD three-layer foam-core pipe', 'UGD pipes', '160 mm, 6 m', 3480, 'per 6 m pipe', 'ugd-pipe'],
  ['ugd-fittings-bend', 'UGD bend and junction', 'UGD fittings', '160 mm', 420, 'per piece', 'fittings-ugd-cutout'],
  ['tank-gold-1000', 'Tank Gold water storage tank, 3 layer', 'Water tanks', '1000 L', 6890, 'per piece', 'tank-gold-tank'],
].map(([slug, name, category, size, mrp, unit, photo]) => ({
  id: `poddar-${slug}`, brand: 'poddar', category, name, size, mrp, unit,
  src: join(POSTERS, `poddar/product-${photo}.png`),
}));

// ---------- helpers ----------
const hasCwebp = (() => { try { execFileSync('cwebp', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const EXT = hasCwebp ? 'webp' : 'jpg';
const tmp = mkdtempSync(join(tmpdir(), 'dm-catalog-'));

function hash(s) {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

function sampleMrp(p) {
  const range = SAMPLE_RANGES[`${p.brand}|${p.category}`];
  if (!range) throw new Error(`No sample price rule for ${p.brand} | ${p.category} (${p.id})`);
  const raw = range[0] + hash(p.id) * (range[1] - range[0]);
  const step = raw >= 1000 ? 10 : 5;
  return Math.round(raw / step) * step;
}

function pixelSize(file) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file]).toString();
  return [Number(/pixelWidth: (\d+)/.exec(out)[1]), Number(/pixelHeight: (\d+)/.exec(out)[1])];
}

function writePhoto(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const isWebp = src.endsWith('.webp');
  const [w, h] = isWebp ? [null, null] : pixelSize(src);
  if (hasCwebp) {
    let input = src;
    if (!isWebp && Math.max(w, h) > MAX_PX) { // sips resizes the PNGs, cwebp encodes
      input = join(tmp, 'resized.png');
      execFileSync('sips', ['-Z', String(MAX_PX), src, '--out', input], { stdio: 'ignore' });
    }
    const resize = isWebp ? ['-resize', ...(srcDims(src))] : [];
    execFileSync('cwebp', ['-quiet', '-q', '72', ...resize, input, '-o', dest]);
  } else {
    if (isWebp) throw new Error('cwebp is required to convert the .webp catalogue photos');
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', String(MAX_PX), src, '--out', dest], { stdio: 'ignore' });
  }
}

// cwebp -resize needs explicit dimensions; scale the longer side to MAX_PX, never upscale.
const dimsCache = new Map();
function srcDims(src) {
  const [w, h] = dimsCache.get(src) ?? [];
  if (!w) throw new Error(`missing dimensions for ${src}`);
  if (Math.max(w, h) <= MAX_PX) return [String(w), String(h)];
  return w >= h ? [String(MAX_PX), '0'] : ['0', String(MAX_PX)];
}

// ---------- build ----------
const products = [];
const productsDir = join(SITE, 'assets/products');
rmSync(productsDir, { recursive: true, force: true });

for (const file of readdirSync(join(PACKS, 'src/catalog')).filter((f) => f.endsWith('.json')).sort()) {
  for (const r of JSON.parse(readFileSync(join(PACKS, 'src/catalog', file), 'utf8'))) {
    const hasMrp = Number(r.mrp) > 0;
    const p = {
      id: r.id, brand: r.brand, category: r.category, name: r.name, size: r.size || r.pack || '',
      mrp: hasMrp ? Math.round(r.mrp * 100) / 100 : 0, mrpSample: !hasMrp,
      gstPct: GST_BY_CATEGORY[r.category] ?? DEFAULT_GST,
      unit: r.mrpUnit || 'per piece', photo: `assets/products/${r.brand}/${r.id}.${EXT}`,
    };
    if (!hasMrp) p.mrp = sampleMrp(p);
    dimsCache.set(join(PACKS, 'public', r.photo), [r.w, r.h]);
    writePhoto(join(PACKS, 'public', r.photo), join(SITE, p.photo));
    products.push(p);
  }
}

for (const r of [...VICTURA, ...PODDAR]) {
  const { src, ...rest } = r;
  const p = {
    ...rest, mrpSample: true, gstPct: GST_BY_CATEGORY[r.category] ?? DEFAULT_GST,
    photo: `assets/products/${r.brand}/${r.id}.${EXT}`,
  };
  const { id, brand, category, name, size, mrp, mrpSample, gstPct, unit, photo } = p;
  writePhoto(src, join(SITE, photo));
  products.push({ id, brand, category, name, size, mrp, mrpSample, gstPct, unit, photo });
}

const order = new Map(BRANDS.map((b, i) => [b.key, i]));
products.sort((a, b) => order.get(a.brand) - order.get(b.brand) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

const categories = [...new Set(products.map((p) => p.category))];
const units = [...new Set(products.map((p) => p.unit))];
const rows = products.map((p) => '  ' + JSON.stringify([p.id, p.brand, categories.indexOf(p.category), p.name, p.size, p.mrp, p.mrpSample ? 1 : 0, p.gstPct, units.indexOf(p.unit)])).join(',\n');
const brandLines = BRANDS.map((b) => '  ' + JSON.stringify(b)).join(',\n');
if (products.some((p) => p.photo !== `assets/products/${p.brand}/${p.id}.${EXT}`)) throw new Error('photo paths must be assets/products/<brand>/<id>.<ext>: the catalogue derives them');
writeFileSync(join(SITE, 'js/data/catalog.js'), `// GENERATED by tools/build-catalog.mjs. Do not edit by hand.
// Products and brands are real; mrpSample:true marks a price made up for the demo.
// gstPct is sample data for every product. unit is the unit the MRP is quoted per.
// Stored compact (smaller download on slow phones) and expanded below into one object per product.
const BRANDS = [
${brandLines},
];
const CATEGORIES = ${JSON.stringify(categories)};
const UNITS = ${JSON.stringify(units)};
// id, brand, category index, name, size, mrp, sample mrp (1/0), gst %, unit index
const ROWS = [
${rows},
];
export const CATALOG = {
  brands: BRANDS,
  products: ROWS.map(([id, brand, c, name, size, mrp, sample, gstPct, u]) => ({
    id, brand, category: CATEGORIES[c], name, size, mrp, mrpSample: sample === 1, gstPct, unit: UNITS[u], photo: \`assets/products/\${brand}/\${id}.${EXT}\`,
  })),
};
`);
rmSync(tmp, { recursive: true, force: true });
const sampled = products.filter((p) => p.mrpSample).length;
console.log(`brands ${BRANDS.length}, products ${products.length}, sample MRPs ${sampled}, photo format ${EXT}`);
