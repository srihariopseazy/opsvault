import { useState, useCallback, useEffect } from 'react';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import { encryptWithKey, decryptWithKey } from '../../crypto/cryptoEngine';
import { vaultApi } from '../../api/vaultApi';
import { FolderResponse } from '../../api/foldersApi';
import { DecryptedVaultItem, CustomField } from '../../store/slices/vaultSlice';
import {
  ItemTypeFields,
  ItemFormData,
  defaultItemForm,
  formFromDecryptedItem,
  buildItemDataFromForm,
} from './ItemTypeFields';
import { PasswordGeneratorModal } from '../../pages/Generator';
import { generateTOTP, isValidTOTPSecret } from '../../utils/totp';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (item: DecryptedVaultItem, isNew: boolean) => void;
  editingItem?: DecryptedVaultItem | null;
  symmetricKey: string | null;
  folders: FolderResponse[];
}

// ── Custom field row ──────────────────────────────────────────────────────────

function CustomFieldRow({
  field,
  onUpdate,
  onDelete,
}: {
  field: CustomField;
  onUpdate: (f: CustomField) => void;
  onDelete: () => void;
}) {
  const [showValue, setShowValue] = useState(false);

  return (
    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
      <select
        value={field.type}
        onChange={(e) => onUpdate({ ...field, type: e.target.value as CustomField['type'] })}
        className="text-xs border-0 bg-transparent text-gray-600 focus:ring-0 focus:outline-none cursor-pointer py-0 px-0 w-20"
      >
        <option value="text">Text</option>
        <option value="hidden">Hidden</option>
        <option value="boolean">Boolean</option>
      </select>
      <input
        value={field.name}
        onChange={(e) => onUpdate({ ...field, name: e.target.value })}
        placeholder="Field name"
        className="flex-1 min-w-0 text-sm border-0 bg-transparent focus:ring-0 focus:outline-none placeholder-gray-300 py-0"
      />
      {field.type === 'boolean' ? (
        <button
          type="button"
          onClick={() => onUpdate({ ...field, value: field.value === 'true' ? 'false' : 'true' })}
          className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${
            field.value === 'true' ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition ${
            field.value === 'true' ? 'translate-x-3' : 'translate-x-0'
          }`} />
        </button>
      ) : (
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <input
            type={field.type === 'hidden' && !showValue ? 'password' : 'text'}
            value={field.value}
            onChange={(e) => onUpdate({ ...field, value: e.target.value })}
            placeholder="Value"
            className="flex-1 min-w-0 text-sm border-0 bg-transparent focus:ring-0 focus:outline-none placeholder-gray-300 py-0 font-mono"
          />
          {field.type === 'hidden' && (
            <button
              type="button"
              onClick={() => setShowValue((p) => !p)}
              className="text-gray-300 hover:text-gray-500 flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {showValue ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                ) : (
                  <>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </>
                )}
              </svg>
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="text-gray-300 hover:text-red-500 flex-shrink-0 transition-colors"
        title="Remove field"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── TOTP preview ──────────────────────────────────────────────────────────────

function TOTPPreview({ seed }: { seed: string }) {
  const [code, setCode] = useState('');
  const valid = isValidTOTPSecret(seed);

  useEffect(() => {
    if (!valid) { setCode(''); return; }
    let cancelled = false;
    const tick = async () => {
      const c = await generateTOTP(seed);
      if (!cancelled) setCode(c);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [seed, valid]);

  if (!valid || !code) return null;

  return (
    <span className="ml-2 font-mono text-sm font-semibold text-blue-600 tabular-nums">
      {code}
    </span>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function AddItemModal({ open, onClose, onSaved, editingItem, symmetricKey, folders }: Props) {
  const toast = useToast();
  const [form, setForm] = useState<ItemFormData>(defaultItemForm);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [saving, setSaving] = useState(false);
  const [genOpen, setGenOpen] = useState(false);

  // Populate form when editingItem changes
  useEffect(() => {
    if (editingItem) {
      setForm(formFromDecryptedItem(editingItem));
      setCustomFields(editingItem.customFields ? [...editingItem.customFields] : []);
    } else {
      setForm(defaultItemForm);
      setCustomFields([]);
    }
  }, [editingItem, open]);

  const handleChange = useCallback((field: keyof ItemFormData, value: string | boolean) => {
    setForm((p) => ({ ...p, [field]: value }));
  }, []);

  const addCustomField = () => {
    setCustomFields((prev) => [...prev, { type: 'text', name: '', value: '' }]);
  };

  const updateCustomField = (idx: number, updated: CustomField) => {
    setCustomFields((prev) => prev.map((f, i) => (i === idx ? updated : f)));
  };

  const removeCustomField = (idx: number) => {
    setCustomFields((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = useCallback(async () => {
    if (!symmetricKey) { toast.error('Vault is locked'); return; }
    if (!form.name.trim()) { toast.error('Name is required'); return; }

    setSaving(true);
    try {
      const itemData = buildItemDataFromForm(form);
      const encName  = await encryptWithKey(form.name, symmetricKey);
      const encNotes = form.notes ? await encryptWithKey(form.notes, symmetricKey) : null;
      const encData  = await encryptWithKey(JSON.stringify(itemData), symmetricKey);

      // Encrypt custom fields array
      const encCustomFields = customFields.length > 0
        ? await encryptWithKey(JSON.stringify(customFields), symmetricKey)
        : null;

      // Encrypt TOTP seed separately (for login items)
      const totpSeed = form.type === 'login' ? form.totp.trim() : '';
      const encTotpSecret = totpSeed
        ? await encryptWithKey(totpSeed, symmetricKey)
        : null;

      const payload = {
        type: form.type,
        name: encName,
        notes: encNotes || undefined,
        favorite: form.favorite,
        item_data: encData,
        custom_fields: encCustomFields,
        totp_secret: encTotpSecret,
        reprompt: false,
        folder_id: form.folderUuid || undefined,
      };

      if (editingItem) {
        const { data } = await vaultApi.updateItem(editingItem.uuid, payload);
        const decName  = await decryptWithKey(data.name, symmetricKey);
        const decNotes = data.notes ? await decryptWithKey(data.notes, symmetricKey) : undefined;
        const decData  = JSON.parse(await decryptWithKey(data.item_data as string, symmetricKey));

        let decCustomFields: CustomField[] | null = null;
        if (data.custom_fields) {
          try {
            const cfStr = await decryptWithKey(data.custom_fields, symmetricKey);
            decCustomFields = JSON.parse(cfStr) as CustomField[];
          } catch { decCustomFields = null; }
        }

        let decTotpSecret: string | undefined;
        if (data.totp_secret) {
          try { decTotpSecret = await decryptWithKey(data.totp_secret, symmetricKey); }
          catch { decTotpSecret = undefined; }
        }

        const updated: DecryptedVaultItem = {
          ...editingItem,
          name: decName,
          notes: decNotes,
          itemData: decData,
          customFields: decCustomFields,
          totpSecret: decTotpSecret,
          favorite: data.favorite,
          folderId: data.folder_id || undefined,
          updatedAt: data.updated_at,
          revisionDate: data.revision_date,
        };
        onSaved(updated, false);
        toast.success('Item updated');
      } else {
        const { data } = await vaultApi.createItem(payload);
        const decName  = await decryptWithKey(data.name, symmetricKey);
        const decNotes = data.notes ? await decryptWithKey(data.notes, symmetricKey) : undefined;
        const decData  = JSON.parse(await decryptWithKey(data.item_data as string, symmetricKey));

        let decCustomFields: CustomField[] | null = null;
        if (data.custom_fields) {
          try {
            const cfStr = await decryptWithKey(data.custom_fields, symmetricKey);
            decCustomFields = JSON.parse(cfStr) as CustomField[];
          } catch { decCustomFields = null; }
        }

        let decTotpSecret: string | undefined;
        if (data.totp_secret) {
          try { decTotpSecret = await decryptWithKey(data.totp_secret, symmetricKey); }
          catch { decTotpSecret = undefined; }
        }

        const newItem: DecryptedVaultItem = {
          uuid: data.uuid,
          type: data.type as DecryptedVaultItem['type'],
          name: decName,
          notes: decNotes,
          favorite: data.favorite,
          folderId: data.folder_id || undefined,
          itemData: decData,
          customFields: decCustomFields,
          totpSecret: decTotpSecret,
          reprompt: data.reprompt,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          revisionDate: data.revision_date,
        };
        onSaved(newItem, true);
        toast.success('Item added');
      }
      onClose();
    } catch (err: unknown) {
      console.error('[AddItemModal] save error:', err);
      const msg = (err as { message?: string })?.message || 'Failed to save item';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, customFields, editingItem, symmetricKey, onSaved, onClose]);

  const title = editingItem ? `Edit — ${editingItem.name}` : 'Add item';

  return (
    <>
      <Modal open={open} onClose={onClose} title={title}>
        <div className="space-y-4">
          {/* Type tabs — only show when creating */}
          {!editingItem && (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              {(['login', 'note', 'card', 'identity'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((p) => ({ ...defaultItemForm, name: p.name, folderUuid: p.folderUuid, type: t }))}
                  className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                    form.type === t
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Item name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Type-specific fields */}
          <ItemTypeFields
            form={form}
            onChange={handleChange}
            onGeneratePassword={() => setGenOpen(true)}
          />

          {/* TOTP preview (login items only, if seed entered) */}
          {form.type === 'login' && form.totp && (
            <div className="flex items-center gap-2 text-xs text-gray-500 -mt-2 px-1">
              <span>Preview:</span>
              <TOTPPreview seed={form.totp} />
              {!isValidTOTPSecret(form.totp) && (
                <span className="text-amber-500">Invalid base32 seed</span>
              )}
            </div>
          )}

          {/* Folder */}
          {folders.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Folder</label>
              <select
                value={form.folderUuid || 'none'}
                onChange={(e) => handleChange('folderUuid', e.target.value === 'none' ? '' : e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">No folder</option>
                {folders.map((f) => (
                  <option key={f.uuid} value={f.uuid}>{f.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              placeholder="Optional notes…"
            />
          </div>

          {/* Custom fields */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Custom fields</label>
              <button
                type="button"
                onClick={addCustomField}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add field
              </button>
            </div>
            {customFields.length > 0 && (
              <div className="space-y-2">
                {customFields.map((field, idx) => (
                  <CustomFieldRow
                    key={idx}
                    field={field}
                    onUpdate={(updated) => updateCustomField(idx, updated)}
                    onDelete={() => removeCustomField(idx)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Favorite */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.favorite}
              onChange={(e) => handleChange('favorite', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Mark as favorite</span>
          </label>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : (editingItem ? 'Update' : 'Save')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Password generator sub-modal */}
      <PasswordGeneratorModal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        onUse={(pw) => {
          handleChange('password', pw);
          setGenOpen(false);
        }}
      />
    </>
  );
}
