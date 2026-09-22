/*
 * Shared hex map renderer (DM + player views). No dependencies, works over file://.
 *
 * A map is described by a manifest registered with HexMaps.register({...}); see maps/README.md.
 * Hexes are flat-topped; columns are letters (a, b, ...), rows are numbers (1, 2, ...), e.g. "c4".
 * Odd columns (b, d, ...) are shifted down by grid.oddColOffset.
 */
(function (root) {
    const NS = 'http://www.w3.org/2000/svg';
    const maps = {};

    function register(manifest) { maps[manifest.id] = manifest; }
    function get(id) { return maps[id]; }
    function list() { return Object.values(maps); }

    // Loads maps/<id>/manifest.js (which calls register). Resolves once registered.
    function load(id, base) {
        if (maps[id]) return Promise.resolve(maps[id]);
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = (base || '../maps/') + id + '/manifest.js';
            s.onload = () => maps[id] ? resolve(maps[id]) : reject(new Error('Manifest did not register ' + id));
            s.onerror = () => reject(new Error('Could not load map ' + id));
            document.head.appendChild(s);
        });
    }

    const hexId = (col, row) => String.fromCharCode(97 + col) + (row + 1);
    const parseHex = id => ({ col: id.charCodeAt(0) - 97, row: Number(id.slice(1)) - 1 });

    function center(map, col, row) {
        const g = map.grid;
        return {
            x: g.originX + col * g.colPitch,
            y: g.originY + row * g.rowPitch + (col % 2 ? g.oddColOffset : 0)
        };
    }

    function points(map, c, shrink) {
        const g = map.grid, k = shrink || 0;
        const rx = g.hexWidth / 2 - k, ry = g.hexHeight / 2 - k;
        return [[c.x - rx, c.y], [c.x - rx / 2, c.y - ry], [c.x + rx / 2, c.y - ry],
                [c.x + rx, c.y], [c.x + rx / 2, c.y + ry], [c.x - rx / 2, c.y + ry]]
            .map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    }

    function el(name, attrs, parent) {
        const e = document.createElementNS(NS, name);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    }

    function wrap(text, max) {
        const lines = [];
        let cur = '';
        String(text).split(/\s+/).forEach(w => {
            if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w; }
            else cur = cur ? cur + ' ' + w : w;
        });
        if (cur) lines.push(cur);
        return lines;
    }

    function label(parent, c, text, cls, size) {
        const lines = wrap(text, 11);
        const t = el('text', { x: c.x, y: c.y - ((lines.length - 1) * size * 1.1) / 2 + size * 0.35, 'text-anchor': 'middle', class: cls, 'font-size': size }, parent);
        lines.forEach((l, i) => {
            const s = el('tspan', { x: c.x, dy: i ? size * 1.1 : 0 }, t);
            s.textContent = l;
        });
    }

    /*
     * Draws the map into `container` (replacing its contents).
     * opts:
     *   view       'poster' (default) | 'terrain' (DM only; needs manifest.terrain)
     *   fog        bool - cover hexes for which cell(id) returns no `status`
     *   cell(id)   -> { status: 'K'|'E'|undefined, name, tint } describing what to show for a hex
     *   onClick(id, event)
     *   party      hex id to mark
     *   selected   hex id to outline
     *   badges(id) array of source badge keys to draw on a hex
     *   showAll    bool - draw every grid hex as clickable (DM)
     * Returns the svg element.
     */
    function render(container, map, opts) {
        opts = opts || {};
        const g = map.grid, cv = map.canvas;
        const base = map.base || '';
        container.textContent = '';
        const svg = el('svg', { viewBox: `0 0 ${cv.width} ${cv.height}`, class: 'hexmap', xmlns: NS }, container);

        const defs = el('defs', {}, svg);
        const blur = el('filter', { id: 'fogblur', x: '-10%', y: '-10%', width: '120%', height: '120%' }, defs);
        el('feGaussianBlur', { stdDeviation: opts.fogSoftness == null ? 7 : opts.fogSoftness }, blur);

        const terrainView = opts.view === 'terrain' && map.terrain;
        const bg = terrainView ? map.terrain.base : map.image;
        el('image', { href: base + bg, x: 0, y: 0, width: cv.width, height: cv.height }, svg);

        const cells = [];
        for (let col = 0; col < g.cols; col++)
            for (let row = 0; row < g.rows; row++)
                cells.push({ id: hexId(col, row), c: center(map, col, row) });

        if (terrainView) {
            const t = map.terrain, tg = el('g', {}, svg);
            cells.forEach(cell => {
                const kind = opts.terrainOf && opts.terrainOf(cell.id);
                if (!kind) return;
                el('image', {
                    href: base + t.tiles + kind + '.png',
                    x: cell.c.x - t.tileWidth / 2, y: cell.c.y - t.tileHeight / 2,
                    width: t.tileWidth, height: t.tileHeight
                }, tg);
            });
            if (t.overlay) el('image', { href: base + t.overlay, x: 0, y: 0, width: cv.width, height: cv.height }, svg);
        }

        const infoOf = id => (opts.cell && opts.cell(id)) || {};

        if (opts.fog) {
            // White = fogged, black = revealed; the mask is blurred so fog edges are soft.
            const mask = el('mask', { id: 'fogmask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: cv.width, height: cv.height }, defs);
            const mg = el('g', { filter: 'url(#fogblur)' }, mask);
            el('rect', { x: -50, y: -50, width: cv.width + 100, height: cv.height + 100, fill: '#fff' }, mg);
            cells.forEach(cell => {
                const st = infoOf(cell.id).status;
                // rumoured hexes are only partly lifted (grey = half fog)
                if (st) el('polygon', { points: points(map, cell.c, -4), fill: st === 'R' ? (opts.rumourFog || '#b8b8b8') : '#000' }, mg);
            });
            el('rect', { x: 0, y: 0, width: cv.width, height: cv.height, class: 'fog-hex', mask: 'url(#fogmask)', 'pointer-events': 'none' }, svg);
        }

        const hexes = el('g', { class: 'hexes' }, svg);
        cells.forEach(cell => {
            const info = infoOf(cell.id);
            const st = info.status;
            if (!opts.showAll && !st) return;
            const p = el('polygon', {
                points: points(map, cell.c, 1),
                class: 'hex' + (st ? ' s-' + st : '') + (opts.showAll ? ' hoverable' : '') + (opts.selected === cell.id ? ' selected' : ''),
                'data-hex': cell.id
            }, hexes);
            if (opts.onClick) p.addEventListener('click', e => opts.onClick(cell.id, e));
            if (opts.onContext) p.addEventListener('contextmenu', e => { e.preventDefault(); opts.onContext(cell.id, e); });
            if (st === 'E') {
                const ck = el('text', { x: cell.c.x, y: cell.c.y - g.hexHeight * 0.3, 'text-anchor': 'middle', class: 'check', 'font-size': 16, 'pointer-events': 'none' }, hexes);
                ck.textContent = '\u2713';
            }
            if (info.name || st === 'R') {
                const t = el('g', { 'pointer-events': 'none' }, hexes);
                label(t, cell.c, info.name || '?', 'hex-label' + (st ? ' s-' + st : ''), opts.labelSize || 12);
            }
        });

        // Small train icon for hexes with a confirmed Avernus Train Station stop
        if (opts.trainOf) {
            const tg = el('g', { class: 'train-icons', 'pointer-events': 'none' }, svg);
            cells.forEach(cell => {
                if (!opts.trainOf(cell.id)) return;
                const c = el('g', { transform: `translate(${cell.c.x + g.hexWidth * 0.34} ${cell.c.y - g.hexHeight * 0.02})`, class: 'train-icon' }, tg);
                el('circle', { r: 12 }, c);
                el('text', { x: 0, y: 5, 'text-anchor': 'middle', 'font-size': 15 }, c).textContent = '\uD83D\uDE82';
            });
        }

        // Pins: clickable points that are not on the grid (map.pins). Players only see a pin once it has a status.
        (map.pins || []).forEach(pin => {
            const info = infoOf(pin.id), st = info.status;
            if (!opts.showAll && !st) return;
            const g2 = el('g', { class: 'pin' + (st ? ' s-' + st : '') + (opts.selected === pin.id ? ' selected' : ''), transform: `translate(${pin.x} ${pin.y})`, 'data-hex': pin.id }, svg);
            el('circle', { r: 17, class: 'pin-bg' }, g2);
            el('path', { d: 'M-9,7 L0,-9 L9,7 Z', class: 'pin-tent' }, g2);
            const t = el('text', { x: 24, y: 4, class: 'hex-label' + (st ? ' s-' + st : ''), 'font-size': 12 }, g2);
            t.textContent = st === 'R' && info.name ? info.name : pin.name;   // rumoured pins show the rumour text
            if (opts.onClick) g2.addEventListener('click', e => opts.onClick(pin.id, e));
            if (opts.onContext) g2.addEventListener('contextmenu', e => { e.preventDefault(); opts.onContext(pin.id, e); });
        });

        // Source badges along the bottom of a hex: opts.badges(id) -> array of keys, e.g. ['B','D'] (styled by .badge-<key>)
        if (opts.badges) {
            const bg = el('g', { class: 'badges', 'pointer-events': 'none' }, svg);
            cells.forEach(cell => {
                const keys = opts.badges(cell.id) || [];
                const r = 7.5, gap = 2, w = keys.length * (2 * r + gap) - gap;
                keys.forEach((k, i) => {
                    const cx = cell.c.x - w / 2 + r + i * (2 * r + gap), cy = cell.c.y + g.hexHeight * 0.36;
                    el('circle', { cx, cy, r, class: 'badge badge-' + k }, bg);
                    const t = el('text', { x: cx, y: cy + 3.5, 'text-anchor': 'middle', class: 'badge-t', 'font-size': 10 }, bg);
                    t.textContent = k;
                });
            });
        }

        if (opts.party) {
            const pp = parseHex(opts.party);
            if (pp.col >= 0 && pp.col < g.cols && pp.row >= 0 && pp.row < g.rows) {
                const c = center(map, pp.col, pp.row);
                const m = el('g', { class: 'party', 'pointer-events': 'none' }, svg);
                el('circle', { cx: c.x, cy: c.y + g.hexHeight * 0.28, r: 9, class: 'party-dot' }, m);
                el('circle', { cx: c.x, cy: c.y + g.hexHeight * 0.28, r: 15, class: 'party-ring' }, m);
            }
        }
        return svg;
    }

    root.HexMaps = { register, get, list, load, render, hexId, parseHex, center };
})(window);
