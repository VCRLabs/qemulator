package qemu

import "qemulator/internal/config"

type Preset struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Config      config.VMConfig `json:"config"`
}

var Presets = map[string]Preset{
	"dos622": {
		Name:        "DOS 6.22",
		Description: "MS-DOS 6.22 on 486 with 16MB RAM",
		Config: config.VMConfig{
			System: config.SystemConfig{
				Machine: "pc",
				CPU:     "486",
				RAM:     "16",
			},
			Storage: config.StorageConfig{
				DiskFormat: "qcow2",
				DiskSize:   "500M",
				BootOrder:  "c",
			},
			Display: config.DisplayConfig{
				VGA: "std",
			},
			Network: config.NetworkConfig{
				Model: "ne2k_pci",
			},
		},
	},
	"win31": {
		Name:        "Windows 3.1",
		Description: "Windows 3.1 on 486 with 32MB RAM",
		Config: config.VMConfig{
			System: config.SystemConfig{
				Machine: "pc",
				CPU:     "486",
				RAM:     "32",
			},
			Storage: config.StorageConfig{
				DiskFormat: "qcow2",
				DiskSize:   "1G",
				BootOrder:  "c",
			},
			Display: config.DisplayConfig{
				VGA: "std",
			},
			Network: config.NetworkConfig{
				Model: "ne2k_pci",
			},
		},
	},
	"win95": {
		Name:        "Windows 95",
		Description: "Windows 95 on Pentium with 64MB RAM",
		Config: config.VMConfig{
			System: config.SystemConfig{
				Machine: "pc",
				CPU:     "pentium",
				RAM:     "64",
			},
			Storage: config.StorageConfig{
				DiskFormat: "qcow2",
				DiskSize:   "2G",
				BootOrder:  "c",
			},
			Display: config.DisplayConfig{
				VGA: "cirrus",
			},
			Network: config.NetworkConfig{
				Model: "pcnet",
			},
		},
	},
	"win98": {
		Name:        "Windows 98",
		Description: "Windows 98 on Pentium with 128MB RAM",
		Config: config.VMConfig{
			System: config.SystemConfig{
				Machine: "pc",
				CPU:     "pentium",
				RAM:     "128",
			},
			Storage: config.StorageConfig{
				DiskFormat: "qcow2",
				DiskSize:   "4G",
				BootOrder:  "c",
			},
			Display: config.DisplayConfig{
				VGA: "cirrus",
			},
			Network: config.NetworkConfig{
				Model: "rtl8139",
			},
		},
	},
	"win2000": {
		Name:        "Windows 2000",
		Description: "Windows 2000 on Pentium II with 256MB RAM",
		Config: config.VMConfig{
			System: config.SystemConfig{
				Machine: "pc",
				CPU:     "pentium2",
				RAM:     "256",
			},
			Storage: config.StorageConfig{
				DiskFormat: "qcow2",
				DiskSize:   "8G",
				BootOrder:  "c",
			},
			Display: config.DisplayConfig{
				VGA: "cirrus",
			},
			Network: config.NetworkConfig{
				Model: "rtl8139",
			},
		},
	},
	"winxp": {
		Name:        "Windows XP",
		Description: "Windows XP on Pentium III with 512MB RAM",
		Config: config.VMConfig{
			System: config.SystemConfig{
				Machine: "pc",
				CPU:     "pentium3",
				RAM:     "512",
			},
			Storage: config.StorageConfig{
				DiskFormat: "qcow2",
				DiskSize:   "20G",
				BootOrder:  "c",
			},
			Display: config.DisplayConfig{
				VGA: "cirrus",
			},
			Network: config.NetworkConfig{
				Model: "rtl8139",
			},
		},
	},
}

func GetPreset(name string) (Preset, bool) {
	p, ok := Presets[name]
	return p, ok
}

func ListPresets() []Preset {
	var list []Preset
	for _, p := range Presets {
		list = append(list, p)
	}
	return list
}
