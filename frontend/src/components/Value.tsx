type ValueProps = {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
};

// Use inside <dl className="value-list">.
// 0 is a real value and is shown as 0. null/undefined/"" means "Not available".
export function Value({ label, value, unit }: ValueProps) {
  const missing = value === null || value === undefined || value === '';
  return (
    <div className="value-row">
      <dt>{label}</dt>
      <dd>
        {missing ? (
          <span className="unavailable">Not available</span>
        ) : (
          <>
            {value}
            {unit ? ` ${unit}` : ''}
          </>
        )}
      </dd>
    </div>
  );
}