"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"

import { Calendar } from "@/components/ui/calendar"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "cn"

function formatDate(date: Date | undefined) {
  if (!date || isNaN(date.getTime())) {
    return ""
  }

  return date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

function parseDate(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return undefined
  }

  const parsed = new Date(trimmed)
  return isNaN(parsed.getTime()) ? undefined : parsed
}

interface DatePickerProps {
  id: string
  label: string
  value?: Date
  onChange?: (date: Date | undefined) => void
  minDate?: Date
  placeholder?: string
  className?: string
}

function DatePicker({
  id,
  label,
  value,
  onChange,
  minDate,
  placeholder = "Select date",
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState(() => formatDate(value))
  const [month, setMonth] = React.useState<Date | undefined>(value)

  const lastValue = React.useRef(value)

  React.useEffect(() => {
    if (lastValue.current !== value) {
      lastValue.current = value
      setText(formatDate(value))
    }
  }, [value])

  function handleSelect(next: Date | undefined) {
    onChange?.(next)
    setText(formatDate(next))
    setOpen(false)
  }

  return (
    <Field className={cn("w-full", className)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>

        <InputGroupInput
          id={id}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            const nextText = e.target.value
            setText(nextText)

            const parsed = parseDate(nextText)

            if (nextText.trim() === "") {
              onChange?.(undefined)
              return
            }

            if (parsed) {
              onChange?.(parsed)
              setMonth(parsed)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setOpen(true)
            }
            if (e.key === "Escape" && open) {
              e.preventDefault()
              setOpen(false)
            }
          }}
        />
        <InputGroupAddon align="inline-end">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              render={
                <InputGroupButton
                  id={`${id}-trigger`}
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Select date"
                  tabIndex={-1}
                >
                  <CalendarIcon />
                </InputGroupButton>
              }
            />
            <PopoverContent
              className="w-auto overflow-hidden p-0"
              align="end"
              alignOffset={-8}
              sideOffset={10}
            >
              <Calendar
                mode="single"
                selected={value}
                month={month}
                onMonthChange={setMonth}
                disabled={minDate ? { before: minDate } : undefined}
                onSelect={handleSelect}
              />
            </PopoverContent>
          </Popover>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  )
}

export { DatePicker }
export type { DatePickerProps }
