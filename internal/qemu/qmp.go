package qemu

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"sync"
	"time"
)

type QMPClient struct {
	conn   net.Conn
	mu     sync.Mutex
	dec    *json.Decoder
	reader *bufio.Reader
}

type qmpGreeting struct {
	QMP struct {
		Version struct {
			QEMU struct {
				Major    int    `json:"major"`
				Minor    int    `json:"minor"`
				Micro    int    `json:"micro"`
				Package  string `json:"package"`
			} `json:"qemu"`
			Package string `json:"package,omitempty"`
		} `json:"version"`
		Capabilities []string `json:"capabilities"`
	} `json:"QMP"`
}

type qmpResponse struct {
	Return json.RawMessage `json:"return"`
	Error  *struct {
		Class string `json:"class"`
		Desc  string `json:"desc"`
	} `json:"error,omitempty"`
}

type qmpEvent struct {
	Event string `json:"event"`
}

func DialQMP(socketPath string) (*QMPClient, error) {
	conn, err := net.DialTimeout("unix", socketPath, 5*time.Second)
	if err != nil {
		return nil, fmt.Errorf("dial qmp socket %s: %w", socketPath, err)
	}

	c := &QMPClient{conn: conn}
	c.reader = bufio.NewReader(conn)
	c.dec = json.NewDecoder(c.reader)

	// Read greeting (a single JSON object on its own line).
	var greeting qmpGreeting
	if err := c.dec.Decode(&greeting); err != nil {
		conn.Close()
		return nil, fmt.Errorf("read qmp greeting: %w", err)
	}

	// Negotiate capabilities.
	if _, err := c.execute("qmp_capabilities", nil); err != nil {
		conn.Close()
		return nil, fmt.Errorf("qmp_capabilities: %w", err)
	}

	return c, nil
}

func (c *QMPClient) Close() error {
	if c == nil || c.conn == nil {
		return nil
	}
	return c.conn.Close()
}

// execute sends a QMP command and returns the raw "return" payload.
// It skips any async events that arrive before the response.
func (c *QMPClient) execute(command string, args map[string]interface{}) (json.RawMessage, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	type cmd struct {
		Execute string                 `json:"execute"`
		Args    map[string]interface{} `json:"arguments,omitempty"`
	}
	req := cmd{Execute: command, Args: args}

	enc := json.NewEncoder(c.conn)
	if err := enc.Encode(&req); err != nil {
		return nil, fmt.Errorf("write qmp command %s: %w", command, err)
	}

	// Read lines until we get a response (skip events).
	for {
		var resp qmpResponse
		if err := c.dec.Decode(&resp); err != nil {
			return nil, fmt.Errorf("read qmp response for %s: %w", command, err)
		}
		if resp.Error != nil {
			return nil, fmt.Errorf("qmp %s: %s", command, resp.Error.Desc)
		}
		if len(resp.Return) == 0 {
			// Possibly an event object with "event" key; the decoder above
			// leaves Return empty. Continue reading.
			continue
		}
		return resp.Return, nil
	}
}

// QMPBlockInfo is a trimmed view of one entry from query-block.
type QMPBlockInfo struct {
	Device       string `json:"device"`
	Drive        string `json:"drive,omitempty"`
	Removable    bool   `json:"removable"`
	Locked       bool   `json:"locked,omitempty"`
	TrayOpen     bool   `json:"tray_open,omitempty"`
	Type         string `json:"type,omitempty"`
	Inserted     *struct {
		File string `json:"file"`
		RO   bool   `json:"ro"`
	} `json:"inserted,omitempty"`
}

func (c *QMPClient) QueryBlock() ([]QMPBlockInfo, error) {
	raw, err := c.execute("query-block", nil)
	if err != nil {
		return nil, err
	}
	var info []QMPBlockInfo
	if err := json.Unmarshal(raw, &info); err != nil {
		return nil, fmt.Errorf("decode query-block: %w", err)
	}
	return info, nil
}

// ChangeMedia swaps the media in a removable device (e.g. cdrom/floppy).
// Uses blockdev-change-medium with raw format (works for iso/img/vfd/etc).
func (c *QMPClient) ChangeMedia(device, filename string) error {
	_, err := c.execute("blockdev-change-medium", map[string]interface{}{
		"device":   device,
		"filename": filename,
		"format":   "raw",
	})
	return err
}

// EjectMedia removes media from a removable device.
func (c *QMPClient) EjectMedia(device string, force bool) error {
	args := map[string]interface{}{"device": device}
	if force {
		args["force"] = true
	}
	_, err := c.execute("eject", args)
	return err
}
