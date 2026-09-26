package api

import (
	"net/http"

	"qemulator/internal/qemu"
)

func ListPresets(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, qemu.ListPresets())
}

func GetPreset(w http.ResponseWriter, r *http.Request) {
	name := pathParam(r, "name")
	preset, ok := qemu.GetPreset(name)
	if !ok {
		writeError(w, http.StatusNotFound, "preset not found: "+name)
		return
	}
	writeJSON(w, http.StatusOK, preset)
}
