// A labelled number/text input with a $ or % prefix, used in the advanced
// inputs section.
//
// `allowEmpty` controls what happens when the user clears the field:
//   - false (default): empty becomes 0 (so downstream math doesn't break)
//   - true: empty stays as '' (used for fields where blank means "auto")
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
}) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const inputMode = type === 'number' ? 'decimal' : undefined;

  const handle = (e) => {
    const v = e.target.value;
    if (type === 'number') {
      if (v === '') {
        onChange(allowEmpty ? '' : 0);
      } else {
        onChange(Number(v));
      }
    } else {
      onChange(v);
    }
  };

  return (
    <div className="field">
      <label>{label}</label>
      {prefix ? (
        <div className="input-prefix" data-prefix={prefix}>
          <input
            className="input"
            type={type}
            value={value}
            onChange={handle}
            onKeyDown={handleKeyDown}
            inputMode={inputMode}
            enterKeyHint="done"
            step={step}
            min={min}
            max={max}
            placeholder={placeholder}
          />
        </div>
      ) : (
        <input
          className="input"
          type={type}
          value={value}
          onChange={handle}
          onKeyDown={handleKeyDown}
          inputMode={inputMode}
          enterKeyHint="done"
          step={step}
          min={min}
          max={max}
          placeholder={placeholder}
        />
      )}
      {suffix && <div className="hint">{suffix}</div>}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
