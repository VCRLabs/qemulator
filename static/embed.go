package static

import (
	"embed"
	"io/fs"
)

//go:embed dist/*
var webFS embed.FS

func FS() fs.FS {
	sub, err := fs.Sub(webFS, "dist")
	if err != nil {
		return nil
	}
	return sub
}
