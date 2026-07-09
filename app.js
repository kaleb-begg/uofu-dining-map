const DATA_URL = 'data/dining-data.csv';
function canonicalType(raw, name='', building='') {
  const t = String(raw || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  const b = String(building || '').toLowerCase();
  if (t.includes('dining hall') || n.includes('urban bites') || n.includes('united table') || n.includes('crimson view')) return 'Dining hall';
  if (t.includes('market') || n.includes('market') || n.includes('store front')) return 'Market';
  if (t.includes('food court') || b.includes('gardner commons') || b.includes('olpin student union') || b.includes('union')) return 'Food court';
  return 'Cafe';
}
let locations = [];
let activeMetric = 'traffic';
let displayMode = 'color';
let selectedType = 'all';
let selectedId = null;
let markers = [];
const metricMeta = {
  traffic: {label:'Daily traffic', unit:' visits/day', money:false},
  monthlyRevenue: {label:'Monthly revenue', unit:'', money:true},
  monthlyProfit: {label:'Monthly profit', unit:'', money:true},
  satisfaction: {label:'Satisfaction', unit:'/5', money:false},
  profitMargin: {label:'Profit margin', unit:'%', money:false}
};
const map = L.map('map', { zoomControl:true, preferCanvas:true }).setView([40.7648, -111.8427], 16);
L.tileLayer('https://fmagsdr.fm.utah.edu/arcgis/rest/services/mapservices/public_basemap_2014/MapServer/tile/{z}/{y}/{x}', {
  maxZoom:20,
  attribution:'Map tiles: University of Utah Facilities GIS'
}).addTo(map);
function fitCampus() {
  const valid = locations.filter(d => Number.isFinite(d.lat) && Number.isFinite(d.lng));
  if (valid.length) map.fitBounds(L.latLngBounds(valid.map(d => [d.lat, d.lng])).pad(0.18));
}
function cleanNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? '').replace(/[,$%]/g,'').trim());
  return Number.isFinite(n) ? n : 0;
}
function recalc(d) {
  d.type = canonicalType(d.type, d.name, d.building);
  d.lat = cleanNumber(d.lat); d.lng = cleanNumber(d.lng); d.traffic = cleanNumber(d.traffic); d.avgTicket = cleanNumber(d.avgTicket); d.expenses = cleanNumber(d.expenses); d.satisfaction = cleanNumber(d.satisfaction);
  d.monthlyRevenue = d.traffic * d.avgTicket * 30;
  d.monthlyProfit = d.monthlyRevenue - d.expenses;
  d.profitMargin = d.monthlyRevenue ? d.monthlyProfit / d.monthlyRevenue : 0;
  return d;
}
function filteredLocations() {
  const search = document.getElementById('searchBox').value.trim().toLowerCase();
  const type = selectedType;
  const minTraffic = cleanNumber(document.getElementById('minTraffic').value);
  return locations.filter(d =>
    (!search || (d.name+' '+d.building+' '+d.type).toLowerCase().includes(search)) &&
    (type === 'all' || d.type === type) &&
    (!minTraffic || d.traffic >= minTraffic)
  );
}
function extent(metric=activeMetric, rows=filteredLocations()) {
  const vals = rows.map(d => valueFor(d, metric)).filter(v => Number.isFinite(v));
  if (!vals.length) return {min:0,max:1};
  return {min: Math.min(...vals), max: Math.max(...vals)};
}
function normalize(v, metric=activeMetric, rows=filteredLocations()) {
  const e = extent(metric, rows); const span = e.max - e.min;
  return span ? (v - e.min) / span : .55;
}
function valueFor(d, metric=activeMetric) { return cleanNumber(d[metric]); }
function fmt(v, metric=activeMetric) {
  if (metricMeta[metric]?.money) return '$' + Math.round(v).toLocaleString();
  if (metric === 'profitMargin') return (v*100).toFixed(1)+'%';
  if (metric === 'satisfaction') return Number(v).toFixed(1) + '/5';
  return Math.round(v).toLocaleString();
}
function colorFor(n) {
  if (n < .25) return '#facc15';
  if (n < .5) return '#f97316';
  if (n < .75) return '#dc2626';
  return '#7f1d1d';
}
function markerRadius(d, rows) { return 6 + normalize(valueFor(d), activeMetric, rows) * 9; }
function colorRadius() { return 8.5; }
function escapeHtml(s) { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escapeAttr(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function popupHtml(d) {
  return `<div class="popup"><h3>${escapeHtml(d.name)}</h3><p>${escapeHtml(d.building)} · ${escapeHtml(d.type)}</p>
  <div class="popgrid">
    <div><b>${Math.round(d.traffic).toLocaleString()}</b><br><span class="muted">daily traffic</span></div>
    <div><b>${fmt(d.monthlyRevenue,'monthlyRevenue')}</b><br><span class="muted">monthly revenue</span></div>
    <div><b>${fmt(d.monthlyProfit,'monthlyProfit')}</b><br><span class="muted">monthly profit</span></div>
    <div><b>${Number(d.satisfaction).toFixed(1)}/5</b><br><span class="muted">satisfaction</span></div>
  </div></div>`;
}
function draw() {
  locations.forEach(recalc);
  const rows = filteredLocations();
  markers.forEach(m => map.removeLayer(m)); markers = [];
  locations.forEach(d => {
    if (!rows.includes(d)) return markers.push(null);
    const n = normalize(valueFor(d), activeMetric, rows);
    const radius = displayMode === 'size' ? markerRadius(d, rows) : colorRadius();
    const m = L.circleMarker([d.lat, d.lng], {
      radius,
      color:'#111827',
      weight:1.5,
      fillColor:colorFor(n),
      fillOpacity: displayMode === 'color' ? 0.92 : 0.82
    }).bindPopup(popupHtml(d)).on('click', () => selectLocation(d.id)).addTo(map);
    markers.push(m);
  });
  updatePanel(rows); updateLegend(rows);
}
function updateLegend(rows=filteredLocations()) {
  const meta = metricMeta[activeMetric];
  const e = extent(activeMetric, rows);
  const modeText = displayMode === 'color' ? 'hotter marker color' : 'larger bubble size';
  const note = displayMode === 'color' ? 'Darker red means a higher value.' : 'Larger circles mean a higher value.';
  document.getElementById('legend').innerHTML = `<b>${meta.label} shown by ${modeText}</b><div class="grad"></div><div style="display:flex;justify-content:space-between"><span>${fmt(e.min, activeMetric)}</span><span>${fmt(e.max, activeMetric)}</span></div><p class="muted" style="margin:7px 0 0">${note} Filters below also update the map.</p>`;
}
function updatePanel(rows=filteredLocations()) {
  const totalTraffic = rows.reduce((s,d)=>s+d.traffic,0);
  const totalRevenue = rows.reduce((s,d)=>s+d.monthlyRevenue,0);
  const totalProfit = rows.reduce((s,d)=>s+d.monthlyProfit,0);
  document.getElementById('kpiLocations').textContent = rows.length;
  document.getElementById('kpiTraffic').textContent = Math.round(totalTraffic).toLocaleString();
  document.getElementById('kpiRevenue').textContent = fmt(totalRevenue,'monthlyRevenue');
  document.getElementById('kpiProfit').textContent = fmt(totalProfit,'monthlyProfit');
  const avgTicket = totalTraffic ? totalRevenue / (totalTraffic * 30) : 0;
  const avgSat = rows.length ? rows.reduce((s,d)=>s+d.satisfaction,0)/rows.length : 0;
  const margin = totalRevenue ? totalProfit/totalRevenue : 0;
  const totalExpenses = rows.reduce((s,d)=>s+d.expenses,0);
  document.getElementById('summaryAnalytics').innerHTML = `
    <div class="mini"><span>Avg ticket</span><b>$${avgTicket.toFixed(2)}</b></div>
    <div class="mini"><span>Avg satisfaction</span><b>${avgSat.toFixed(1)}/5</b></div>
    <div class="mini"><span>Profit margin</span><b>${(margin*100).toFixed(1)}%</b></div>
    <div class="mini"><span>Monthly expenses</span><b>${fmt(totalExpenses,'monthlyRevenue')}</b></div>
    <div class="mini"><span>Avg traffic/location</span><b>${rows.length ? Math.round(totalTraffic/rows.length).toLocaleString() : '0'}</b></div>
    <div class="mini"><span>Selected metric</span><b>${metricMeta[activeMetric].label}</b></div>`;
  const typeCounts = {};
  rows.forEach(d => typeCounts[d.type] = (typeCounts[d.type] || 0) + 1);
  document.getElementById('typeBreakdown').innerHTML = Object.entries(typeCounts).sort((a,b)=>b[1]-a[1]).map(([type,count]) => `<span class="pill">${escapeHtml(type)} · ${count}</span>`).join('') || '<span class="muted">No matching locations.</span>';
  const sorted = [...rows].sort((a,b)=>valueFor(b)-valueFor(a)).slice(0,7);
  const max = Math.max(...sorted.map(d=>valueFor(d)),1);
  document.getElementById('topTitle').textContent = `Top by ${metricMeta[activeMetric].label.toLowerCase()}`;
  document.getElementById('topList').innerHTML = sorted.map(d => `<div class="barrow" onclick="focusLocation('${escapeAttr(d.id)}')"><div class="line"><b>${escapeHtml(d.name)}</b><span>${fmt(valueFor(d), activeMetric)}</span></div><div class="track"><div class="fill" style="width:${Math.max(5, valueFor(d)/max*100)}%"></div></div></div>`).join('') || '<p class="muted">No matching locations.</p>';
  const sort = document.getElementById('sortSelect').value;
  const listRows = [...rows].sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name) : valueFor(b, sort)-valueFor(a, sort));
  document.getElementById('locationTable').innerHTML = listRows.map(d => `<div class="tableitem" onclick="focusLocation('${escapeAttr(d.id)}')"><div><div class="name">${escapeHtml(d.name)}</div><div class="building">${escapeHtml(d.building)}</div></div><b>${fmt(valueFor(d, sort), sort)}</b></div>`).join('') || '<p class="muted" style="padding:12px">No matching locations.</p>';
  renderSelected(locations.find(d=>d.id===selectedId));
}
function selectLocation(id) { selectedId = id; updatePanel(); }
function focusLocation(id) {
  const d = locations.find(x=>x.id===id); if (!d) return;
  selectedId = id; map.setView([d.lat,d.lng], 18);
  const idx = locations.findIndex(x=>x.id===id);
  if (markers[idx]) markers[idx].openPopup();
  updatePanel();
  document.getElementById('selectedCard').scrollIntoView({behavior:'smooth', block:'center'});
}
window.focusLocation = focusLocation;
function renderSelected(d) {
  const el = document.getElementById('selectedCard');
  if (!d) { el.innerHTML = '<h3>Selected location</h3><p class="muted">Click a marker or row to see full numbers and edit inputs.</p>'; return; }
  el.innerHTML = `<p class="selected-title">${escapeHtml(d.name)}</p><p class="selected-meta">${escapeHtml(d.building)} · ${escapeHtml(d.type)}</p>
  <div class="mini-grid">
    <div class="mini"><span>Traffic/day</span><b>${Math.round(d.traffic).toLocaleString()}</b></div>
    <div class="mini"><span>Avg ticket</span><b>$${Number(d.avgTicket).toFixed(2)}</b></div>
    <div class="mini"><span>Revenue</span><b>${fmt(d.monthlyRevenue,'monthlyRevenue')}</b></div>
    <div class="mini"><span>Expenses</span><b>${fmt(d.expenses,'monthlyRevenue')}</b></div>
    <div class="mini"><span>Profit</span><b>${fmt(d.monthlyProfit,'monthlyProfit')}</b></div>
    <div class="mini"><span>Margin</span><b>${(d.profitMargin*100).toFixed(1)}%</b></div>
    <div class="mini"><span>Satisfaction</span><b>${d.satisfaction.toFixed(1)}/5</b></div>
    <div class="mini"><span>Coordinates</span><b>${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}</b></div>
  </div>
  <details><summary>Edit inputs</summary><div class="edit-grid">
    ${editInput('traffic','Daily traffic',d.traffic)}${editInput('avgTicket','Avg ticket',d.avgTicket)}${editInput('expenses','Monthly expenses',d.expenses)}${editInput('satisfaction','Satisfaction',d.satisfaction)}${editInput('lat','Latitude',d.lat)}${editInput('lng','Longitude',d.lng)}
  </div><button class="btn" onclick="applyEdits('${escapeAttr(d.id)}')">Apply updates</button></details>`;
}
function editInput(key,label,value) { return `<div><label>${label}</label><input id="edit_${key}" value="${value}" /></div>`; }
function applyEdits(id) {
  const d = locations.find(x=>x.id===id); if(!d) return;
  ['traffic','avgTicket','expenses','satisfaction','lat','lng'].forEach(k => d[k] = cleanNumber(document.getElementById('edit_'+k).value));
  recalc(d); selectedId=id; draw();
}
window.applyEdits = applyEdits;
function populateTypeFilter() {
  const wrap = document.getElementById('typeButtons');
  const types = ['all','Cafe','Food court','Dining hall','Market'];
  const labels = {all:'All', Cafe:'Cafe', 'Food court':'Food court', 'Dining hall':'Dining hall', Market:'Market'};
  wrap.innerHTML = types.map(t => `<button class="type-chip ${selectedType===t ? 'active' : ''}" type="button" data-type="${t}">${labels[t]}</button>`).join('');
  wrap.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
    selectedType = btn.dataset.type;
    populateTypeFilter();
    draw();
  }));
}
document.getElementById('metricSelect').addEventListener('change', e => { activeMetric=e.target.value; draw(); });
document.getElementById('colorBtn').addEventListener('click', () => { displayMode='color'; document.getElementById('colorBtn').classList.add('active'); document.getElementById('sizeBtn').classList.remove('active'); draw(); });
document.getElementById('sizeBtn').addEventListener('click', () => { displayMode='size'; document.getElementById('sizeBtn').classList.add('active'); document.getElementById('colorBtn').classList.remove('active'); draw(); });
['searchBox','sortSelect','minTraffic'].forEach(id => document.getElementById(id).addEventListener('input', draw));
document.getElementById('resetBtn').addEventListener('click', () => { document.getElementById('searchBox').value=''; selectedType='all'; populateTypeFilter(); document.getElementById('sortSelect').value='name'; document.getElementById('minTraffic').value=''; draw(); });
document.getElementById('exportBtn').addEventListener('click', () => {
  const headers = ['name','building','type','lat','lng','traffic','avgTicket','expenses','satisfaction','monthlyRevenue','monthlyProfit','profitMargin'];
  const csv = [headers.join(',')].concat(locations.map(d => headers.map(h => csvCell(d[h])).join(','))).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href=url; a.download='dining_data.csv'; a.click(); URL.revokeObjectURL(url);
});
function csvCell(v) { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; }
document.getElementById('csvInput').addEventListener('change', e => {
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = parseCSV(reader.result);
    if (!parsed.length) return alert('No rows found in CSV.');
    locations = parsed.map((d,i) => recalc({
      name:d.name, building:d.building, type:canonicalType(d.type, d.name, d.building), lat:d.lat, lng:d.lng,
      traffic:d.traffic, avgTicket:d.avgTicket, expenses:d.expenses, satisfaction:d.satisfaction,
      id:`${d.name}__${d.building}__${i}`
    }));
    selectedId=null; populateTypeFilter(); fitCampus(); draw();
  };
  reader.readAsText(file);
});
function parseCSV(text) {
  const rows=[]; let row=[]; let cell=''; let q=false;
  for (let i=0;i<text.length;i++) {
    const c=text[i], n=text[i+1];
    if (q) {
      if (c==='"' && n==='"') { cell+='"'; i++; }
      else if (c==='"') q=false;
      else cell+=c;
    } else {
      if (c==='"') q=true;
      else if (c===',') { row.push(cell); cell=''; }
      else if (c==='\n') { row.push(cell); rows.push(row); row=[]; cell=''; }
      else if (c !== '\r') cell+=c;
    }
  }
  row.push(cell); rows.push(row);
  const head = rows.shift().map(h=>h.trim());
  return rows.filter(r=>r.length>1 && r.some(x=>String(x).trim())).map(r=>Object.fromEntries(head.map((h,i)=>[h,(r[i]||'').trim()])));
}

async function loadData() {
  try {
    const response = await fetch(DATA_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load ${DATA_URL}`);
    const csvText = await response.text();
    const parsed = parseCSV(csvText);
    locations = parsed.map((d,i) => recalc({
      name:d.name, building:d.building, type:canonicalType(d.type, d.name, d.building), lat:d.lat, lng:d.lng,
      traffic:d.traffic, avgTicket:d.avgTicket, expenses:d.expenses, satisfaction:d.satisfaction,
      id:`${d.name}__${d.building}__${i}`
    }));
    selectedId = null;
    populateTypeFilter();
    fitCampus();
    draw();
  } catch (err) {
    console.error(err);
    document.getElementById('selectedCard').innerHTML = '<h3>Data could not load</h3><p class="muted">Make sure data/dining-data.csv is uploaded in the repository and the site is opened through GitHub Pages, not as a local file.</p>';
  }
}
loadData();