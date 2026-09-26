package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"qemulator/internal/images"
)

type ImageHandler struct {
	manager *images.Manager
}

func NewImageHandler(manager *images.Manager) *ImageHandler {
	return &ImageHandler{manager: manager}
}

func (h *ImageHandler) List(w http.ResponseWriter, r *http.Request) {
	imgs, err := h.manager.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, imgs)
}

func (h *ImageHandler) Upload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "failed to parse upload: "+err.Error())
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "no file provided")
		return
	}
	defer file.Close()

	name := header.Filename
	if n := r.FormValue("name"); n != "" {
		name = n
	}

	if err := h.manager.Save(name, file); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"name": name})
}

func (h *ImageHandler) Delete(w http.ResponseWriter, r *http.Request) {
	name := pathParam(r, "name")
	if err := h.manager.Delete(name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *ImageHandler) CreateBlank(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name   string `json:"name"`
		Format string `json:"format"`
		Size   string `json:"size"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.Format == "" {
		req.Format = "qcow2"
	}
	if req.Size == "" {
		req.Size = "2G"
	}

	if err := h.manager.CreateBlank(req.Name, req.Format, req.Size); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"name": req.Name})
}

func (h *ImageHandler) Link(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	absPath, err := filepath.Abs(req.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}

	if _, err := os.Stat(absPath); os.IsNotExist(err) {
		writeError(w, http.StatusBadRequest, "file not found: "+absPath)
		return
	}

	if err := h.manager.Link(req.Name, absPath); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"name": req.Name, "path": absPath})
}

func (h *ImageHandler) ServeFile(w http.ResponseWriter, r *http.Request) {
	name := pathParam(r, "name")
	dir := h.manager.ImageDir()
	path := filepath.Join(dir, filepath.Base(name))

	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		writeError(w, http.StatusNotFound, "image not found")
		return
	}

	w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size()))
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", name))
	http.ServeFile(w, r, path)
}
