import { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../utils/constants';
import { foldersApi, FolderResponse } from '../../api/foldersApi';

// ─── Static top-level nav items ─────────────────────────────────────────────

const NAV_ITEMS = [
  {
    label: 'Dashboard',
    to: ROUTES.DASHBOARD,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: 'Vault',
    to: ROUTES.VAULT,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
  {
    label: 'Folders',
    to: ROUTES.FOLDERS,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      </svg>
    ),
  },
  {
    label: 'Generator',
    to: ROUTES.GENERATOR,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
  },
  {
    label: 'Trash',
    to: ROUTES.TRASH,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [folders, setFolders] = useState<FolderResponse[]>([]);
  const [foldersOpen, setFoldersOpen] = useState(true);

  useEffect(() => {
    foldersApi.listFolders()
      .then((r) => setFolders(r.data))
      .catch(() => {});
  }, [location.pathname]); // refetch when navigating (e.g. after creating a folder)

  const activeFolderUuid = new URLSearchParams(location.search).get('folder');

  return (
    <aside className="w-52 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {/* Static nav links */}
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}

        {/* Folders section — filter vault by folder */}
        {folders.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setFoldersOpen((p) => !p)}
              className="w-full flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 rounded-lg"
            >
              <svg
                className={`w-3 h-3 transition-transform ${foldersOpen ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Folders
            </button>
            {foldersOpen && (
              <div className="mt-0.5 space-y-0.5">
                {folders.map((folder) => {
                  const isActive = activeFolderUuid === folder.uuid && location.pathname === ROUTES.VAULT;
                  return (
                    <button
                      key={folder.uuid}
                      type="button"
                      onClick={() => navigate(`${ROUTES.VAULT}?folder=${folder.uuid}`)}
                      className={`w-full flex items-center gap-2 pl-6 pr-3 py-1.5 rounded-lg text-sm transition-colors ${
                        isActive
                          ? 'bg-amber-50 text-amber-700 font-medium'
                          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M10 4H4c-1.11 0-2 .89-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8c0-1.11-.89-2-2-2h-8l-2-2z" />
                      </svg>
                      <span className="truncate">{folder.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>
    </aside>
  );
}
