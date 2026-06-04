package cli

import (
	"github.com/spf13/cobra"

	"tlx/internal/config"
	"tlx/internal/process"
)

func NewRootCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:           "tlx",
		Short:         "TLX local-first execution engine",
		SilenceUsage:  true,
		SilenceErrors: true,
		Args:          cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := config.LoadConfig()
			if err != nil {
				return err
			}

			return process.Run(cmd.Context(), cfg)
		},
	}

	cmd.CompletionOptions.DisableDefaultCmd = true

	return cmd
}
