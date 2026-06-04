package config

import "fmt"

func errInvalidPort(port string) error {
	return fmt.Errorf("invalid TLX_PORT: %q", port)
}
