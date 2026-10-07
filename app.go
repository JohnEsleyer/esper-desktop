package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type Config struct {
	CurrentWorkspace string   `json:"currentWorkspace"`
	RecentWorkspaces []string `json:"recentWorkspaces"`
}

type App struct {
	ctx        context.Context
	configPath string
	config     Config
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = "."
	}
	appDir := filepath.Join(configDir, "esper")
	_ = os.MkdirAll(appDir, 0755)
	a.configPath = filepath.Join(appDir, "config.json")

	a.loadConfig()
}

func (a *App) loadConfig() {
	data, err := os.ReadFile(a.configPath)
	if err != nil {
		a.config = Config{
			CurrentWorkspace: "",
			RecentWorkspaces: []string{},
		}
		return
	}
	_ = json.Unmarshal(data, &a.config)
}

func (a *App) saveConfig() {
	if a.configPath == "" {
		return
	}
	data, err := json.MarshalIndent(a.config, "", "  ")
	if err == nil {
		_ = os.WriteFile(a.configPath, data, 0644)
	}
}

// SelectWorkspaceFolder opens a native OS directory picker dialog
func (a *App) SelectWorkspaceFolder() (string, error) {
	chosen, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Esper Workspace Folder",
	})
	if err != nil || chosen == "" {
		return "", err
	}

	_ = a.SetCurrentWorkspace(chosen)
	return chosen, nil
}

// GetCurrentWorkspace returns the active workspace path and the list of recent workspaces
func (a *App) GetCurrentWorkspace() (string, []string) {
	return a.config.CurrentWorkspace, a.config.RecentWorkspaces
}

// SetCurrentWorkspace updates the active workspace and appends to recents
func (a *App) SetCurrentWorkspace(path string) error {
	if path == "" {
		return nil
	}
	_ = os.MkdirAll(path, 0755)

	a.config.CurrentWorkspace = path

	// Deduplicate and maintain recent workspaces (max 8)
	newRecents := []string{path}
	for _, r := range a.config.RecentWorkspaces {
		if r != path && len(newRecents) < 8 {
			newRecents = append(newRecents, r)
		}
	}
	a.config.RecentWorkspaces = newRecents
	a.saveConfig()
	return nil
}

// ListNotebooks reads all *.esper JSON notebook files from the active workspace directory
func (a *App) ListNotebooks() ([]string, error) {
	ws := a.config.CurrentWorkspace
	if ws == "" {
		return []string{}, nil
	}

	entries, err := os.ReadDir(ws)
	if err != nil {
		return nil, fmt.Errorf("could not read workspace folder: %w", err)
	}

	var docs []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".esper") {
			filePath := filepath.Join(ws, entry.Name())
			content, err := os.ReadFile(filePath)
			if err == nil {
				docs = append(docs, string(content))
			}
		}
	}
	return docs, nil
}

// SaveNotebook writes the notebook JSON payload to <workspace>/<id>.esper
func (a *App) SaveNotebook(id string, jsonContent string) error {
	ws := a.config.CurrentWorkspace
	if ws == "" {
		return fmt.Errorf("no workspace selected")
	}

	cleanID := filepath.Base(id)
	targetPath := filepath.Join(ws, cleanID+".esper")
	return os.WriteFile(targetPath, []byte(jsonContent), 0644)
}

// DeleteNotebook removes <workspace>/<id>.esper from disk
func (a *App) DeleteNotebook(id string) error {
	ws := a.config.CurrentWorkspace
	if ws == "" {
		return fmt.Errorf("no workspace selected")
	}

	cleanID := filepath.Base(id)
	targetPath := filepath.Join(ws, cleanID+".esper")
	return os.Remove(targetPath)
}
