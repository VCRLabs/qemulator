import { VMConfig } from '../types';
import { QemuInfo } from './client';

export function buildQemuCommand(
  config: Partial<VMConfig>,
  diskImage: string,
  extraArgs: string,
  qemuInfo: QemuInfo,
): string[] {
  const args: string[] = [qemuInfo.binary];

  if (config.name) {
    args.push('-name', config.name);
  }

  if (config.system?.machine) {
    args.push('-machine', config.system.machine);
  }
  if (config.system?.cpu) {
    args.push('-cpu', config.system.cpu);
  }
  if (config.system?.ram) {
    args.push('-m', config.system.ram);
  }

  if (diskImage) {
    const fmt = config.storage?.disk_format || 'qcow2';
    args.push('-drive', `file=${diskImage},format=${fmt}`);
  }

  if (config.storage?.cdrom) {
    args.push('-drive', `file=${config.storage.cdrom},media=cdrom,index=1`);
  }

  if (config.storage?.floppy) {
    args.push('-fda', config.storage.floppy);
  }

  if (config.display?.vga) {
    args.push('-vga', config.display.vga);
  }

  if (config.network?.model) {
    args.push('-netdev', 'user,id=net0');
    args.push('-device', `${config.network.model},netdev=net0`);
  }

  args.push('-vnc', '127.0.0.1:0');

  if (config.storage?.boot_order) {
    args.push('-boot', config.storage.boot_order);
  }

  args.push('-usb', '-device', 'usb-tablet');

  if (qemuInfo.has_kvm) {
    args.push('-enable-kvm');
  }

  if (extraArgs.trim()) {
    const parts = extraArgs.trim().split(/\s+/);
    args.push(...parts);
  }

  return args;
}

export function formatCommand(args: string[]): string {
  const lines: string[] = [args[0]];
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-') && i + 1 < args.length && !args[i + 1].startsWith('-')) {
      lines.push(`  ${arg} ${args[i + 1]}`);
      i++;
    } else {
      lines.push(`  ${arg}`);
    }
  }
  return lines.join(' \\\n');
}
