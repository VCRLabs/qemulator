package api

import (
	"encoding/json"
	"net/http"
	"strings"
)

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func pathParam(r *http.Request, name string) string {
	path := r.URL.Path
	parts := strings.Split(strings.Trim(path, "/"), "/")

	// Expected: api, vms, {id} or api, presets, {name}
	if name == "id" && len(parts) >= 3 {
		return parts[2]
	}
	if name == "name" && len(parts) >= 3 {
		return parts[2]
	}
	return ""
}
