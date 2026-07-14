import { useNumericDraft } from '../hooks/useNumericDraft.js';

// A labelled number/text input with a $ or % prefix, used all over the app.
//
// Number fields render as type="text" driven by useNumericDraft, which gives
// live thousands separators while typing, sane clearing/decimal behavior, and
// "120k" shorthand on blur. Arrow keys step by `step`; min/max clamp on blur.
//
// `allowEmpty` controls what happens when the user clears the field:
//   - false (default): empty becomes 0 (so downstream math doesn't break)
//   - true: empty stays as '' (used for fields where blank means "auto")
//
// `commas` (default true) can be turned off for fields like years where
// "2,026" would look wrong.
export default function NumberField({
  label,
  hint,
  prefix,
  suffix,
  value,
  onChange,
  step = 1,
  min,
  max,
  type = 'number',
  placeholder,
  allowEmpty = false,
  commas = true,
  id,
}) {
  const { inputProps } = useNumericDraft({
    value,
    onChange,
    min,
    max,
    step,
    allowEmpty,
    commas,
  });

  const handleTextKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const input =
    type === 'number' ? (
      <input className="input" id={id} placeholder={placeholder} {...inputProps} />
    ) : (
      <input
        className="input"
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleTextKeyDown}
        enterKeyHint="done"
        placeholder={placeholder}
      />
    );

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {prefix ? (
        <div className="input-prefix" data-prefix={prefix}>
          {input}
        </div>
      ) : (
        input
      )}
      {suffix && <div className="hint">{suffix}</div>}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
