package api

import (
	"net/http"
)

type FileBrowserHandler struct{}

func NewFileBrowserHandler() *FileBrowserHandler {
	return &FileBrowserHandler{}
}

func (h *FileBrowserHandler) List(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	dir := r.URL.Query().Get("dir")
	extFilter := r.URL.Query().Get("ext")

	var extensions []string
	if extFilter != "" {
		for _, e := range splitExt(extFilter) {
			extensions = append(extensions, "."+e)
		}
	}

	files, err := ListFiles(dir, extensions)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, files)
}

func splitExt(s string) []string {
	var result []string
	for _, part := range splitComma(s) {
		part = trimSpace(part)
		if part != "" {
			if part[0] == '.' {
				part = part[1:]
			}
			result = append(result, part)
		}
	}
	return result
}

func splitComma(s string) []string {
	var result []string
	for _, part := range splitBy(s, ',') {
		result = append(result, part)
	}
	return result
}

func splitBy(s string, sep byte) []string {
	var result []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == sep {
			result = append(result, s[start:i])
			start = i + 1
		}
	}
	result = append(result, s[start:])
	return result
}

func trimSpace(s string) string {
	start := 0
	end := len(s)
	for start < end && s[start] == ' ' {
		start++
	}
	for end > start && s[end-1] == ' ' {
		end--
	}
	return s[start:end]
}
