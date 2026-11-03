// US-11 AC-01: one supported input control per extracted field.
const INPUT_TYPES = { text: 'text', email: 'email', tel: 'tel', number: 'number', date: 'date' };

export default function FieldInput({ field, value, disabled, onChange, onBlur, describedBy }) {
  const id = `field-${field.id}`;
  const common = { id, disabled, onBlur, 'aria-describedby': describedBy, 'aria-required': field.required || undefined };
  // An empty control means "unanswered", which the API stores as null.
  const emit = (raw) => onChange(raw === '' ? null : raw);

  if (field.input_type === 'checkbox') {
    return <input {...common} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (field.input_type === 'textarea') {
    return <textarea {...common} rows={4} value={value ?? ''} onChange={(e) => emit(e.target.value)} />;
  }
  if (field.input_type === 'select') {
    const options = field.validation?.allowedValues ?? [];
    return (
      <select {...common} value={value ?? ''} onChange={(e) => emit(e.target.value)}>
        <option value="">Choose…</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }
  const type = INPUT_TYPES[field.input_type] ?? 'text';
  return <input {...common} type={type} value={value ?? ''} onChange={(e) => emit(e.target.value)} />;
}
