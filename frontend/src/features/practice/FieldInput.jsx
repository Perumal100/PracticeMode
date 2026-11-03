// US-11 AC-01: one supported input control per extracted field.
import { Checkbox, Input, NativeSelect, Textarea } from '@/components/ui/input.jsx';

const INPUT_TYPES = { text: 'text', email: 'email', tel: 'tel', url: 'url', number: 'number', date: 'date' };

export default function FieldInput({ field, value, disabled, invalid, onChange, onBlur, describedBy }) {
  const id = `field-${field.id}`;
  const common = {
    id,
    disabled,
    onBlur,
    'aria-describedby': describedBy,
    'aria-required': field.required || undefined,
    'aria-invalid': invalid || undefined,
  };
  // An empty control means "unanswered", which the API stores as null.
  const emit = (raw) => onChange(raw === '' ? null : raw);

  if (field.input_type === 'checkbox') {
    return <Checkbox {...common} checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (field.input_type === 'textarea') {
    return <Textarea {...common} rows={4} value={value ?? ''} onChange={(e) => emit(e.target.value)} />;
  }
  if (field.input_type === 'select') {
    const options = field.validation?.allowedValues ?? [];
    return (
      <NativeSelect {...common} value={value ?? ''} onChange={(e) => emit(e.target.value)}>
        <option value="">Choose…</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </NativeSelect>
    );
  }
  const type = INPUT_TYPES[field.input_type] ?? 'text';
  return (
    <Input
      {...common}
      type={type}
      inputMode={type === 'number' ? 'decimal' : undefined}
      placeholder={type === 'url' ? 'https://' : undefined}
      className={type === 'date' ? 'w-auto' : undefined}
      value={value ?? ''}
      onChange={(e) => emit(e.target.value)}
    />
  );
}
