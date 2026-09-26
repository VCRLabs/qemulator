package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type AppConfig struct {
	DataDir string `json:"data_dir"`
	Port    int    `json:"port"`
	QemuBin string `json:"qemu_bin,omitempty"`
}

func DefaultConfig() *AppConfig {
	home, _ := os.UserHomeDir()
	return &AppConfig{
		DataDir: filepath.Join(home, ".qemulator"),
		Port:    8080,
	}
}

func (c *AppConfig) Save() error {
	path := filepath.Join(c.DataDir, "config.json")
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func LoadConfig(dataDir string) (*AppConfig, error) {
	path := filepath.Join(dataDir, "config.json")
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return DefaultConfig(), nil
		}
		return nil, err
	}
	var cfg AppConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}
