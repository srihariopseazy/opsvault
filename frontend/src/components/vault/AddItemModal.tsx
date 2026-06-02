import { useState, useCallback, useEffect } from 'react';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import { encryptWithKey, decryptWithKey } from '../../crypto/cryptoEngine';
import { vaultApi } from '../../api/vaultApi';
import { FolderResponse } from '../../api/foldersApi';
import { DecryptedVaultItem } from '../../store/slices/vaultSlice';
import {
  ItemTypeFields,
  ItemFormData,
  defaultItemForm,
  formFromDecryptedItem,
  buildItemDataFromForm,
} from './ItemTypeFields';
import { PasswordGeneratorModal } from '../../pages/Generator';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (item: DecryptedVaultItem, isNew: boolean) => void;
  editingItem?: DecryptedVaultItem | null;
  symmetricKey: string | null;
  folders: FolderResponse[];
}

export function AddItemModal({ open, onClose, onSaved, editingItem, symmetricKey, folders }: Props) {
  const toast = useToast();
  const [form, setForm] = useState<ItemFormData>(defaultItemForm);
  const [saving, setSaving] = useState(false);
  const [genOpen, setGenOpen] = useState(false);

  // Populate form when editingItem changes
  useEffect(() => {
    if (editingItem) {
      setForm(formFromDecryptedItem(editingItem));
    } else {
      setForm(defaultItemForm);
    }
  }, [editingItem, open]);

  const handleChange = useCallback((field: keyof ItemFormData, value: string | boolean) => {
    setForm((p) => ({ ...p, [field]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!symmetricKey) { toast.error('Vault is locked'); return; }
    if (!form.name.trim()) { toast.error('Name is required'); return; }

    setSaving(true);
    try {
      const itemData = buildItemDataFromForm(form);
      const encName = await encryptWithKey(form.name, symmetricKey);
      const encNotes = form.notes ? await encryptWithKey(form.notes, symmetricKey) : null;
      const encData = await encryptWithKey(JSON.stringify(itemData), symmetricKey);

      const payload = {
        type: form.type,
        name: encName,
        notes: encNotes || undefined,
        favorite: form.favorite,
        item_data: encData,
        reprompt: false,
        folder_id: form.folderUuid || undefined,
      };

      if (editingItem) {
        const { data } = await vaultApi.updateItem(editingItem.uuid, payload);
        const decName = await decryptWithKey(data.name, symmetricKey);
        const decNotes = data.notes ? await decryptWithKey(data.notes, symmetricKey) : undefined;
        const decData = JSON.parse(await decryptWithKey(data.item_data as string, symmetricKey));
        const updated: DecryptedVaultItem = {
          ...editingItem,
          name: decName,
          notes: decNotes,
          itemData: decData,
          favorite: data.favorite,
          folderId: data.folder_id || undefined,
          updatedAt: data.updated_at,
          revisionDate: data.revision_date,
        };
        onSaved(updated, false);
        toast.success('Item updated');
      } else {
        const { data } = await vaultApi.createItem(payload);
        const decName = await decryptWithKey(data.name, symmetricKey);
        const decNotes = data.notes ? await decryptWithKey(data.notes, symmetricKey) : undefined;
        const decData = JSON.parse(await decryptWithKey(data.item_data as string, symmetricKey));
        const newItem: DecryptedVaultItem = {
          uuid: data.uuid,
          type: data.type as DecryptedVaultItem['type'],
          name: decName,
          notes: decNotes,
          favorite: data.favorite,
          folderId: data.folder_id || undefined,
          itemData: decData,
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
  }, [form, editingItem, symmetricKey, onSaved, onClose]);

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

