import { VMConfig, VMWithStatus, Preset, VMStatusInfo, ImageInfo, MediaDeviceInfo } from '../types';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface QemuInfo {
  binary: string;
  has_kvm: boolean;
  data_dir: string;
}

let cachedQemuInfo: QemuInfo | null = null;

export const api = {
  getQemuInfo: async (): Promise<QemuInfo> => {
    if (!cachedQemuInfo) {
      cachedQemuInfo = await request<QemuInfo>('/qemu/info');
    }
    return cachedQemuInfo;
  },
  listVMs: () => request<VMWithStatus[]>('/vms'),
  getVM: (id: string) => request<VMConfig>(`/vms/${id}`),
  createVM: (vm: Partial<VMConfig>) => request<VMConfig>('/vms', {
    method: 'POST', body: JSON.stringify(vm),
  }),
  updateVM: (id: string, vm: Partial<VMConfig>) => request<VMConfig>(`/vms/${id}`, {
    method: 'PUT', body: JSON.stringify(vm),
  }),
  deleteVM: (id: string) => request<void>(`/vms/${id}`, { method: 'DELETE' }),
  startVM: (id: string) => request<VMStatusInfo>(`/vms/${id}/start`, { method: 'POST' }),
  stopVM: (id: string) => request<VMStatusInfo>(`/vms/${id}/stop`, { method: 'POST' }),
  restartVM: (id: string) => request<VMStatusInfo>(`/vms/${id}/restart`, { method: 'POST' }),
  getVMStatus: (id: string) => request<VMStatusInfo>(`/vms/${id}/status`),
  updateVMMedia: (id: string, media: { cdrom?: string; floppy?: string }) =>
    request<VMConfig>(`/vms/${id}/media`, { method: 'PUT', body: JSON.stringify(media) }),
  getVMMedia: (id: string) => request<MediaDeviceInfo[]>(`/vms/${id}/media`),
  ejectVMMedia: (id: string, kind: 'cdrom' | 'floppy') =>
    request<VMConfig>(`/vms/${id}/media/eject`, { method: 'POST', body: JSON.stringify({ kind }) }),


  listPresets: () => request<Preset[]>('/presets'),
  getPreset: (name: string) => request<Preset>(`/presets/${name}`),

  listImages: () => request<ImageInfo[]>('/images'),
  createBlankImage: (name: string, format: string, size: string) =>
    request<{ name: string }>('/images/create-blank', {
      method: 'POST', body: JSON.stringify({ name, format, size }),
    }),
  deleteImage: (name: string) => request<void>(`/images/${name}`, { method: 'DELETE' }),
};

export function createSSE(onMessage: (event: string, data: any) => void): EventSource {
  const source = new EventSource(`${BASE}/events`);
  source.addEventListener('vm-status', ((e: MessageEvent) => {
    onMessage('vm-status', JSON.parse(e.data));
  }) as EventListener);
  return source;
}
