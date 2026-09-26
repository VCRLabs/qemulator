package api

import (
	"fmt"
	"io/fs"
	"net/http"
	"strings"

	"qemulator/internal/config"
	"qemulator/internal/images"
	"qemulator/internal/qemu"
)

type Router struct {
	vmHandler    *VMHandler
	imgHandler   *ImageHandler
	hub          *SSEHub
	manager      *qemu.Manager
	store        *config.VMStore
}

func NewRouter(store *config.VMStore, manager *qemu.Manager, imgManager *images.Manager, hub *SSEHub, staticFS fs.FS) http.Handler {
	r := &Router{
		vmHandler:  NewVMHandler(store, manager, imgManager, hub),
		imgHandler: NewImageHandler(imgManager),
		hub:        hub,
		manager:    manager,
		store:      store,
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/api/vms", r.handleVMs)

	vncProxy := HandleVNCProxy(func(vmID string) (int, error) {
		status := manager.GetStatus(vmID)
		if status.Status != "running" {
			return 0, fmt.Errorf("vm not running")
		}
		return status.VNCPort, nil
	})
	mux.HandleFunc("/api/vms/", func(w http.ResponseWriter, req *http.Request) {
		if strings.HasSuffix(req.URL.Path, "/vnc") {
			vncProxy(w, req)
			return
		}
		r.handleVMsByID(w, req)
	})
	mux.HandleFunc("/api/presets", r.handlePresets)
	mux.HandleFunc("/api/presets/", r.handlePresetsByName)
	mux.HandleFunc("/api/images", r.handleImages)
	mux.HandleFunc("/api/images/create-blank", r.handleCreateBlankImage)
	mux.HandleFunc("/api/images/link", r.handleLinkImage)
	mux.HandleFunc("/api/images/", r.handleImagesByName)
	mux.HandleFunc("/api/events", HandleSSE(hub))
	mux.HandleFunc("/api/qemu/info", HandleQemuInfo(manager, store.DataDir()))

	fileBrowser := NewFileBrowserHandler()
	mux.HandleFunc("/api/files", fileBrowser.List)

	if staticFS != nil {
		fileServer := http.FileServer(http.FS(staticFS))
		mux.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
			path := req.URL.Path
			if path == "/" {
				path = "index.html"
			} else {
				path = strings.TrimPrefix(path, "/")
			}

			f, err := staticFS.Open(path)
			if err == nil {
				f.Close()
				fileServer.ServeHTTP(w, req)
				return
			}

			req.URL.Path = "/"
			fileServer.ServeHTTP(w, req)
		})
	} else {
		mux.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
			if req.URL.Path != "/" {
				http.NotFound(w, req)
				return
			}
			w.Header().Set("Content-Type", "text/html")
			w.Write([]byte(`<!DOCTYPE html><html><head><title>qemulator</title></head><body>
<h1>qemulator</h1>
<p>Frontend not built. Run <code>npm run build</code> in <code>web/</code> or use dev mode.</p>
</body></html>`))
		})
	}

	return mux
}

func (r *Router) handleVMs(w http.ResponseWriter, req *http.Request) {
	switch req.Method {
	case http.MethodGet:
		r.vmHandler.List(w, req)
	case http.MethodPost:
		r.vmHandler.Create(w, req)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (r *Router) handleVMsByID(w http.ResponseWriter, req *http.Request) {
	if req.Method == http.MethodPost && strings.HasSuffix(req.URL.Path, "/start") {
		r.vmHandler.Start(w, req)
		return
	}
	if req.Method == http.MethodPost && strings.HasSuffix(req.URL.Path, "/stop") {
		r.vmHandler.Stop(w, req)
		return
	}
	if req.Method == http.MethodPost && strings.HasSuffix(req.URL.Path, "/restart") {
		r.vmHandler.Restart(w, req)
		return
	}
	if req.Method == http.MethodGet && strings.HasSuffix(req.URL.Path, "/status") {
		r.vmHandler.Status(w, req)
		return
	}
	if req.Method == http.MethodPut && strings.HasSuffix(req.URL.Path, "/media") {
		r.vmHandler.UpdateMedia(w, req)
		return
	}
	if req.Method == http.MethodGet && strings.HasSuffix(req.URL.Path, "/media") {
		r.vmHandler.GetMedia(w, req)
		return
	}
	if req.Method == http.MethodPost && strings.HasSuffix(req.URL.Path, "/media/eject") {
		r.vmHandler.EjectMedia(w, req)
		return
	}
	switch req.Method {
	case http.MethodGet:
		r.vmHandler.Get(w, req)
	case http.MethodPut:
		r.vmHandler.Update(w, req)
	case http.MethodDelete:
		r.vmHandler.Delete(w, req)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (r *Router) handlePresets(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	ListPresets(w, req)
}

func (r *Router) handlePresetsByName(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	GetPreset(w, req)
}

func (r *Router) handleImages(w http.ResponseWriter, req *http.Request) {
	switch req.Method {
	case http.MethodGet:
		r.imgHandler.List(w, req)
	case http.MethodPost:
		r.imgHandler.Upload(w, req)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (r *Router) handleCreateBlankImage(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	r.imgHandler.CreateBlank(w, req)
}

func (r *Router) handleLinkImage(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	r.imgHandler.Link(w, req)
}

func (r *Router) handleImagesByName(w http.ResponseWriter, req *http.Request) {
	if req.Method == http.MethodDelete {
		r.imgHandler.Delete(w, req)
		return
	}
	if req.Method == http.MethodGet {
		r.imgHandler.ServeFile(w, req)
		return
	}
	w.WriteHeader(http.StatusMethodNotAllowed)
}
