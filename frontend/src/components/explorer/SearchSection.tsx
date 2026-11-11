import { useEffect, useRef, useState, type FormEvent } from "react";
import { EXAMPLE_POSITIONS } from "../../data/irsaSnapshot";
import {
  FIELD_ORDER,
  validateSearch,
  type FieldName,
  type SearchFormErrors,
  type SearchFormValues,
} from "../../lib/validation";
import type { SearchParams } from "../../services/provider";
import type { DataMode } from "../../types/observation";
import { ModeChip } from "../ModeChip";
import { Reveal } from "../Reveal";
import { SectionHeader } from "../SectionHeader";

type SearchSectionProps = {
  values: SearchFormValues;
  onValuesChange: (next: SearchFormValues) => void;
  onSearch: (params: SearchParams) => void;
  busy: boolean;
  mode: DataMode;
};

const FIELD_IDS: Record<FieldName, string> = {
  ra: "search-ra",
  dec: "search-dec",
  startDate: "search-start",
  endDate: "search-end",
};
const FIELD_NAMES: Record<FieldName, string> = {
  ra: "Right ascension",
  dec: "Declination",
  startDate: "Start date",
  endDate: "End date",
};

export function SearchSection({
  values,
  onValuesChange,
  onSearch,
  busy,
  mode,
}: SearchSectionProps) {
  const [showErrors, setShowErrors] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);

  const { errors, params } = validateSearch(values);
  const visible: SearchFormErrors = showErrors ? errors : {};
  const errorFields = FIELD_ORDER.filter((field) => visible[field]);

  // After a failed submit, move focus to the error summary so keyboard and screen-reader users hear it.
  useEffect(() => {
    if (attempt > 0) summaryRef.current?.focus();
  }, [attempt]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setShowErrors(true);
    if (params === null) {
      setAttempt((n) => n + 1);
      return;
    }
    onSearch(params);
  };

  const set = (field: FieldName, value: string) =>
    onValuesChange({ ...values, [field]: value });

  const fieldProps = (field: FieldName) => ({
    id: FIELD_IDS[field],
    className: "input",
    value: values[field],
    onChange: (event: { target: { value: string } }) =>
      set(field, event.target.value),
    "aria-invalid": visible[field] ? (true as const) : undefined,
    "aria-describedby": visible[field]
      ? `${FIELD_IDS[field]}-error`
      : undefined,
  });

  const errorLine = (field: FieldName) =>
    visible[field] ? (
      <p className="field-error" id={`${FIELD_IDS[field]}-error`}>
        {visible[field]}
      </p>
    ) : null;

  return (
    <Reveal id="find">
      <SectionHeader
        eyebrow="Saved archive"
        title="Find observations"
        chip={<ModeChip mode={mode} />}
      />
      <div className="card">
        <form
          className="form"
          onSubmit={handleSubmit}
          noValidate
          aria-label="Search for observations"
        >
          <div className="field">
            <label htmlFor="search-ra">
              Right ascension <i>(degrees)</i>
            </label>
            <input
              {...fieldProps("ra")}
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="field-hint">0 up to, not including, 360</p>
            {errorLine("ra")}
          </div>
          <div className="field">
            <label htmlFor="search-dec">
              Declination <i>(degrees)</i>
            </label>
            <input
              {...fieldProps("dec")}
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="field-hint">{"\u2212"}90 to 90</p>
            {errorLine("dec")}
          </div>
          <div className="field">
            <label htmlFor="search-start">Start date</label>
            <input {...fieldProps("startDate")} type="date" />
            <p className="field-hint">Processed on or after</p>
            {errorLine("startDate")}
          </div>
          <div className="field">
            <label htmlFor="search-end">End date</label>
            <input {...fieldProps("endDate")} type="date" />
            <p className="field-hint">Processed on or before</p>
            {errorLine("endDate")}
          </div>
          <div className="form-submit">
            <button className="btn btn-p" type="submit" disabled={busy}>
              {busy ? "Searching\u2026" : "Find observations"}
            </button>
          </div>
        </form>

        {errorFields.length > 0 ? (
          <div
            className="err-summary"
            role="alert"
            tabIndex={-1}
            ref={summaryRef}
          >
            <strong>
              Please fix{" "}
              {errorFields.length === 1 ? "this field" : "these fields"} and
              search again:
            </strong>
            <ul>
              {errorFields.map((field) => (
                <li key={field}>
                  <button
                    type="button"
                    onClick={() =>
                      document.getElementById(FIELD_IDS[field])?.focus()
                    }
                  >
                    {FIELD_NAMES[field]}
                  </button>
                  : {visible[field]}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="examples">
          <span id="examples-label">Try a position:</span>
          <div className="pills" role="group" aria-labelledby="examples-label">
            {EXAMPLE_POSITIONS.map((example) => (
              <button
                key={example.label}
                type="button"
                className="pill"
                onClick={() =>
                  onValuesChange({
                    ...values,
                    ra: String(example.position.raDeg),
                    dec: String(example.position.decDeg),
                  })
                }
              >
                {example.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Reveal>
  );
}
