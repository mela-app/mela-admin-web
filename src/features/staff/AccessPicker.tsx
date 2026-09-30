import { Segmented } from '../../components/ui/forms'
import { ACCESS_AREAS, levelOf, withAccessLevel } from '../../lib/permissions'
import type { AdminPermission } from '../../lib/types'

const NONE = 'none'

interface AccessPickerProps {
  value: AdminPermission[]
  onChange: (next: AdminPermission[]) => void
  disabled?: boolean
}

/** A platform moderator's access, one level per area of the console. Nothing is given until chosen. */
export function AccessPicker({ value, onChange, disabled = false }: AccessPickerProps) {
  return (
    <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
      {ACCESS_AREAS.map((area) => {
        const level = levelOf(area, value)
        return (
          <li key={area.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-900">{area.label}</p>
              <p className="text-xs text-zinc-500">{level?.description ?? 'Hidden from them.'}</p>
            </div>
            <Segmented
              label={area.label}
              value={level?.value ?? NONE}
              options={[
                { value: NONE, label: 'None', disabled },
                ...area.levels.map((each) => ({ value: each.value, label: each.label, disabled })),
              ]}
              onChange={(next) =>
                onChange(withAccessLevel(value, area, area.levels.find((each) => each.value === next) ?? null))
              }
            />
          </li>
        )
      })}
    </ul>
  )
}
