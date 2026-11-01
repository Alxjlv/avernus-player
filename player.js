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
    async function loadJson(name) {
        const gh = (await config()).github;
        const res = gh
            ? await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/contents/${(gh.path || 'player/state.json').replace(/[^/]*$/, name)}?ref=${gh.branch || 'main'}`,
                { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' })
            : await fetch(name + '?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) throw new Error(name + ' request failed: ' + res.status);
        return res.json();
    }
    const loadState = () => loadJson('state.json');
    const loadPublic = async () => { try { return (await loadJson('dm-state.json')).public || null; } catch (e) { return null; } };   // optional: absent until the DM view has saved once

    // Optional travel clock: only what the DM chose to publish (day and watch, hours since rest, weather, the Elturel estimate).
    function renderClock(pub) {
        const bar = document.getElementById('clockbar'), log = pub && pub.log, c = (pub && pub.clock) || {};
        if (!(pub && pub.clock) && !(log && log.length)) { bar.hidden = true; return; }
        const esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
        let h = '<div class="chips">';
        if (c.day != null) h += '<span class="chip">Day ' + c.day + (c.watch ? ', watch ' + c.watch + ' of 6' : '') + '</span>';
        if (c.rest != null) h += '<span class="chip' + (c.rest >= 16 ? ' warn' : '') + '">' + c.rest + ' h since long rest</span>';
        if (c.weather) h += '<span class="chip' + (c.weather.name ? ' warn' : '') + '">' + esc(c.weather.name || 'No oppressive weather') + '</span>' + (c.weather.clear ? '<span class="chip">Clear day</span>' : '');
        h += '</div>';
        if (c.weather && c.weather.name && c.weather.rule) h += '<p class="note"><b>' + esc(c.weather.name) + '.</b> ' + esc(c.weather.rule) + '</p>';
        if (c.estimate) {
            const e = c.estimate, lo = e.given + e.lo, hi = e.given + e.hi, max = hi + 10, pc = x => Math.max(0, Math.min(100, 100 * x / max));
            h += '<p class="note"><b>Elturel.</b> On day ' + e.given + ' you were told it had ' + e.lo + ' to ' + e.hi + ' days. Now: about ' + Math.max(0, lo - e.day) + ' to ' + Math.max(0, hi - e.day) + ' days.</p>' +
                '<div class="win" role="img" aria-label="Time left before Elturel is submerged"><i style="left:' + pc(lo) + '%;width:' + (pc(hi) - pc(lo)) + '%"></i><b style="left:' + pc(e.day) + '%"></b></div><div class="scale"><span>day 0</span><span>day ' + lo + '</span><span>day ' + hi + '</span></div>';
        }
        if (log && log.length) h += '<details class="done"><summary>What we have done (' + log.length + ')</summary><ul>' + log.map(r => '<li><b>Session ' + esc(r.s) + ', ' + esc(r.where) + ':</b> ' + esc(r.text) + '</li>').join('') + '</ul></details>';
        bar.innerHTML = h;
        bar.hidden = false;
    }

    async function refresh() {
        try {
            const [state, pub] = await Promise.all([loadState(), loadPublic()]);
            const map = await HexMaps.load(state.map, 'maps/');   // publish-player-site.sh rewrites this to 'maps/' for the flattened (custom-domain) copy
            msg.style.display = 'none';
            renderClock(pub);
            HexMaps.render(mapEl, map, {
                fog: state.fog !== false,
                party: state.party,
                cell: id => state.hexes[id],
                labelSize: map.labelSize || 12
            });
            document.getElementById('lg-r').hidden = !Object.values(state.hexes).some(h => h.status === 'R');
            document.getElementById('lg-e').hidden = !Object.values(state.hexes).some(h => h.status === 'E');
            document.getElementById('updated').textContent = state.updated ? 'Updated ' + new Date(state.updated).toLocaleString() : '';
        } catch (e) {
            msg.style.display = '';
            msg.textContent = 'Could not load the map (' + e.message + '). Try refreshing.';
        }
    }

    document.getElementById('reload').addEventListener('click', refresh);
    refresh();
})();
