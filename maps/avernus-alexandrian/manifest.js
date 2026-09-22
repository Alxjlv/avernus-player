// Alexandrian Remix hexmap, draped over the Avernus poster map.
// Grid values reproduce the original DiA-dynMap CSS layout (81px hexes on a 1292.4px wide canvas).
// To enlarge the grid: raise cols/rows and shrink hexWidth/hexHeight/colPitch/rowPitch/oddColOffset by the
// same factor (hexWidth = 2*size, hexHeight = ~1.71*size, colPitch = 1.5*size, rowPitch = hexHeight + gap,
// oddColOffset = rowPitch/2), then move originX/originY so hex a1 lands where you want it.
HexMaps.register({
    id: 'avernus-alexandrian',
    name: 'Avernus - Alexandrian Remix (poster map)',
    base: '../maps/avernus-alexandrian/',      // path from dm/ and player/ to this folder
    image: 'map.jpg',
    canvas: { width: 1292.4, height: 918 },
    grid: {
        cols: 10, rows: 6,
        hexWidth: 162, hexHeight: 138.6,
        colPitch: 121, rowPitch: 140.6, oddColOffset: 70.2,
        originX: 86.7, originY: 80.3            // centre of hex a1
    },
    pins: [                                     // clickable points that are not on the hex grid (id = data.js entry)
        { id: 'emporium', name: 'Emporium', x: 40, y: 890 },
        { id: 'train', name: 'Train', x: 1175, y: 46 }
    ],
    terrain: {                                  // optional DM-only terrain view
        base: 'lower.png', overlay: 'upper.png', tiles: 'tiles/',
        tileWidth: 169.5, tileHeight: 145
    }
});
