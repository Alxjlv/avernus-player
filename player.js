// Static player view. Reads state.json (written by the DM view) on load and when Refresh is pressed.
// state.json holds only what the players may see: name + status of revealed hexes.
// dm-state.json (autosaved by the DM view, optional) carries a "public" block: the clock values and completed-encounter lines the DM chose to share.
// Nothing else in dm-state.json is read or rendered here.
//
// config.json may set "github": {"owner": "...", "repo": "...", "branch": "main", "path": "player/state.json"}
// to read state through the GitHub contents API (always fresh, no Pages build lag). Otherwise ./state.json is used.
(function () {
    const msg = document.getElementById('msg');
    const mapEl = document.getElementById('map');

    async function config() {
        try { return (await (await fetch('config.json', { cache: 'no-store' })).json()) || {}; } catch (e) { return {}; }   // optional
    }

    // name is 'state.json' or 'dm-state.json'; the latter sits next to the former.
    // The GitHub API is unauthenticated (60 requests an hour per network, then 403); when it refuses, use the copy the site serves itself.
    async function loadJson(name) {
        const gh = (await config()).github;
        if (gh) {
            try {
                const res = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/contents/${(gh.path || 'player/state.json').replace(/[^/]*$/, name)}?ref=${gh.branch || 'main'}`,
                    { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
                if (res.ok) return res.json();
            } catch (e) { /* fall through to the site copy */ }
        }
        const res = await fetch(name + '?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) throw new Error(name + ' request failed: ' + res.status);
        return res.json();
    }
    const loadState = () => loadJson('state.json');
    const loadPublic = async () => { try { return (await loadJson('dm-state.json')).public || null; } catch (e) { return null; } };   // optional: absent until the DM view has saved once

    // Optional travel clock: only what the DM chose to publish (day and watch, hours since rest, weather, the Elturel estimate).
    // The chips sit in the header bar; the detail (Elturel window, weather rule, what we have done) lives in the menu panel.
    const esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const menu = document.getElementById('menu'), menuBtn = document.getElementById('menubtn'), chipsEl = document.getElementById('clockchips');
    function setMenu(open) { menu.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); }
    menuBtn.addEventListener('click', e => { e.stopPropagation(); setMenu(menu.hidden); });
    chipsEl.addEventListener('click', e => { if (e.target.closest('[data-menu]')) { e.stopPropagation(); setMenu(true); } });
    document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) setMenu(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

    function renderClock(pub) {
        const log = (pub && pub.log) || [], c = (pub && pub.clock) || {}, w = c.weather, e = c.estimate;
        const chip = (txt, warn) => '<span class="chip' + (warn ? ' warn' : '') + '">' + txt + '</span>';
        let chips = '', det = '';
        if (c.day != null) chips += chip('Day ' + c.day + (c.watch ? ' · Watch ' + c.watch + '/6' : ''));
        if (e) {   // the countdown sits next to the day so it stays visible on a narrow screen
            var lo = e.given + e.lo, hi = e.given + e.hi, left = Math.max(0, lo - e.day), right = Math.max(0, hi - e.day);
            chips += '<button type="button" class="chip' + (left <= 7 ? ' warn' : '') + '" data-menu aria-label="Elturel countdown, open details">Elturel ' + left + '–' + right + ' days</button>';
        }
        if (w) chips += chip(esc(w.name || 'No oppressive weather'), !!w.name) + (w.clear ? chip('Clear day') : '');
        if (c.rest != null) chips += chip(c.rest + 'h since rest', c.rest >= 16);
        if (w && w.name && w.rule) det += '<section><h3>' + esc(w.name) + '</h3><p>' + esc(w.rule) + '</p></section>';
        if (e) {
            const max = hi + 10, pc = x => Math.max(0, Math.min(100, 100 * x / max));
            det += '<section><h3>Elturel</h3><p>On day ' + e.given + ' you were told it had ' + e.lo + ' to ' + e.hi + ' days. Now: about ' + left + ' to ' + right + ' days.</p>' +
                '<div class="win" role="img" aria-label="Time left before Elturel is submerged"><i style="left:' + pc(lo) + '%;width:' + (pc(hi) - pc(lo)) + '%"></i><b style="left:' + pc(e.day) + '%"></b></div><div class="scale"><span>day 0</span><span>day ' + lo + '</span><span>day ' + hi + '</span></div></section>';
        }
        if (log.length) det += '<section><h3>What we have done (' + log.length + ')</h3><ul>' + log.map(r => '<li><b>Session ' + esc(r.s) + ', ' + esc(r.where) + ':</b> ' + esc(r.text) + '</li>').join('') + '</ul></section>';
        chipsEl.innerHTML = chips;
        document.getElementById('menudetail').innerHTML = det;
        menuBtn.classList.toggle('empty', !det);   // wide screens only need the menu when there is detail to show
    }

    // Narrow screens: #mapview scrolls on its own under the fixed header. The map is drawn at a readable size (not squeezed to the
    // screen width), opens centred on the party, and can be zoomed with the buttons or by pinching. Wide screens are left as before.
    const mapview = document.getElementById('mapview'), narrow = window.matchMedia('(max-width: 800px)');
    const ZMAX = 2.5, ZSTART = 0.9;   // px per map unit; the map is 1292 units wide
    let zoom = null, curMap = null, centred = false;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const minZoom = () => curMap ? mapview.clientWidth / curMap.canvas.width : 0.3;
    const mapSvg = () => document.querySelector('#map svg');
    function partyPoint(party) {
        const pp = party && /^[a-z]\d+$/.test(party) ? HexMaps.parseHex(party) : null;
        return pp ? HexMaps.center(curMap, pp.col, pp.row) : { x: curMap.canvas.width / 2, y: curMap.canvas.height / 2 };
    }
    function sizeMap() {   // set the svg width for the current zoom (or clear it on a wide screen)
        const svg = mapSvg();
        if (!svg) return;
        svg.style.width = narrow.matches && curMap ? curMap.canvas.width * zoom + 'px' : '';
    }
    function scrollToPoint(pt) {   // put a map point in the middle of the viewport
        mapview.scrollLeft = pt.x * zoom - mapview.clientWidth / 2;
        mapview.scrollTop = pt.y * zoom - mapview.clientHeight / 2;
    }
    function setZoom(z, focus) {   // keep the map point under `focus` ({x, y} in map units, default the view centre) where it is
        if (!narrow.matches || !curMap) return;
        const f = focus || { x: (mapview.scrollLeft + mapview.clientWidth / 2) / zoom, y: (mapview.scrollTop + mapview.clientHeight / 2) / zoom };
        const dx = focus ? focus.cx : mapview.clientWidth / 2, dy = focus ? focus.cy : mapview.clientHeight / 2;   // where on screen it sits
        zoom = clamp(z, minZoom(), ZMAX);
        sizeMap();
        mapview.scrollLeft = f.x * zoom - dx;
        mapview.scrollTop = f.y * zoom - dy;
    }
    document.getElementById('zin').addEventListener('click', () => setZoom(zoom * 1.35));
    document.getElementById('zout').addEventListener('click', () => setZoom(zoom / 1.35));
    document.getElementById('zparty').addEventListener('click', () => { if (curMap && narrow.matches) scrollToPoint(partyPoint(lastParty)); });
    window.addEventListener('resize', () => { if (curMap) { if (narrow.matches) zoom = clamp(zoom == null ? ZSTART : zoom, minZoom(), ZMAX); sizeMap(); } });
    let pinch = null;   // two-finger pinch zoom, about the midpoint between the fingers
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    mapview.addEventListener('touchstart', e => { if (e.touches.length === 2 && narrow.matches && curMap) pinch = { d: dist(e.touches), z: zoom }; }, { passive: true });
    mapview.addEventListener('touchmove', e => {
        if (!pinch || e.touches.length !== 2) return;
        e.preventDefault();
        const r = mapview.getBoundingClientRect(), cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
        setZoom(pinch.z * dist(e.touches) / pinch.d, { x: (mapview.scrollLeft + cx) / zoom, y: (mapview.scrollTop + cy) / zoom, cx, cy });
    }, { passive: false });
    mapview.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; }, { passive: true });
    let lastParty = null;

    async function refresh() {
        try {
            const [state, pub] = await Promise.all([loadState(), loadPublic()]);
            const map = await HexMaps.load(state.map, 'maps/');   // publish-player-site.sh rewrites this to 'maps/' for the flattened (custom-domain) copy
            msg.style.display = 'none';
            renderClock(pub);
            const sl = mapview.scrollLeft, st = mapview.scrollTop;
            curMap = map; lastParty = state.party;
            if (zoom == null) zoom = clamp(ZSTART, minZoom(), ZMAX);
            HexMaps.render(mapEl, map, {
                fog: state.fog !== false,
                party: state.party,
                cell: id => state.hexes[id],
                labelSize: map.labelSize || 12
            });
            sizeMap();
            if (narrow.matches) {
                if (!centred) { scrollToPoint(partyPoint(state.party)); centred = true; }   // first draw opens on the party
                else { mapview.scrollLeft = sl; mapview.scrollTop = st; }                     // Refresh keeps where you were looking
            }
            const hasR = Object.values(state.hexes).some(h => h.status === 'R'), hasE = Object.values(state.hexes).some(h => h.status === 'E');
            document.querySelectorAll('.lg-r').forEach(el => { el.hidden = !hasR; });
            document.querySelectorAll('.lg-e').forEach(el => { el.hidden = !hasE; });
            document.querySelectorAll('.updated').forEach(el => { el.textContent = state.updated ? 'Updated ' + new Date(state.updated).toLocaleString() : ''; });
        } catch (e) {
            msg.style.display = '';
            msg.textContent = 'Could not load the map (' + e.message + '). Try refreshing.';
        }
    }

    document.getElementById('reload').addEventListener('click', refresh);
    if (location.hash === '#menu') setMenu(true);
    refresh();
})();
