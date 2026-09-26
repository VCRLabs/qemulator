package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type VMStatus string

const (
	StatusStopped VMStatus = "stopped"
	StatusRunning VMStatus = "running"
	StatusStarting VMStatus = "starting"
	StatusStopping VMStatus = "stopping"
	StatusError   VMStatus = "error"
)

type VMConfig struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Description       string            `json:"description,omitempty"`
	Preset            string            `json:"preset,omitempty"`
	System            SystemConfig      `json:"system"`
	Storage           StorageConfig     `json:"storage"`
	Display           DisplayConfig     `json:"display"`
	Network           NetworkConfig     `json:"network"`
	ExtraArgs         []string          `json:"extra_args,omitempty"`
	ConfigGeneration  int               `json:"config_generation"`
	RunningGeneration int               `json:"running_generation"`
	CreatedAt         time.Time         `json:"created_at"`
	UpdatedAt         time.Time         `json:"updated_at"`
}

type SystemConfig struct {
	Machine string `json:"machine"`
	CPU     string `json:"cpu"`
	RAM     string `json:"ram"`
}

type StorageConfig struct {
	DiskImage    string `json:"disk_image"`
	DiskFormat   string `json:"disk_format"`
	DiskSize     string `json:"disk_size,omitempty"`
	BootOrder    string `json:"boot_order,omitempty"`
	Cdrom        string `json:"cdrom,omitempty"`
	Floppy       string `json:"floppy,omitempty"`
}

type DisplayConfig struct {
	VGA      string `json:"vga"`
	VNCPort  int    `json:"vnc_port,omitempty"`
}

type NetworkConfig struct {
	Model    string `json:"model"`
	Hostname string `json:"hostname,omitempty"`
}

type VMStatusInfo struct {
	ID     string   `json:"id"`
	Status VMStatus `json:"status"`
	PID    int      `json:"pid,omitempty"`
	VNCPort int     `json:"vnc_port,omitempty"`
	Error  string   `json:"error,omitempty"`
}

type VMStore struct {
	dataDir string
}

func NewVMStore(dataDir string) *VMStore {
	return &VMStore{dataDir: dataDir}
}

func (s *VMStore) DataDir() string {
	return s.dataDir
}

func (s *VMStore) vmDir() string {
	return filepath.Join(s.dataDir, "vms")
}

func (s *VMStore) vmPath(id string) string {
	return filepath.Join(s.vmDir(), id+".json")
}

func (s *VMStore) List() ([]VMConfig, error) {
	dir := s.vmDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []VMConfig{}, nil
		}
		return nil, err
	}

	var vms []VMConfig
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}
		var vm VMConfig
		if err := json.Unmarshal(data, &vm); err != nil {
			continue
		}
		vms = append(vms, vm)
	}
	return vms, nil
}

func (s *VMStore) Get(id string) (*VMConfig, error) {
	data, err := os.ReadFile(s.vmPath(id))
	if err != nil {
		return nil, fmt.Errorf("vm not found: %s", id)
	}
	var vm VMConfig
	if err := json.Unmarshal(data, &vm); err != nil {
		return nil, err
	}
	return &vm, nil
}

func (s *VMStore) Save(vm *VMConfig) error {
	if err := os.MkdirAll(s.vmDir(), 0755); err != nil {
		return err
	}
	now := time.Now()
	if vm.CreatedAt.IsZero() {
		vm.CreatedAt = now
	}
	vm.UpdatedAt = now
	data, err := json.MarshalIndent(vm, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.vmPath(vm.ID), data, 0644)
}

func (s *VMStore) Delete(id string) error {
	path := s.vmPath(id)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
