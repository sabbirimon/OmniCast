package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"
)

const createNewConsole = 0x00000010

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "Missing scrcpy executable.")
		os.Exit(1)
	}
	child := exec.Command(os.Args[1], os.Args[2:]...)
	child.Stdout, child.Stderr = os.Stdout, os.Stderr
	child.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNewConsole, HideWindow: true}
	if err := child.Start(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	done := make(chan error, 1)
	go func() { done <- child.Wait() }()
	stop := make(chan struct{})
	go func() {
		bufio.NewScanner(os.Stdin).Scan()
		close(stop)
	}()
	select {
	case err := <-done:
		exit(err)
	case <-stop:
		if interrupt(child.Process.Pid) {
			select {
			case err := <-done:
				exit(err)
			case <-time.After(7 * time.Second):
			}
		}
		_ = child.Process.Kill()
		exit(<-done)
	}
}

func interrupt(pid int) bool {
	kernel := syscall.NewLazyDLL("kernel32.dll")
	free := kernel.NewProc("FreeConsole")
	attach := kernel.NewProc("AttachConsole")
	handler := kernel.NewProc("SetConsoleCtrlHandler")
	send := kernel.NewProc("GenerateConsoleCtrlEvent")
	free.Call()
	attached, _, _ := attach.Call(uintptr(pid))
	if attached == 0 {
		return false
	}
	defer free.Call()
	handler.Call(0, 1)
	sent, _, _ := send.Call(0, 0)
	return sent != 0
}

func exit(err error) {
	if err == nil {
		return
	}
	if result, ok := err.(*exec.ExitError); ok {
		os.Exit(result.ExitCode())
	}
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
