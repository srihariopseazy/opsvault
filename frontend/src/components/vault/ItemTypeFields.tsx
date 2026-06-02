import { useState } from 'react';
import { getPasswordStrength } from '../../utils/passwordUtils';

export interface ItemFormData {
  name: string;
  type: 'login' | 'note' | 'card' | 'identity';
  notes: string;
  favorite: boolean;
  folderUuid: string;
  // Login
  username: string;
  password: string;
  uri: string;
  totp: string;
  // Note
  noteContent: string;
  // Card
  cardName: string;
  cardNumber: string;
  cardExpMonth: string;
  cardExpYear: string;
  cardCvv: string;
  cardBrand: string;
  // Identity
  idTitle: string;
  idFirstName: string;
  idLastName: string;
  idEmail: string;
  idPhone: string;
  idAddress: string;
  idCity: string;
  idCountry: string;
}

export const defaultItemForm: ItemFormData = {
  name: '', type: 'login', notes: '', favorite: false, folderUuid: '',
  username: '', password: '', uri: '', totp: '',
  noteContent: '',
  cardName: '', cardNumber: '', cardExpMonth: '', cardExpYear: '', cardCvv: '', cardBrand: '',
  idTitle: '', idFirstName: '', idLastName: '', idEmail: '', idPhone: '',
  idAddress: '', idCity: '', idCountry: '',
};

export function formFromDecryptedItem(item: {
  name: string; type: string; notes?: string; favorite: boolean;
  folderId?: string; itemData: Record<string, unknown>;
}): ItemFormData {
  const d = item.itemData;
  const base: ItemFormData = {
    ...defaultItemForm,
    name: item.name,
    type: item.type as ItemFormData['type'],
    notes: item.notes || '',
    favorite: item.favorite,
    folderUuid: item.folderId || '',
  };
  switch (item.type) {
    case 'login':
      return {
        ...base,
        username: (d.username as string) || '',
        password: (d.password as string) || '',
        uri: (d.uris as Array<{ uri: string }>)?.[0]?.uri || '',
        totp: (d.totp as string) || '',
      };
    case 'note':
      return { ...base, noteContent: (d.content as string) || '' };
    case 'card':
      return {
        ...base,
        cardName: (d.cardholderName as string) || '',
        cardBrand: (d.brand as string) || '',
        cardNumber: (d.number as string) || '',
        cardExpMonth: (d.expMonth as string) || '',
        cardExpYear: (d.expYear as string) || '',
        cardCvv: (d.code as string) || '',
      };
    case 'identity':
      return {
        ...base,
        idTitle: (d.title as string) || '',
        idFirstName: (d.firstName as string) || '',
        idLastName: (d.lastName as string) || '',
        idEmail: (d.email as string) || '',
        idPhone: (d.phone as string) || '',
        idAddress: (d.address1 as string) || '',
        idCity: (d.city as string) || '',
        idCountry: (d.country as string) || '',
      };
  }
  return base;
}

export function buildItemDataFromForm(form: ItemFormData): Record<string, unknown> {
  switch (form.type) {
    case 'login':
      return {
        uris: [{ match: null, uri: form.uri }],
        username: form.username,
        password: form.password,
        totp: form.totp || null,
      };
    case 'note':
      return { content: form.noteContent };
    case 'card':
      return {
        cardholderName: form.cardName,
        brand: form.cardBrand,
        number: form.cardNumber,
        expMonth: form.cardExpMonth,
        expYear: form.cardExpYear,
        code: form.cardCvv,
      };
    case 'identity':
      return {
        title: form.idTitle,
        firstName: form.idFirstName,
        lastName: form.idLastName,
        email: form.idEmail,
        phone: form.idPhone,
        address1: form.idAddress,
        city: form.idCity,
        country: form.idCountry,
      };
  }
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

function Field({ label, value, onChange, type = 'text', placeholder, required, className = '' }: FieldProps) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );
}

interface Props {
  form: ItemFormData;
  onChange: (field: keyof ItemFormData, value: string | boolean) => void;
  onGeneratePassword?: () => void;
  readOnly?: boolean;
}

export function ItemTypeFields({ form, onChange, onGeneratePassword, readOnly = false }: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
  const strength = form.type === 'login' ? getPasswordStrength(form.password) : null;

  const o = (field: keyof ItemFormData) => (v: string) => onChange(field, v);

  if (readOnly) {
    // Read-only display mode
    return (
      <div className="space-y-3">
        {form.type === 'login' && (
          <>
            {form.username && <ReadField label="Username" value={form.username} />}
            {form.password && (
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Password</label>
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                  <span className="flex-1 font-mono text-sm">
                    {showPassword ? form.password : '••••••••••••'}
                  </span>
                  <button type="button" onClick={() => setShowPassword(p => !p)} className="text-gray-400 hover:text-gray-600">
                    {showPassword
                      ? <EyeOffIcon />
                      : <EyeIcon />}
                  </button>
                </div>
                {strength && (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-gray-100 rounded">
                      <div className={`h-1 rounded ${strength.color}`} style={{ width: `${strength.pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-400">{strength.label}</span>
                  </div>
                )}
              </div>
            )}
            {form.uri && <ReadField label="URL" value={form.uri} />}
            {form.totp && <ReadField label="TOTP seed" value={form.totp} />}
          </>
        )}
        {form.type === 'note' && form.noteContent && <ReadField label="Content" value={form.noteContent} multiline />}
        {form.type === 'card' && (
          <>
            {form.cardName && <ReadField label="Cardholder" value={form.cardName} />}
            {form.cardNumber && <ReadField label="Card number" value={`•••• •••• •••• ${form.cardNumber.slice(-4)}`} />}
            {(form.cardExpMonth || form.cardExpYear) && (
              <ReadField label="Expiry" value={`${form.cardExpMonth || '--'}/${form.cardExpYear || '--'}`} />
            )}
            {form.cardCvv && (
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">CVV</label>
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                  <span className="flex-1 font-mono text-sm">{showCvv ? form.cardCvv : '•••'}</span>
                  <button type="button" onClick={() => setShowCvv(p => !p)} className="text-gray-400 hover:text-gray-600">
                    {showCvv ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {form.type === 'identity' && (
          <>
            {form.idFirstName && <ReadField label="First name" value={form.idFirstName} />}
            {form.idLastName && <ReadField label="Last name" value={form.idLastName} />}
            {form.idEmail && <ReadField label="Email" value={form.idEmail} />}
            {form.idPhone && <ReadField label="Phone" value={form.idPhone} />}
            {form.idAddress && <ReadField label="Address" value={form.idAddress} />}
            {form.idCity && <ReadField label="City" value={form.idCity} />}
            {form.idCountry && <ReadField label="Country" value={form.idCountry} />}
          </>
        )}
      </div>
    );
  }

  // Editable mode
  return (
    <div className="space-y-3">
      {form.type === 'login' && (
        <>
          <Field label="Username" value={form.username} onChange={o('username')} placeholder="username@example.com" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => onChange('password', e.target.value)}
                  placeholder="Password"
                  className="w-full px-3 py-2 pr-9 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {onGeneratePassword && (
                <button
                  type="button"
                  onClick={onGeneratePassword}
                  className="px-2.5 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 text-xs font-medium whitespace-nowrap"
                  title="Generate password"
                >
                  Generate
                </button>
              )}
            </div>
            {strength && form.password && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${strength.color}`} style={{ width: `${strength.pct}%` }} />
                </div>
                <span className="text-xs text-gray-500 w-20 text-right">{strength.label}</span>
              </div>
            )}
          </div>
          <Field label="URL" value={form.uri} onChange={o('uri')} placeholder="https://example.com" />
          <Field label="TOTP seed (optional)" value={form.totp} onChange={o('totp')} placeholder="JBSWY3DPEHPK3PXP" />
        </>
      )}

      {form.type === 'note' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
          <textarea
            value={form.noteContent}
            onChange={(e) => onChange('noteContent', e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            placeholder="Secure note content…"
          />
        </div>
      )}

      {form.type === 'card' && (
        <>
          <Field label="Cardholder name" value={form.cardName} onChange={o('cardName')} placeholder="John Doe" />
          <Field label="Brand" value={form.cardBrand} onChange={o('cardBrand')} placeholder="Visa / Mastercard" />
          <Field label="Card number" value={form.cardNumber} onChange={o('cardNumber')} placeholder="4111 1111 1111 1111" />
          <div className="grid grid-cols-3 gap-3">
            <Field label="Exp month" value={form.cardExpMonth} onChange={o('cardExpMonth')} placeholder="12" />
            <Field label="Exp year" value={form.cardExpYear} onChange={o('cardExpYear')} placeholder="2027" />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CVV</label>
              <div className="relative">
                <input
                  type={showCvv ? 'text' : 'password'}
                  value={form.cardCvv}
                  onChange={(e) => onChange('cardCvv', e.target.value)}
                  placeholder="123"
                  className="w-full px-3 py-2 pr-9 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowCvv(p => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showCvv ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {form.type === 'identity' && (
        <>
          <Field label="Title" value={form.idTitle} onChange={o('idTitle')} placeholder="Mr / Ms / Dr" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" value={form.idFirstName} onChange={o('idFirstName')} placeholder="John" />
            <Field label="Last name" value={form.idLastName} onChange={o('idLastName')} placeholder="Doe" />
          </div>
          <Field label="Email" value={form.idEmail} onChange={o('idEmail')} placeholder="john@example.com" />
          <Field label="Phone" value={form.idPhone} onChange={o('idPhone')} placeholder="+1234567890" />
          <Field label="Address" value={form.idAddress} onChange={o('idAddress')} placeholder="123 Main St" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" value={form.idCity} onChange={o('idCity')} placeholder="New York" />
            <Field label="Country" value={form.idCountry} onChange={o('idCountry')} placeholder="US" />
          </div>
        </>
      )}
    </div>
  );
}

function ReadField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {multiline ? (
        <p className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 break-all">{value}</p>
      )}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}
