package main

import (
	"embed"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Enable GPU rasterization, zero-copy, and remove frame rate limiter for WebView2 on Windows
	if os.Getenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS") == "" {
		_ = os.Setenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist --disable-frame-rate-limit=false")
	}

	app := NewApp()

	err := wails.Run(&options.App{
		Title:     "Esper — Local Visual Notebook",
		Width:     1340,
		Height:    860,
		MinWidth:  960,
		MinHeight: 640,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 2, G: 6, B: 23, A: 255}, // #020617 prevents white flicker
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},

		// Windows: Force High-Performance GPU & Remove Power Throttling
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			DisableWindowIcon:    false,
			WebviewGpuIsDisabled: false,
		},

		// macOS: Enable Smooth Metal Layer Compositing
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			Appearance:           mac.NSAppearanceNameDarkAqua,
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		},

		// Linux: Force Hardware Acceleration on WebKitGTK
		Linux: &linux.Options{
			WebviewGpuPolicy: linux.WebviewGpuPolicyAlways,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
