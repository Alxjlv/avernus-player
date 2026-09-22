// Static player view. Reads state.json (written by the DM view) on load and when Refresh is pressed.
// state.json holds only what the players may see: name + status of revealed hexes. No DM notes live on this site.
//
// config.json may set "github": {"owner": "...", "repo": "...", "branch": "main", "path": "player/state.json"}
// to read state through the GitHub contents API (always fresh, no Pages build lag). Otherwise ./state.json is used.
(function () {
    const msg = document.getElementById('msg');
    const mapEl = document.getElementById('map');

    async function loadState() {
        let cfg = {};
        try { cfg = await (await fetch('config.json', { cache: 'no-store' })).json(); } catch (e) { /* optional */ }
        const gh = cfg.github;
        const res = gh
            ? await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/contents/${gh.path || 'player/state.json'}?ref=${gh.branch || 'main'}`,
                { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' })
            : await fetch('state.json?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) throw new Error('State request failed: ' + res.status);
        return res.json();
    }

    async function refresh() {
        try {
            const state = await loadState();
            const map = await HexMaps.load(state.map, 'maps/');   // publish-player-site.sh rewrites this to 'maps/' for the flattened (custom-domain) copy
            msg.style.display = 'none';
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
