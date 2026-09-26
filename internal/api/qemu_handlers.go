package api

import (
	"net/http"

	"qemulator/internal/qemu"
)

func HandleQemuInfo(manager *qemu.Manager, dataDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"binary":   manager.Binary(),
			"has_kvm":  qemu.HasKVM(),
			"data_dir": dataDir,
		})
	}
}
