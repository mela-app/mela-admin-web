// The Mela mark, as geometry: one monoline "M" that starts at a node on the
// right stem, traces the letter, and leaves as an arrow pointing up and to
// the right. Every logo, icon and in-app painter is generated from this.
//
// Units: the letter's centreline spans x 0..192, y 0..168; the line is
// `stroke` wide, so ink reaches stroke/2 beyond that. The node and the arrow
// head scale with the stroke, so a heavier cut for small icons stays in
// proportion.

export const STROKE = 14;

// A bold M's outline, as the centreline of the drawn stroke. Stems are W
// apart; the diagonals run at slope M_SLOPE with the same thickness W.
const X = 192;
const H = 168;
const W = 34;
const FLAT = 42; // the flat top of each arch, from the outer edge
const NOTCH = 80; // how deep the V between the arches reaches from the top
const M_SLOPE = NOTCH / (X / 2 - FLAT);
const STEM_TOP = W * Math.hypot(1, M_SLOPE) - M_SLOPE * (FLAT - W); // where a stem's inner edge meets its diagonal
const V_BOTTOM = STEM_TOP + M_SLOPE * (X / 2 - W);

const up = normalise([X / 2 - W, -(V_BOTTOM - STEM_TOP)]); // the right inner diagonal, going up

const point = (x, y) => ({ x, y });

// [vertex, corner radius]; the first and last points are line ends.
const LINE = [
  [point(X - W, 112), 0], // the node
  [point(X - W, H), W / 2],
  [point(X, H), W / 2],
  [point(X, 0), 18],
  [point(X - FLAT, 0), 10],
  [point(X / 2, NOTCH), 8],
  [point(FLAT, 0), 10],
  [point(0, 0), 18],
  [point(0, H), W / 2],
  [point(W, H), W / 2],
  [point(W, STEM_TOP), 10],
  [point(X / 2, V_BOTTOM), 8],
  [along(point(X / 2, V_BOTTOM), up, 26), 0], // where the line turns into the arrow
];

export const node = LINE[0][0];
const arrowStart = LINE[LINE.length - 1][0];
const ARROW_LENGTH = 144; // from the V bottom to the tip
const arrowTip = along(point(X / 2, V_BOTTOM), up, ARROW_LENGTH);
const across = [-up[1], up[0]];

/** The line, as path commands: ['M', x, y] | ['L', x, y] | ['Q', cx, cy, x, y]. */
export const lineCommands = roundedPolyline(LINE);

/**
 * Everything that depends on the stroke weight: the node's radius, the
 * arrow's shaft (a stroked line) and head (a filled triangle), and the ink
 * bounds for a snug viewBox.
 */
export function markAt(stroke = STROKE) {
  const headLength = stroke * (30 / 14);
  const headHalfWidth = stroke * (15 / 14);
  const headBase = along(arrowTip, up, -headLength);
  const half = stroke / 2;
  return {
    stroke,
    nodeRadius: stroke * (10 / 14),
    line: lineCommands,
    shaft: [
      ['M', arrowStart.x, arrowStart.y],
      ['L', headBase.x + up[0] * 1.5, headBase.y + up[1] * 1.5], // overlaps the head so no seam shows
    ],
    head: [
      ['M', arrowTip.x, arrowTip.y],
      ['L', headBase.x + across[0] * headHalfWidth, headBase.y + across[1] * headHalfWidth],
      ['L', headBase.x - across[0] * headHalfWidth, headBase.y - across[1] * headHalfWidth],
      ['Z'],
    ],
    // The head's corners are softened with a thin stroke of its own colour.
    headRounding: stroke * (3 / 14),
    bounds: { minX: -half, minY: -half, maxX: X + half, maxY: H + half },
  };
}

export function toSvgPath(commands, digits = 2) {
  const n = (value) => Number(value.toFixed(digits));
  return commands
    .map(([op, ...args]) => (op === 'Z' ? 'Z' : `${op}${args.map(n).join(' ')}`))
    .join(' ');
}

function roundedPolyline(points) {
  const commands = [['M', points[0][0].x, points[0][0].y]];
  for (let i = 1; i < points.length - 1; i++) {
    const [vertex, radius] = points[i];
    const previous = points[i - 1][0];
    const next = points[i + 1][0];
    const r = Math.min(radius, distance(vertex, previous) / 2, distance(vertex, next) / 2);
    const from = towards(vertex, previous, r);
    const to = towards(vertex, next, r);
    commands.push(['L', from.x, from.y], ['Q', vertex.x, vertex.y, to.x, to.y]);
  }
  const last = points[points.length - 1][0];
  commands.push(['L', last.x, last.y]);
  return commands;
}

function towards(from, to, length) {
  const d = distance(from, to);
  return point(from.x + ((to.x - from.x) / d) * length, from.y + ((to.y - from.y) / d) * length);
}

function along(from, direction, length) {
  return point(from.x + direction[0] * length, from.y + direction[1] * length);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalise([x, y]) {
  const length = Math.hypot(x, y);
  return [x / length, y / length];
}
