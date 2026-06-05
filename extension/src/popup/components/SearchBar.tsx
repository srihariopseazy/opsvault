interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function SearchBar({ value, onChange }: Props) {
  return (
    <div style={{ position: 'relative', margin: '0 12px 8px' }}>
      <svg
        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}
        width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search vault…"
        style={{
          width: '100%',
          padding: '7px 10px 7px 30px',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          fontSize: 13,
          outline: 'none',
          background: '#fff',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
