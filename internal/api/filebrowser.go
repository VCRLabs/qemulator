package api

import (
	"os"
	"path/filepath"
	"strings"
)

type FileEntry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"is_dir"`
	Size  int64  `json:"size"`
}

func ListFiles(dir string, extensions []string) ([]FileEntry, error) {
	if dir == "" {
		home, _ := os.UserHomeDir()
		dir = home
	}

	absDir, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(absDir)
	if err != nil {
		return nil, err
	}

	var result []FileEntry
	for _, entry := range entries {
		name := entry.Name()

		if strings.HasPrefix(name, ".") {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		if entry.IsDir() {
			result = append(result, FileEntry{
				Name:  name,
				Path:  filepath.Join(absDir, name),
				IsDir: true,
			})
			continue
		}

		if len(extensions) > 0 {
			matched := false
			ext := strings.ToLower(filepath.Ext(name))
			for _, e := range extensions {
				if ext == e {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}

		result = append(result, FileEntry{
			Name:  name,
			Path:  filepath.Join(absDir, name),
			IsDir: false,
			Size:  info.Size(),
		})
	}

	if result == nil {
		result = []FileEntry{}
	}
	return result, nil
}
