package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"time"

	"qemulator/internal/config"
	"qemulator/internal/images"
	"qemulator/internal/qemu"
)

type VMHandler struct {
	store     *config.VMStore
	manager   *qemu.Manager
	imgMgr    *images.Manager
	hub       *SSEHub
}

func NewVMHandler(store *config.VMStore, manager *qemu.Manager, imgMgr *images.Manager, hub *SSEHub) *VMHandler {
	return &VMHandler{store: store, manager: manager, imgMgr: imgMgr, hub: hub}
}

func (h *VMHandler) List(w http.ResponseWriter, r *http.Request) {
	vms, err := h.store.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	type vmWithStatus struct {
		config.VMConfig `json:",inline"`
		Status          *config.VMStatusInfo `json:"status"`
	}

	var result []vmWithStatus
	for _, vm := range vms {
		status := h.manager.GetStatus(vm.ID)
		result = append(result, vmWithStatus{VMConfig: vm, Status: status})
	}
	if result == nil {
		result = []vmWithStatus{}
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *VMHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")
	vm, err := h.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, vm)
}

func (h *VMHandler) Create(w http.ResponseWriter, r *http.Request) {
	var vm config.VMConfig
	if err := json.NewDecoder(r.Body).Decode(&vm); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}

	if vm.ID == "" {
		vm.ID = generateID(vm.Name)
	}

	if vm.System.RAM == "" {
		vm.System.RAM = "64"
	}
	if vm.System.Machine == "" {
		vm.System.Machine = "pc"
	}
	if vm.System.CPU == "" {
		vm.System.CPU = "486"
	}
	if vm.Display.VGA == "" {
		vm.Display.VGA = "std"
	}
	if vm.Network.Model == "" {
		vm.Network.Model = "ne2k_pci"
	}
	if vm.Storage.DiskFormat == "" {
		vm.Storage.DiskFormat = "qcow2"
	}

	if vm.Storage.DiskImage == "" && vm.Storage.DiskSize != "" {
		diskName := vm.ID + "." + vm.Storage.DiskFormat
		diskPath := filepath.Join(h.imgMgr.ImageDir(), diskName)
		if err := h.imgMgr.CreateBlank(diskName, vm.Storage.DiskFormat, vm.Storage.DiskSize); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create disk: "+err.Error())
			return
		}
		vm.Storage.DiskImage = diskPath
	}

	vm.CreatedAt = time.Now()
	vm.UpdatedAt = time.Now()

	if err := h.store.Save(&vm); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, vm)
}

func (h *VMHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")
	existing, err := h.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	var update config.VMConfig
	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}

	existing.Name = update.Name
	existing.Description = update.Description
	existing.System = update.System
	existing.Storage = update.Storage
	existing.Display = update.Display
	existing.Network = update.Network
	existing.ExtraArgs = update.ExtraArgs
	existing.ConfigGeneration++
	existing.UpdatedAt = time.Now()

	if err := h.store.Save(existing); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, existing)
}

func (h *VMHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")
	if err := h.manager.Stop(id); err == nil {
		time.Sleep(500 * time.Millisecond)
	}
	if err := h.store.Delete(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *VMHandler) Start(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")
	vm, err := h.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	vm.RunningGeneration = vm.ConfigGeneration
	if err := h.store.Save(vm); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	status, err := h.manager.Start(vm)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.hub.BroadcastStatus(status)
	writeJSON(w, http.StatusOK, status)
}

func (h *VMHandler) Stop(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")
	if err := h.manager.Stop(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	status := h.manager.GetStatus(id)
	h.hub.BroadcastStatus(status)
	writeJSON(w, http.StatusOK, status)
}

func (h *VMHandler) Restart(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")
	vm, err := h.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	// Stop if running, wait for exit
	status := h.manager.GetStatus(id)
	if status.Status == config.StatusRunning || status.Status == config.StatusStarting {
		if err := h.manager.Stop(id); err == nil {
			// Poll until stopped (max 5 seconds)
			for i := 0; i < 50; i++ {
				time.Sleep(100 * time.Millisecond)
				s := h.manager.GetStatus(id)
				if s.Status == config.StatusStopped || s.Status == config.StatusError {
					break
				}
			}
		}
	}

	// Sync generations and save
	vm.RunningGeneration = vm.ConfigGeneration
	if err := h.store.Save(vm); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Start
	startStatus, err := h.manager.Start(vm)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.hub.BroadcastStatus(startStatus)
	writeJSON(w, http.StatusOK, startStatus)
}

func (h *VMHandler) Status(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")
	status := h.manager.GetStatus(id)
	writeJSON(w, http.StatusOK, status)
}

func (h *VMHandler) UpdateMedia(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")

	var req struct {
		Cdrom   *string `json:"cdrom"`
		Floppy  *string `json:"floppy"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}

	vm, err := h.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	status := h.manager.GetStatus(id)
	running := status.Status == config.StatusRunning

	if running {
		if req.Cdrom != nil && *req.Cdrom != "" {
			if err := h.manager.ChangeMedia(id, "cdrom", *req.Cdrom); err != nil {
				writeError(w, http.StatusInternalServerError, "qmp change cdrom: "+err.Error())
				return
			}
		}
		if req.Floppy != nil && *req.Floppy != "" {
			if err := h.manager.ChangeMedia(id, "floppy", *req.Floppy); err != nil {
				writeError(w, http.StatusInternalServerError, "qmp change floppy: "+err.Error())
				return
			}
		}
	}

	if req.Cdrom != nil {
		vm.Storage.Cdrom = *req.Cdrom
	}
	if req.Floppy != nil {
		vm.Storage.Floppy = *req.Floppy
	}

	if err := h.store.Save(vm); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, vm)
}

type MediaDeviceInfo struct {
	Kind    string `json:"kind"`
	Device  string `json:"device"`
	File    string `json:"file"`
	Present bool   `json:"present"`
}

// GetMedia returns the removable media devices for a VM.
// When running, queries QMP for live state. When stopped, infers from config.
func (h *VMHandler) GetMedia(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")
	vm, err := h.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	status := h.manager.GetStatus(id)
	if status.Status == config.StatusRunning {
		devs, err := h.manager.ListBlockDevices(id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "qmp query-block: "+err.Error())
			return
		}
		out := make([]MediaDeviceInfo, 0, len(devs))
		for _, d := range devs {
			kind := d.Type
			if kind == "" {
				kind = "unknown"
			}
			info := MediaDeviceInfo{
				Kind:   kind,
				Device: d.Device,
			}
			if d.Inserted != nil {
				info.File = d.Inserted.File
				info.Present = true
			}
			out = append(out, info)
		}
		writeJSON(w, http.StatusOK, out)
		return
	}

	// Stopped: infer drives from configured media paths.
	var out []MediaDeviceInfo
	if vm.Storage.Cdrom != "" {
		out = append(out, MediaDeviceInfo{
			Kind: "cdrom", Device: "cdrom",
			File: vm.Storage.Cdrom, Present: true,
		})
	}
	if vm.Storage.Floppy != "" {
		out = append(out, MediaDeviceInfo{
			Kind: "floppy", Device: "floppy",
			File: vm.Storage.Floppy, Present: true,
		})
	}
	if out == nil {
		out = []MediaDeviceInfo{}
	}
	writeJSON(w, http.StatusOK, out)
}

// EjectMedia ejects media from a running VM via QMP and clears the config field.
func (h *VMHandler) EjectMedia(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, "id")

	var req struct {
		Kind string `json:"kind"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if req.Kind != "cdrom" && req.Kind != "floppy" {
		writeError(w, http.StatusBadRequest, "kind must be cdrom or floppy")
		return
	}

	vm, err := h.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	status := h.manager.GetStatus(id)
	if status.Status == config.StatusRunning {
		if err := h.manager.EjectMedia(id, req.Kind, false); err != nil {
			writeError(w, http.StatusInternalServerError, "qmp eject: "+err.Error())
			return
		}
	}

	if req.Kind == "cdrom" {
		vm.Storage.Cdrom = ""
	} else {
		vm.Storage.Floppy = ""
	}
	if err := h.store.Save(vm); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, vm)
}

func generateID(name string) string {
	id := ""
	for _, c := range name {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') {
			id += string(c)
		} else if c >= 'A' && c <= 'Z' {
			id += string(c + 32)
		} else if c == ' ' || c == '-' {
			id += "-"
		}
	}
	if id == "" {
		id = fmt.Sprintf("vm-%d", time.Now().UnixNano())
	}
	return id
}
