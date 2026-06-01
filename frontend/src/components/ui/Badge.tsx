interface BadgeProps {
  label: string;
  variant?: 'blue' | 'green' | 'purple' | 'orange' | 'gray' | 'red';
}

const COLORS: Record<NonNullable<BadgeProps['variant']>, string> = {
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
  gray: 'bg-gray-100 text-gray-600',
  red: 'bg-red-100 text-red-700',
};

export function Badge({ label, variant = 'gray' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${COLORS[variant]}`}>
      {label}
    </span>
  );
}
