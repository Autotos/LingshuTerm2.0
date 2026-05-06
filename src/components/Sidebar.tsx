import { ChevronLeft, ChevronRight, Monitor, ListTodo } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { useUiStore } from '@/stores/uiStore';
import { TaskBoard } from './TaskBoard';

export function Sidebar() {
  const { sessions, activeSessionId, setActiveSession } = useSessionStore();
  const {
    sidebarCollapsed,
    toggleSidebar,
    sidebarTab,
    setSidebarTab,
    openCreateSessionModal,
  } = useUiStore();

  return (
    <aside
      className={`flex flex-col flex-shrink-0 bg-[var(--deep)] border-r border-[var(--border)] overflow-hidden transition-[width] duration-200 ${
        sidebarCollapsed ? 'w-[44px]' : 'w-[260px]'
      }`}
    >
      {/* Header with tabs */}
      <div
        className={`flex items-center border-b border-[var(--border)] min-h-[44px] ${
          sidebarCollapsed ? 'justify-center px-3' : 'justify-between px-2'
        }`}
      >
        {!sidebarCollapsed && (
          <div className="flex items-center gap-0.5">
            <SidebarTabBtn
              icon={<Monitor className="w-3 h-3" />}
              label="Sessions"
              active={sidebarTab === 'sessions'}
              onClick={() => setSidebarTab('sessions')}
            />
            <SidebarTabBtn
              icon={<ListTodo className="w-3 h-3" />}
              label="Tasks"
              active={sidebarTab === 'tasks'}
              onClick={() => setSidebarTab('tasks')}
            />
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="w-7 h-7 flex items-center justify-center rounded border border-transparent text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--veil)] hover:border-[var(--border)] transition-all"
          title={sidebarCollapsed ? 'Expand' : 'Collapse'}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Content: Sessions or Tasks */}
      {sidebarTab === 'sessions' ? (
        <>
          {/* Session list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {Array.from(sessions.values()).map((session) => (
              <div
                key={session.id}
                onClick={() => setActiveSession(session.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-xs whitespace-nowrap overflow-hidden text-ellipsis transition-all ${
                  session.id === activeSessionId
                    ? 'bg-[var(--veil)] border border-[var(--border)] text-[var(--text-1)]'
                    : 'text-[var(--text-2)] hover:bg-[var(--veil)] hover:text-[var(--text-1)]'
                } ${sidebarCollapsed ? 'justify-center px-2' : ''}`}
              >
                <span
                  className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${
                    session.status === 'connected' ? 'bg-[var(--green)]' : 'bg-[var(--accent)]'
                  }`}
                />
                {!sidebarCollapsed && (
                  <span className="truncate">{session.connectionName || session.title || session.id}</span>
                )}
              </div>
            ))}
          </div>

          {/* Footer: unified "New" button opens SessionTypeModal */}
          <div className="p-2 border-t border-[var(--border)]">
            <button
              onClick={openCreateSessionModal}
              className={`w-full rounded bg-[var(--veil)] border border-[var(--border)] text-[var(--text-2)] text-[11px] tracking-wide cursor-pointer hover:text-[var(--text-1)] hover:border-[var(--border-hi)] transition-all ${
                sidebarCollapsed ? 'px-2 py-2 text-center' : 'px-3 py-2'
              }`}
              title="New session (Remote or Local)"
            >
              {sidebarCollapsed ? '+' : '+ New'}
            </button>
          </div>
        </>
      ) : (
        <TaskBoard sessionId={activeSessionId} collapsed={sidebarCollapsed} />
      )}
    </aside>
  );
}

function SidebarTabBtn({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-all ${
        active
          ? 'bg-[var(--veil)] border border-[var(--border)] text-[var(--text-1)]'
          : 'border border-transparent text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--veil)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
