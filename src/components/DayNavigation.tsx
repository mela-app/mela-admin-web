import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays } from '../lib/format'
import { Button, IconButton } from './ui/Button'
import { Input } from './ui/forms'

interface DayNavigationProps {
  /** The day shown, as an `<input type="date">` value. */
  day: string
  today: string
  onChange: (day: string) => void
}

/** Previous and next day, a date picker, and a way back to today - never past it. */
export function DayNavigation({ day, today, onChange }: DayNavigationProps) {
  const isToday = day === today
  return (
    <>
      <div className="flex items-center gap-1">
        <IconButton label="Previous day" onClick={() => onChange(addDays(day, -1))}>
          <ChevronLeft />
        </IconButton>
        <Input
          type="date"
          aria-label="Day"
          className="w-40"
          value={day}
          max={today}
          onChange={(event) => {
            if (event.target.value) onChange(event.target.value)
          }}
        />
        <IconButton label="Next day" disabled={isToday} onClick={() => onChange(addDays(day, 1))}>
          <ChevronRight />
        </IconButton>
      </div>
      {!isToday && (
        <Button variant="ghost" size="sm" onClick={() => onChange(today)}>
          Today
        </Button>
      )}
    </>
  )
}
