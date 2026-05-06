import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SavedConnection, ConnectionConfig } from '@/models/connection';
import { generateConnectionId } from '@/models/connection';

interface ConnectionState {
  savedConnections: SavedConnection[];
  addConnection: (name: string, config: ConnectionConfig) => string;
  removeConnection: (id: string) => void;
  updateConnection: (id: string, name: string, config: ConnectionConfig) => void;
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      savedConnections: [],

      addConnection: (name, config) => {
        const id = generateConnectionId();
        const entry: SavedConnection = {
          id,
          name,
          config,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ savedConnections: [...s.savedConnections, entry] }));
        return id;
      },

      removeConnection: (id) =>
        set((s) => ({
          savedConnections: s.savedConnections.filter((c) => c.id !== id),
        })),

      updateConnection: (id, name, config) =>
        set((s) => ({
          savedConnections: s.savedConnections.map((c) =>
            c.id === id ? { ...c, name, config } : c,
          ),
        })),
    }),
    {
      name: 'lingshu-connections',
      partialize: (state) => ({ savedConnections: state.savedConnections }),
    },
  ),
);
