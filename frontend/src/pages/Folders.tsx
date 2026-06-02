import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { foldersApi, FolderResponse } from '../api/foldersApi';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import { ROUTES } from '../utils/constants';

export default function Folders() {
  const toast = useToast();
  const navigate = useNavigate();
  const [folders, setFolders] = useState<FolderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderResponse | null>(null);
  const [folderName, setFolderName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingUuid, setDeletingUuid] = useState<string | null>(null);

  const fetchFolders = useCallback(async () => {
    try {
      const { data } = await foldersApi.listFolders();
      setFolders(data);
    } catch {
      toast.error('Failed to load folders');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchFolders(); }, [fetchFolders]);

  const openCreate = () => {
    setEditingFolder(null);
    setFolderName('');
    setModalOpen(true);
  };

  const openEdit = (folder: FolderResponse) => {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setModalOpen(true);
  };

  const handleSave = useCallback(async () => {
    if (!folderName.trim()) { toast.error('Folder name is required'); return; }
    setSaving(true);
    try {
      if (editingFolder) {
        const { data } = await foldersApi.updateFolder(editingFolder.uuid, folderName.trim());
        setFolders((p) => p.map((f) => (f.uuid === data.uuid ? data : f)));
        toast.success('Folder renamed');
      } else {
        const { data } = await foldersApi.createFolder(folderName.trim());
        setFolders((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)));
        toast.success('Folder created');
      }
      setModalOpen(false);
    } catch {
      toast.error('Failed to save folder');
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderName, editingFolder]);

  const handleDelete = useCallback(async (folder: FolderResponse) => {
    if (!confirm(`Delete folder "${folder.name}"? Items inside will be unfoldered.`)) return;
    setDeletingUuid(folder.uuid);
    try {
      await foldersApi.deleteFolder(folder.uuid);
      setFolders((p) => p.filter((f) => f.uuid !== folder.uuid));
      toast.success('Folder deleted');
    } catch {
      toast.error('Failed to delete folder');
    } finally {
      setDeletingUuid(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Folders</h1>
          <p className="text-gray-500 text-sm mt-1">Organise your vault items into folders.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New folder
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : folders.length === 0 ? (
        <div className="text-center py-16">
          <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <p className="text-gray-400 text-sm">No folders yet. Create one to organise your vault.</p>
          <button
            onClick={openCreate}
            className="mt-3 text-blue-600 text-sm hover:underline"
          >
            Create your first folder
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {folders.map((folder) => (
            <div key={folder.uuid} className="flex items-center gap-4 px-5 py-3.5">
              <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10 4H4c-1.11 0-2 .89-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8c0-1.11-.89-2-2-2h-8l-2-2z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{folder.name}</p>
                {folder.created_at && (
                  <p className="text-xs text-gray-400">
                    Created {new Date(folder.created_at).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => navigate(`${ROUTES.VAULT}?folder=${folder.uuid}`)}
                  className="text-xs text-blue-600 hover:underline px-2 py-1"
                >
                  View items
                </button>
                <button
                  onClick={() => openEdit(folder)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"
                  title="Rename"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(folder)}
                  disabled={deletingUuid === folder.uuid}
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingFolder ? 'Rename folder' : 'New folder'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Folder name</label>
            <input
              type="text"
              autoFocus
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              placeholder="e.g. Work, Personal, Finance"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg"
            >
              {saving ? 'Saving…' : (editingFolder ? 'Rename' : 'Create')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
