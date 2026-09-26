export interface SystemConfig {
  machine: string;
  cpu: string;
  ram: string;
}

export interface StorageConfig {
  disk_image: string;
  disk_format: string;
  disk_size?: string;
  boot_order?: string;
  cdrom?: string;
  floppy?: string;
}

export interface DisplayConfig {
  vga: string;
  vnc_port?: number;
}

export interface NetworkConfig {
  model: string;
  hostname?: string;
}

export interface VMConfig {
  id: string;
  name: string;
  description?: string;
  preset?: string;
  system: SystemConfig;
  storage: StorageConfig;
  display: DisplayConfig;
  network: NetworkConfig;
  extra_args?: string[];
  config_generation: number;
  running_generation: number;
  created_at: string;
  updated_at: string;
}

export type VMStatus = 'stopped' | 'running' | 'starting' | 'stopping' | 'error';

export interface VMStatusInfo {
  id: string;
  status: VMStatus;
  pid?: number;
  vnc_port?: number;
  error?: string;
}

export interface VMWithStatus extends VMConfig {
  status: VMStatusInfo;
}

export interface Preset {
  name: string;
  description: string;
  config: VMConfig;
}

export interface ImageInfo {
  name: string;
  path: string;
  size: number;
  managed: boolean;
}

export interface MediaDeviceInfo {
  kind: string;
  device: string;
  file: string;
  present: boolean;
}
