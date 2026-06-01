interface FormFieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
  hint?: string;
}

export function FormField({ label, error, children, hint }: FormFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
