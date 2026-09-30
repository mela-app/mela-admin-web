import { formatNumber } from '../lib/format'

interface DailyPoint {
  day: string
  [series: string]: number | string
}

interface SeriesSpec {
  key: string
  label: string
  /** A Tailwind fill class. */
  fill: string
  /** The same colour for the legend swatch. */
  swatch: string
}

interface DailyBarsProps {
  data: DailyPoint[]
  series: SeriesSpec[]
  label: string
}

const dayLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

function niceCeiling(value: number): number {
  if (value <= 4) return 4
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const steps = [1, 2, 2.5, 5, 10]
  const step = steps.find((candidate) => candidate * magnitude >= value) ?? 10
  return step * magnitude
}

/** Grouped bars per day - drawn as plain SVG, with the same numbers in a table for screen readers. */
export function DailyBars({ data, series, label }: DailyBarsProps) {
  const width = 720
  const height = 220
  const pad = { top: 12, right: 8, bottom: 26, left: 34 }
  const plotWidth = width - pad.left - pad.right
  const plotHeight = height - pad.top - pad.bottom
  const values = data.flatMap((point) => series.map((spec) => Number(point[spec.key]) || 0))
  const top = niceCeiling(Math.max(0, ...values))
  const ticks = [0, top / 2, top]
  const group = plotWidth / Math.max(1, data.length)
  const barWidth = Math.max(3, Math.min(12, (group - 8) / series.length))
  const y = (value: number) => pad.top + plotHeight - (value / top) * plotHeight

  return (
    <figure>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-zinc-600">
        {series.map((spec) => (
          <span key={spec.key} className="inline-flex items-center gap-1.5">
            <span className={`size-2.5 rounded-sm ${spec.swatch}`} aria-hidden />
            {spec.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={label}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-zinc-200"
              strokeDasharray={tick === 0 ? undefined : '3 4'}
            />
            <text x={pad.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-zinc-400 text-[11px] tabular-nums">
              {formatNumber(tick)}
            </text>
          </g>
        ))}
        {data.map((point, index) => {
          const groupStart = pad.left + index * group + (group - barWidth * series.length - 2 * (series.length - 1)) / 2
          const date = new Date(`${point.day}T00:00:00Z`)
          return (
            <g key={point.day}>
              {series.map((spec, seriesIndex) => {
                const value = Number(point[spec.key]) || 0
                const barHeight = Math.max(value > 0 ? 2 : 0, (value / top) * plotHeight)
                return (
                  <rect
                    key={spec.key}
                    x={groupStart + seriesIndex * (barWidth + 2)}
                    y={pad.top + plotHeight - barHeight}
                    width={barWidth}
                    height={barHeight}
                    rx={2}
                    className={spec.fill}
                  >
                    <title>{`${dayLabel.format(date)}: ${formatNumber(value)} ${spec.label.toLowerCase()}`}</title>
                  </rect>
                )
              })}
              {(data.length - 1 - index) % 2 === 0 && (
                <text
                  x={pad.left + index * group + group / 2}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-zinc-400 text-[11px]"
                >
                  {dayLabel.format(date)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {series.map((spec) => (
              <th key={spec.key} scope="col">
                {spec.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.day}>
              <th scope="row">{dayLabel.format(new Date(`${point.day}T00:00:00Z`))}</th>
              {series.map((spec) => (
                <td key={spec.key}>{formatNumber(Number(point[spec.key]) || 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
