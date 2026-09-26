import { create } from 'zustand';
import { VMWithStatus, Preset, ImageInfo } from '../types';
import { api } from '../api/client';

interface AppState {
  vms: VMWithStatus[];
  presets: Preset[];
  images: ImageInfo[];
  loading: boolean;
  error: string | null;

  fetchVMs: () => Promise<void>;
  fetchPresets: () => Promise<void>;
  fetchImages: () => Promise<void>;
  updateVMStatus: (id: string, status: any) => void;
  clearError: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  vms: [],
  presets: [],
  images: [],
  loading: false,
  error: null,

  fetchVMs: async () => {
    set({ loading: true, error: null });
    try {
      const vms = await api.listVMs();
      set({ vms, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchPresets: async () => {
    try {
      const presets = await api.listPresets();
      set({ presets });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  fetchImages: async () => {
    try {
      const images = await api.listImages();
      set({ images });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  updateVMStatus: (id, status) => {
    set((state) => ({
      vms: state.vms.map((vm) =>
        vm.id === id ? { ...vm, status } : vm
      ),
    }));
  },

  clearError: () => set({ error: null }),
}));
