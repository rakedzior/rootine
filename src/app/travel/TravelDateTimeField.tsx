import { HALF_HOUR_TIME_OPTIONS } from "../data/timeOptions";
import { DatePicker, TimePicker } from "../ui";
import { clampTimeToDateRange, joinLocalDateTime, splitLocalDateTime } from "./travelDateTime";

interface TravelDateTimeFieldProps {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}

/**
 * Travel-specific composition that keeps the persisted local datetime format
 * (`YYYY-MM-DDTHH:mm`) while using the shared date and time engines.
 */
export function TravelDateTimeField({ label, value, min, max, onChange }: TravelDateTimeFieldProps) {
  const current = splitLocalDateTime(value);
  const minimum = splitLocalDateTime(min ?? "");
  const maximum = splitLocalDateTime(max ?? "");
  const timeMin = current.date && current.date === minimum.date ? minimum.time || undefined : undefined;
  const timeMax = current.date && current.date === maximum.date ? maximum.time || undefined : undefined;

  return (
    <fieldset className="travel-form__datetime-field">
      <legend>{label}</legend>
      <div className="travel-form__datetime-controls">
        <DatePicker
          label="Data"
          value={current.date}
          min={minimum.date || undefined}
          max={maximum.date || undefined}
          onChange={(date) => {
            if (!date) {
              onChange("");
              return;
            }
            onChange(joinLocalDateTime(date, clampTimeToDateRange(date, current.time, min, max)));
          }}
        />
        <TimePicker
          label="Godzina"
          value={current.time}
          min={timeMin}
          max={timeMax}
          options={HALF_HOUR_TIME_OPTIONS}
          disabled={!current.date}
          onChange={(time) => onChange(joinLocalDateTime(current.date, time))}
        />
      </div>
    </fieldset>
  );
}
