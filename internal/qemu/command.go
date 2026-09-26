package qemu

import (
	"fmt"
	"os"

	"qemulator/internal/config"
)

var hasKVM = func() bool {
	_, err := os.Stat("/dev/kvm")
	return err == nil
}()

func HasKVM() bool {
	return hasKVM
}

func BuildArgs(vm *config.VMConfig, vncDisplay int, qmpSocket string) []string {
	var args []string

	args = append(args, "-name", vm.Name)

	if vm.System.Machine != "" {
		args = append(args, "-machine", vm.System.Machine)
	}
	if vm.System.CPU != "" {
		args = append(args, "-cpu", vm.System.CPU)
	}
	if vm.System.RAM != "" {
		args = append(args, "-m", vm.System.RAM)
	}

	if vm.Storage.DiskImage != "" {
		drive := fmt.Sprintf("file=%s,format=%s", vm.Storage.DiskImage, vm.Storage.DiskFormat)
		args = append(args, "-drive", drive)
	}

	if vm.Storage.Cdrom != "" {
		args = append(args, "-drive", fmt.Sprintf("file=%s,media=cdrom,index=1", vm.Storage.Cdrom))
	}

	if vm.Storage.Floppy != "" {
		args = append(args, "-fda", vm.Storage.Floppy)
	}

	if vm.Display.VGA != "" {
		args = append(args, "-vga", vm.Display.VGA)
	}

	if vm.Network.Model != "" {
		args = append(args, "-netdev", "user,id=net0")
		args = append(args, "-device", fmt.Sprintf("%s,netdev=net0", vm.Network.Model))
	}

	args = append(args, "-vnc", fmt.Sprintf("127.0.0.1:%d,share=force-shared", vncDisplay))

	if qmpSocket != "" {
		args = append(args, "-qmp", fmt.Sprintf("unix:%s,server=on,wait=off", qmpSocket))
	}

	if vm.Storage.BootOrder != "" {
		args = append(args, "-boot", vm.Storage.BootOrder)
	}

	args = append(args,
		"-usb",
		"-device", "usb-tablet",
	)

	if hasKVM {
		args = append(args, "-enable-kvm")
	}

	args = append(args, vm.ExtraArgs...)

	return args
}
