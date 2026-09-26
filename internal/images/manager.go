package images

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type ImageInfo struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	Managed bool   `json:"managed"`
}

type Manager struct {
	dataDir string
}

func NewManager(dataDir string) *Manager {
	return &Manager{dataDir: dataDir}
}

func (m *Manager) ImageDir() string {
	return filepath.Join(m.dataDir, "images")
}

func (m *Manager) List() ([]ImageInfo, error) {
	dir := m.ImageDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []ImageInfo{}, nil
		}
		return nil, err
	}

	var images []ImageInfo
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		images = append(images, ImageInfo{
			Name:    entry.Name(),
			Path:    filepath.Join(dir, entry.Name()),
			Size:    info.Size(),
			Managed: true,
		})
	}
	if images == nil {
		images = []ImageInfo{}
	}
	return images, nil
}

func (m *Manager) Save(name string, reader io.Reader) error {
	if err := os.MkdirAll(m.ImageDir(), 0755); err != nil {
		return err
	}

	path := filepath.Join(m.ImageDir(), filepath.Base(name))
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = io.Copy(f, reader)
	return err
}

func (m *Manager) Delete(name string) error {
	path := filepath.Join(m.ImageDir(), filepath.Base(name))
	return os.Remove(path)
}

func (m *Manager) CreateBlank(name, format, size string) error {
	if err := os.MkdirAll(m.ImageDir(), 0755); err != nil {
		return err
	}

	path := filepath.Join(m.ImageDir(), name)
	cmd := exec.Command("qemu-img", "create", "-f", format, path, size)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("qemu-img failed: %s - %w", strings.TrimSpace(string(output)), err)
	}
	return nil
}

func (m *Manager) Link(name, absPath string) error {
	if err := os.MkdirAll(m.ImageDir(), 0755); err != nil {
		return err
	}

	linkPath := filepath.Join(m.ImageDir(), name)
	os.Remove(linkPath)
	return os.Symlink(absPath, linkPath)
}
