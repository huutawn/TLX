package process

import "fmt"

func errPortBusy(port int) error {
	return fmt.Errorf("port %d is already used by another process, not a TLX worker", port)
}
