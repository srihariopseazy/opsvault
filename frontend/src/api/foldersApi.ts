import client from './client';

export interface FolderResponse {
  uuid: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export const foldersApi = {
  listFolders() {
    return client.get<FolderResponse[]>('/folders');
  },

  createFolder(name: string) {
    return client.post<FolderResponse>('/folders', { name });
  },

  updateFolder(uuid: string, name: string) {
    return client.put<FolderResponse>(`/folders/${uuid}`, { name });
  },

  deleteFolder(uuid: string) {
    return client.delete(`/folders/${uuid}`);
  },
};
