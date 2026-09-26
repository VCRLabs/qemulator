import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useStore } from '../stores/useStore';
import { api, QemuInfo } from '../api/client';
import { Preset, VMConfig } from '../types';
import { buildQemuCommand, formatCommand } from '../api/qemuCommand';
import FileBrowser from './FileBrowser';

type DiskSource = 'auto' | 'existing' | 'external';

export default function VMCreate() {
  const [, navigate] = useLocation();
  const { presets, images, fetchPresets, fetchImages, fetchVMs } = useStore();
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [config, setConfig] = useState<Partial<VMConfig>>({
    system: { machine: 'pc', cpu: '486', ram: '64' },
    storage: { disk_image: '', disk_format: 'qcow2', disk_size: '2G', boot_order: 'c' },
    display: { vga: 'std' },
    network: { model: 'ne2k_pci' },
  });
  const [extraArgs, setExtraArgs] = useState('');
  const [creating, setCreating] = useState(false);
  const [diskSource, setDiskSource] = useState<DiskSource>('auto');
  const [existingImage, setExistingImage] = useState('');
  const [externalPath, setExternalPath] = useState('');
  const [qemuInfo, setQemuInfo] = useState<QemuInfo>({ binary: 'qemu-system-i386', has_kvm: false, data_dir: '' });

  useEffect(() => {
    fetchPresets();
    fetchImages();
    api.getQemuInfo().then(setQemuInfo).catch(() => {});
  }, []);

  const applyPreset = (preset: Preset) => {
    setSelectedPreset(preset.name);
    setName(preset.name);
    setConfig({
      system: { ...preset.config.system },
      storage: { ...preset.config.storage },
      display: { ...preset.config.display },
      network: { ...preset.config.network },
    });
  };

  const diskImage = useMemo(() => {
    if (diskSource === 'existing' && existingImage) {
      const img = images.find((i) => i.name === existingImage);
      return img?.path || '';
    }
    if (diskSource === 'external') return externalPath;
    if (diskSource === 'auto' && name.trim()) {
      return `${qemuInfo.data_dir}/images/${name.trim().toLowerCase().replace(/\s+/g, '-')}.${config.storage?.disk_format || 'qcow2'}`;
    }
    return '';
  }, [diskSource, existingImage, externalPath, name, config.storage?.disk_format, images, qemuInfo.data_dir]);

  const commandPreview = useMemo(() => {
    const args = buildQemuCommand(
      { ...config, name: name || 'vm' },
      diskImage,
      extraArgs,
      qemuInfo,
    );
    return formatCommand(args);
  }, [config, name, diskImage, extraArgs, qemuInfo]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const storage = { ...config.storage! };
      if (diskSource === 'existing' && existingImage) {
        const img = images.find((i) => i.name === existingImage);
        if (img) storage.disk_image = img.path;
      } else if (diskSource === 'external' && externalPath) {
        storage.disk_image = externalPath;
      } else {
        storage.disk_image = '';
      }
      await api.createVM({
        name: name.trim(),
        preset: selectedPreset || undefined,
        system: config.system!,
        storage,
        display: config.display!,
        network: config.network!,
        extra_args: extraArgs ? extraArgs.split(/\s+/).filter(Boolean) : [],
      });
      await fetchVMs();
      navigate('/');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  const updateSystem = (field: string, value: string) => {
    setConfig((c) => ({ ...c, system: { ...c.system!, [field]: value } }));
  };
  const updateStorage = (field: string, value: string) => {
    setConfig((c) => ({ ...c, storage: { ...c.storage!, [field]: value } }));
  };
  const updateDisplay = (field: string, value: string) => {
    setConfig((c) => ({ ...c, display: { ...c.display!, [field]: value } }));
  };
  const updateNetwork = (field: string, value: string) => {
    setConfig((c) => ({ ...c, network: { ...c.network!, [field]: value } }));
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-white">Create New VM</h2>

      <div className="flex gap-6">
        {/* Left: Form */}
        <div className="flex-1 min-w-0 space-y-4">
          <section>
            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3">Select Preset</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {presets.map((p) => (
                <button
                  key={p.name}
                  onClick={() => applyPreset(p)}
                  className={`p-3 rounded border text-left text-sm ${
                    selectedPreset === p.name
                      ? 'border-emerald-500 bg-emerald-900/30 text-emerald-300'
                      : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-slate-500 mt-1">{p.description}</div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <label className="block text-sm font-medium text-slate-400 mb-1">VM Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none"
              placeholder="My DOS Machine"
            />
          </section>

          <ConfigPanel title="System">
            <label className="block">
              <span className="text-xs text-slate-400">Machine</span>
              <select value={config.system?.machine} onChange={(e) => updateSystem('machine', e.target.value)}
                className="block w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white mt-1">
                <option value="pc">PC (i440FX)</option>
                <option value="isapc">ISA-only PC</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">CPU</span>
              <select value={config.system?.cpu} onChange={(e) => updateSystem('cpu', e.target.value)}
                className="block w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white mt-1">
                <option value="486">486</option>
                <option value="pentium">Pentium</option>
                <option value="pentium2">Pentium II</option>
                <option value="pentium3">Pentium III</option>
                <option value="qemu64">QEMU 64-bit</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">RAM (MB)</span>
              <input type="number" value={config.system?.ram} onChange={(e) => updateSystem('ram', e.target.value)}
                className="block w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white mt-1" />
            </label>
          </ConfigPanel>

          <ConfigPanel title="Storage">
            <div>
              <span className="text-xs text-slate-400">Disk Source</span>
              <div className="flex gap-2 mt-1">
                {([
                  ['auto', 'Create new'],
                  ['existing', 'Use existing'],
                  ['external', 'External path'],
                ] as [DiskSource, string][]).map(([val, label]) => (
                  <button key={val} onClick={() => setDiskSource(val)}
                    className={`px-3 py-1.5 rounded text-xs border ${
                      diskSource === val
                        ? 'border-emerald-500 bg-emerald-900/30 text-emerald-300'
                        : 'border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {diskSource === 'auto' && (
              <>
                <label className="block">
                  <span className="text-xs text-slate-400">Disk Format</span>
                  <select value={config.storage?.disk_format} onChange={(e) => updateStorage('disk_format', e.target.value)}
                    className="block w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white mt-1">
                    <option value="qcow2">QCOW2</option>
                    <option value="raw">Raw</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-slate-400">Disk Size</span>
                  <input type="text" value={config.storage?.disk_size} onChange={(e) => updateStorage('disk_size', e.target.value)}
                    className="block w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white mt-1"
                    placeholder="2G" />
                </label>
              </>
            )}

            {diskSource === 'existing' && (
              <label className="block">
                <span className="text-xs text-slate-400">Select Image</span>
                <select value={existingImage} onChange={(e) => setExistingImage(e.target.value)}
                  className="block w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white mt-1">
                  <option value="">-- select --</option>
                  {images.map((img) => (
                    <option key={img.name} value={img.name}>{img.name}</option>
                  ))}
                </select>
              </label>
            )}

            {diskSource === 'external' && (
              <label className="block">
                <span className="text-xs text-slate-400">Image Path</span>
                <input type="text" value={externalPath} onChange={(e) => setExternalPath(e.target.value)}
                  className="block w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white mt-1 font-mono"
                  placeholder="/path/to/disk.qcow2" />
              </label>
            )}

            <div>
              <span className="text-xs text-slate-400">CD-ROM ISO (optional)</span>
              <FileBrowser
                value={config.storage?.cdrom || ''}
                onChange={(v) => updateStorage('cdrom', v)}
                filterExts=".iso,.img,.ima"
                placeholder="/path/to/install.iso"
              />
            </div>
            <div>
              <span className="text-xs text-slate-400">Floppy image (optional)</span>
              <FileBrowser
                value={config.storage?.floppy || ''}
                onChange={(v) => updateStorage('floppy', v)}
                filterExts=".img,.ima,.fd,.floppy"
                placeholder="/path/to/disk.img"
              />
            </div>
            <label className="block">
              <span className="text-xs text-slate-400">Boot Order</span>
              <select value={config.storage?.boot_order} onChange={(e) => updateStorage('boot_order', e.target.value)}
                className="block w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white mt-1">
                <option value="c">Hard Disk</option>
                <option value="ac">Floppy, Hard Disk</option>
                <option value="cdn">Hard Disk, CD-ROM, Network</option>
                <option value="cd">Hard Disk, CD-ROM</option>
                <option value="d">CD-ROM only</option>
                <option value="a">Floppy only</option>
              </select>
            </label>
          </ConfigPanel>

          <ConfigPanel title="Display">
            <label className="block">
              <span className="text-xs text-slate-400">VGA Adapter</span>
              <select value={config.display?.vga} onChange={(e) => updateDisplay('vga', e.target.value)}
                className="block w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white mt-1">
                <option value="std">Standard VGA</option>
                <option value="cirrus">Cirrus Logic GD-5446</option>
                <option value="none">None</option>
              </select>
            </label>
          </ConfigPanel>

          <ConfigPanel title="Network">
            <label className="block">
              <span className="text-xs text-slate-400">NIC Model</span>
              <select value={config.network?.model} onChange={(e) => updateNetwork('model', e.target.value)}
                className="block w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white mt-1">
                <option value="ne2k_pci">NE2000 PCI</option>
                <option value="ne2k_isa">NE2000 ISA</option>
                <option value="pcnet">AMD PCNet</option>
                <option value="rtl8139">Realtek RTL8139</option>
                <option value="e1000">Intel E1000</option>
              </select>
            </label>
          </ConfigPanel>

          <ConfigPanel title="Advanced">
            <label className="block">
              <span className="text-xs text-slate-400">Extra QEMU Arguments (space-separated)</span>
              <input type="text" value={extraArgs} onChange={(e) => setExtraArgs(e.target.value)}
                className="block w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white mt-1 font-mono"
                placeholder="-smp 2 -device sb16" />
            </label>
          </ConfigPanel>

          <div className="flex gap-3 mt-6">
            <button onClick={() => navigate('/')}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-white">
              Cancel
            </button>
            <button onClick={handleCreate} disabled={creating || !name.trim()}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-sm text-white font-medium">
              {creating ? 'Creating...' : 'Create VM'}
            </button>
          </div>
        </div>

        {/* Right: Command preview */}
        <div className="w-[380px] flex-shrink-0">
          <div className="sticky top-6">
            <div className="bg-slate-950 border border-slate-700 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 border-b border-slate-700">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <span className="text-xs text-slate-400 ml-2">qemu command</span>
              </div>
              <pre className="p-4 text-xs text-emerald-400 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-all max-h-[calc(100vh-12rem)] overflow-y-auto">
                {commandPreview}
              </pre>
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">
              Live preview — updates as you change options
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigPanel({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-slate-700 rounded mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2 bg-slate-800 rounded-t text-sm font-medium text-slate-300"
      >
        {title}
        <span className="text-slate-500">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}
