package qemu

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"qemulator/internal/config"
)

type Instance struct {
	VM       *config.VMConfig
	Cmd      *exec.Cmd
	VNCPort  int
	QMPSock  string
	Status   config.VMStatus
	Error    string
}

type Manager struct {
	mu        sync.RWMutex
	instances map[string]*Instance
	vncUsed   map[int]bool
	qemuBin   string
	dataDir   string
}

func NewManager(qemuBin, dataDir string) *Manager {
	if qemuBin == "" {
		qemuBin = detectQemuBin()
	}
	return &Manager{
		instances: make(map[string]*Instance),
		vncUsed:   make(map[int]bool),
		qemuBin:   qemuBin,
		dataDir:   dataDir,
	}
}

func (m *Manager) Binary() string {
	return m.qemuBin
}

func detectQemuBin() string {
	for _, bin := range []string{"qemu-system-i386", "qemu-system-x86_64"} {
		path, err := exec.LookPath(bin)
		if err == nil {
			return path
		}
	}
	return "qemu-system-i386"
}

func (m *Manager) nextVNCDisplay() int {
	for i := 0; i < 100; i++ {
		if !m.vncUsed[i] {
			m.vncUsed[i] = true
			return i
		}
	}
	return -1
}

func (m *Manager) freeVNCDisplay(display int) {
	delete(m.vncUsed, display)
}

func (m *Manager) logFile(vmID string) string {
	return filepath.Join(m.dataDir, "logs", vmID+".log")
}

func (m *Manager) qmpSocketPath(vmID string) string {
	return filepath.Join(m.dataDir, "qmp", vmID+".sock")
}

func (m *Manager) writeLog(vmID string, msg string) {
	logDir := filepath.Join(m.dataDir, "logs")
	os.MkdirAll(logDir, 0755)

	f, err := os.OpenFile(m.logFile(vmID), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Printf("[%s] %s", vmID, msg)
		return
	}
	defer f.Close()

	ts := time.Now().Format("2006-01-02 15:04:05")
	fmt.Fprintf(f, "[%s] %s\n", ts, msg)
	log.Printf("[%s] %s", vmID, msg)
}

func (m *Manager) GetStatus(id string) *config.VMStatusInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	inst, ok := m.instances[id]
	if !ok {
		return &config.VMStatusInfo{ID: id, Status: config.StatusStopped}
	}

	if inst.Cmd != nil && inst.Cmd.Process != nil && inst.Status == config.StatusRunning {
		if err := inst.Cmd.Process.Signal(syscall.Signal(0)); err != nil {
			inst.Status = config.StatusStopped
		}
	}

	return &config.VMStatusInfo{
		ID:      id,
		Status:  inst.Status,
		VNCPort: inst.VNCPort,
		Error:   inst.Error,
	}
}

func (m *Manager) GetAllStatuses() map[string]*config.VMStatusInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	statuses := make(map[string]*config.VMStatusInfo)
	for id, inst := range m.instances {
		status := inst.Status
		if inst.Cmd != nil && inst.Cmd.Process != nil && status == config.StatusRunning {
			if err := inst.Cmd.Process.Signal(syscall.Signal(0)); err != nil {
				status = config.StatusStopped
			}
		}
		statuses[id] = &config.VMStatusInfo{
			ID:      id,
			Status:  status,
			VNCPort: inst.VNCPort,
			Error:   inst.Error,
		}
	}
	return statuses
}

func (m *Manager) Start(vm *config.VMConfig) (*config.VMStatusInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if inst, ok := m.instances[vm.ID]; ok {
		if inst.Status == config.StatusRunning {
			return nil, fmt.Errorf("vm already running")
		}
		if inst.VNCPort > 0 {
			m.freeVNCDisplay(inst.VNCPort)
		}
	}

	vncDisplay := m.nextVNCDisplay()
	if vncDisplay < 0 {
		return nil, fmt.Errorf("no available VNC display numbers")
	}

	qmpSock := m.qmpSocketPath(vm.ID)
	if err := os.MkdirAll(filepath.Dir(qmpSock), 0755); err != nil {
		m.freeVNCDisplay(vncDisplay)
		return nil, fmt.Errorf("create qmp dir: %w", err)
	}
	// Remove any stale socket file from a previous run.
	os.Remove(qmpSock)

	args := BuildArgs(vm, vncDisplay, qmpSock)
	cmd := exec.Command(m.qemuBin, args...)

	logDir := filepath.Join(m.dataDir, "logs")
	os.MkdirAll(logDir, 0755)
	stdoutPath := filepath.Join(logDir, vm.ID+".stdout.log")
	stderrPath := filepath.Join(logDir, vm.ID+".stderr.log")

	// Clear old logs
	os.Truncate(stdoutPath, 0)
	os.Truncate(stderrPath, 0)

	stdout, err := os.Create(stdoutPath)
	if err != nil {
		m.freeVNCDisplay(vncDisplay)
		return nil, err
	}
	stderr, err := os.Create(stderrPath)
	if err != nil {
		stdout.Close()
		m.freeVNCDisplay(vncDisplay)
		return nil, err
	}

	cmd.Stdout = stdout
	cmd.Stderr = stderr

	m.writeLog(vm.ID, fmt.Sprintf("STARTING: %s %s", m.qemuBin, strings.Join(args, " ")))

	if err := cmd.Start(); err != nil {
		stdout.Close()
		stderr.Close()
		m.freeVNCDisplay(vncDisplay)
		m.writeLog(vm.ID, fmt.Sprintf("START FAILED: %v", err))
		return nil, fmt.Errorf("failed to start qemu: %w", err)
	}

	inst := &Instance{
		VM:      vm,
		Cmd:     cmd,
		VNCPort: vncDisplay,
		QMPSock: qmpSock,
		Status:  config.StatusRunning,
	}
	m.instances[vm.ID] = inst

	m.writeLog(vm.ID, fmt.Sprintf("STARTED: pid=%d vnc=:%d", cmd.Process.Pid, vncDisplay))

	go func() {
		err := cmd.Wait()

		m.mu.Lock()
		defer m.mu.Unlock()

		stdout.Close()
		stderr.Close()

		if inst, ok := m.instances[vm.ID]; ok {
			if err != nil {
				inst.Status = config.StatusError
				inst.Error = err.Error()
				m.writeLog(vm.ID, fmt.Sprintf("EXIT ERROR: %v", err))

				// Log last few lines of stderr
				if lines := m.readTail(stderrPath, 10); lines != "" {
					m.writeLog(vm.ID, fmt.Sprintf("STDERR:\n%s", lines))
				}
			} else {
				inst.Status = config.StatusStopped
				m.writeLog(vm.ID, "STOPPED: exited cleanly")
			}
			m.freeVNCDisplay(vncDisplay)
			os.Remove(inst.QMPSock)
		}
	}()

	return &config.VMStatusInfo{
		ID:      vm.ID,
		Status:  config.StatusRunning,
		VNCPort: vncDisplay,
	}, nil
}

func (m *Manager) Stop(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	inst, ok := m.instances[id]
	if !ok || inst.Status != config.StatusRunning {
		return fmt.Errorf("vm not running")
	}

	if inst.Cmd.Process == nil {
		return fmt.Errorf("no process found")
	}

	inst.Status = config.StatusStopping
	m.writeLog(id, fmt.Sprintf("STOPPING: sending SIGTERM to pid=%d", inst.Cmd.Process.Pid))

	if err := inst.Cmd.Process.Signal(syscall.SIGTERM); err != nil {
		m.writeLog(id, "SIGTERM failed, sending SIGKILL")
		inst.Cmd.Process.Signal(syscall.SIGKILL)
		m.freeVNCDisplay(inst.VNCPort)
		os.Remove(inst.QMPSock)
		inst.Status = config.StatusStopped
		return nil
	}

	go func() {
		time.AfterFunc(5*time.Second, func() {
			m.mu.Lock()
			defer m.mu.Unlock()
			if inst, ok := m.instances[id]; ok && inst.Status == config.StatusStopping {
				m.writeLog(id, "FORCE KILL: SIGTERM timed out, sending SIGKILL")
				inst.Cmd.Process.Signal(syscall.SIGKILL)
				m.freeVNCDisplay(inst.VNCPort)
				os.Remove(inst.QMPSock)
				inst.Status = config.StatusStopped
			}
		})
	}()

	return nil
}

func (m *Manager) StopAll() {
	m.mu.Lock()
	instances := make([]*Instance, 0, len(m.instances))
	for _, inst := range m.instances {
		if inst.Status == config.StatusRunning && inst.Cmd.Process != nil {
			instances = append(instances, inst)
		}
	}
	m.mu.Unlock()

	for _, inst := range instances {
		m.writeLog(inst.VM.ID, "SHUTDOWN: sending SIGTERM")
		if inst.Cmd.Process != nil {
			inst.Cmd.Process.Signal(syscall.SIGTERM)
		}
	}

	time.Sleep(2 * time.Second)

	m.mu.Lock()
	defer m.mu.Unlock()
	for _, inst := range m.instances {
		if inst.Status == config.StatusRunning || inst.Status == config.StatusStopping {
		if inst.Cmd.Process != nil {
			inst.Cmd.Process.Signal(syscall.SIGKILL)
		}
		m.freeVNCDisplay(inst.VNCPort)
		os.Remove(inst.QMPSock)
		inst.Status = config.StatusStopped
		m.writeLog(inst.VM.ID, "SHUTDOWN: force killed")
		}
	}
}

func (m *Manager) readTail(path string, maxLines int) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()

	var lines []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}

	if len(lines) > maxLines {
		lines = lines[len(lines)-maxLines:]
	}
	return strings.Join(lines, "\n")
}

// qmpClientFor returns a short-lived QMP connection to the running VM.
// The caller is expected to Close it when done.
func (m *Manager) qmpClientFor(id string) (*QMPClient, error) {
	m.mu.RLock()
	inst, ok := m.instances[id]
	m.mu.RUnlock()
	if !ok || inst.Status != config.StatusRunning {
		return nil, fmt.Errorf("vm not running")
	}
	if inst.QMPSock == "" {
		return nil, fmt.Errorf("vm has no qmp socket")
	}
	return DialQMP(inst.QMPSock)
}

// classifyRemovable returns "cdrom" or "floppy" based on the QMP device
// name. QEMU's `type` field is unreliable (often empty), but device names
// follow stable conventions:
//   - cdrom: "ide1-cd0", "ide-cd", "sata-cd", "scsi-cd", etc. (contain "cd")
//   - floppy: "fda", "fdb", "floppy0", etc. (contain "fd" or "floppy")
// Returns "" if the device can't be classified (and should be skipped).
func classifyRemovable(deviceName string) string {
	low := strings.ToLower(deviceName)
	if strings.Contains(low, "fd") || strings.Contains(low, "floppy") {
		return "floppy"
	}
	if strings.Contains(low, "cd") {
		return "cdrom"
	}
	return ""
}

// ListBlockDevices queries QMP for the VM's block devices and returns
// only removable cdrom/floppy drives (the ones media can be swapped on).
// Kind is derived from the device name since QMP's `type` field is often
// empty.
func (m *Manager) ListBlockDevices(id string) ([]QMPBlockInfo, error) {
	cli, err := m.qmpClientFor(id)
	if err != nil {
		return nil, err
	}
	defer cli.Close()

	all, err := cli.QueryBlock()
	if err != nil {
		return nil, err
	}
	var result []QMPBlockInfo
	for _, b := range all {
		if !b.Removable {
			continue
		}
		kind := classifyRemovable(b.Device)
		if kind == "" {
			continue
		}
		b.Type = kind
		result = append(result, b)
	}
	return result, nil
}

// findRemovableDevice returns the QMP device name for the removable block
// device of the given kind ("cdrom" or "floppy"), using an open client.
func findRemovableDevice(cli *QMPClient, kind string) (string, error) {
	all, err := cli.QueryBlock()
	if err != nil {
		return "", err
	}
	for _, b := range all {
		if !b.Removable {
			continue
		}
		if classifyRemovable(b.Device) == kind {
			return b.Device, nil
		}
	}
	return "", fmt.Errorf("no removable %s device found", kind)
}

// ChangeMedia swaps the media in a removable device on a running VM.
// kind is "cdrom" or "floppy".
func (m *Manager) ChangeMedia(id, kind, filename string) error {
	cli, err := m.qmpClientFor(id)
	if err != nil {
		return err
	}
	defer cli.Close()

	device, err := findRemovableDevice(cli, kind)
	if err != nil {
		return err
	}
	return cli.ChangeMedia(device, filename)
}

// EjectMedia removes media from a removable device on a running VM.
// kind is "cdrom" or "floppy".
func (m *Manager) EjectMedia(id, kind string, force bool) error {
	cli, err := m.qmpClientFor(id)
	if err != nil {
		return err
	}
	defer cli.Close()

	device, err := findRemovableDevice(cli, kind)
	if err != nil {
		return err
	}
	return cli.EjectMedia(device, force)
}

