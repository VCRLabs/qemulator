package api

import (
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func HandleVNCProxy(getVNCPort func(vmID string) (int, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vmID := pathParam(r, "id")
		if vmID == "" {
			http.Error(w, "missing vm id", http.StatusBadRequest)
			return
		}

		vncPort, err := getVNCPort(vmID)
		if err != nil {
			http.Error(w, fmt.Sprintf("vm not running: %v", err), http.StatusBadGateway)
			return
		}

		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("websocket upgrade failed: %v", err)
			return
		}
		defer ws.Close()

		vncAddr := fmt.Sprintf("127.0.0.1:%d", 5900+vncPort)
		tcpConn, err := net.Dial("tcp", vncAddr)
		if err != nil {
			log.Printf("vnc connect failed: %v", err)
			ws.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "vnc connect failed"))
			return
		}
		defer tcpConn.Close()

		var once sync.Once
		closeWS := func() {
			once.Do(func() {
				ws.WriteMessage(websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
			})
		}

		done := make(chan struct{})

		// VNC TCP -> WebSocket
		go func() {
			defer close(done)
			buf := make([]byte, 65536)
			for {
				n, err := tcpConn.Read(buf)
				if n > 0 {
					wsWriter, err := ws.NextWriter(websocket.BinaryMessage)
					if err != nil {
						return
					}
					if _, err := wsWriter.Write(buf[:n]); err != nil {
						wsWriter.Close()
						return
					}
					if err := wsWriter.Close(); err != nil {
						return
					}
				}
				if err != nil {
					return
				}
			}
		}()

		// WebSocket -> VNC TCP
		go func() {
			defer func() {
				tcpConn.Close()
				closeWS()
			}()
			for {
				msgType, msg, err := ws.ReadMessage()
				if err != nil {
					return
				}
				if msgType != websocket.BinaryMessage {
					continue
				}
				if _, err := tcpConn.Write(msg); err != nil {
					return
				}
			}
		}()

		<-done
	}
}

func HandleVNCProxyRaw(getVNCPort func(vmID string) (int, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vmID := pathParam(r, "id")
		if vmID == "" {
			http.Error(w, "missing vm id", http.StatusBadRequest)
			return
		}

		vncPort, err := getVNCPort(vmID)
		if err != nil {
			http.Error(w, fmt.Sprintf("vm not running: %v", err), http.StatusBadGateway)
			return
		}

		hijacker, ok := w.(http.Hijacker)
		if !ok {
			http.Error(w, "hijacking not supported", http.StatusInternalServerError)
			return
		}

		clientConn, clientBuf, err := hijacker.Hijack()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer clientConn.Close()

		vncAddr := fmt.Sprintf("127.0.0.1:%d", 5900+vncPort)
		vncConn, err := net.Dial("tcp", vncAddr)
		if err != nil {
			clientConn.Write([]byte("HTTP/1.1 502 Bad Gateway\r\n\r\n"))
			return
		}
		defer vncConn.Close()

		// Flush any buffered client data
		if clientBuf.Reader.Buffered() > 0 {
			io.Copy(vncConn, clientBuf.Reader)
		}

		var wg sync.WaitGroup
		wg.Add(2)

		go func() {
			defer wg.Done()
			io.Copy(vncConn, clientConn)
		}()

		go func() {
			defer wg.Done()
			io.Copy(clientConn, vncConn)
		}()

		wg.Wait()
	}
}
