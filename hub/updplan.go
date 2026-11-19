package main

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"kit"
	"kit/setup"
	"kit/update"
)

// Update-Hinweis: Plan für ein bereitliegendes Update (jetzt, später, beim Beenden).
type UpdPlan struct {
	At      int64  `json:"at"`      // Unix-Zeit, 0 = kein Termin
	OnExit  bool   `json:"onExit"`  // beim Beenden des Hubs installieren
	Version string `json:"version"` // für welche Version der Plan gilt
}

var (
	planMu      sync.Mutex
	plan        UpdPlan
	dismissed   string // weggeklickte Version
	dismissedAt time.Time
)

// remindAfter: wie lange der Hinweis nach dem Wegklicken weg bleibt (0 = bis zum nächsten Start).
func remindAfter(v string) time.Duration {
	switch v {
	case "start":
		return 0
	case "1h":
		return time.Hour
	case "1d":
		return 24 * time.Hour
	}
	return 4 * time.Hour
}

func (a *App) updInfo() map[string]any {
	s := update.Get()
	planMu.Lock()
	defer planMu.Unlock()
	if plan.Version != "" && plan.Version != s.Latest {
		plan = UpdPlan{}
	}
	a.mu.Lock()
	quiet, remind := a.set.UpdQuiet, a.set.UpdRemind
	a.mu.Unlock()
	hidden := quiet
	if dismissed != "" && dismissed == s.Latest {
		if d := remindAfter(remind); d == 0 || time.Since(dismissedAt) < d {
			hidden = true
		}
	}
	return map[string]any{
		"available": s.Available && s.Ready,
		"version":   s.Latest,
		"current":   s.Current,
		"source":    s.Source,
		"notes":     s.Notes,
		"plan":      plan,
		"dismissed": hidden,
		"repo":      update.GitHubRepo,
	}
}

// installNow schließt die Werkzeuge, spielt das Update ein und startet den Hub kurz neu.
func (a *App) installNow() error {
	setup.StopTools()
	planMu.Lock()
	plan = UpdPlan{}
	a.save("update-plan.json", plan)
	planMu.Unlock()
	return update.Apply(a.quit)
}

func (a *App) updRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/upd", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		s := update.Get()
		switch q.Get("do") {
		case "install":
			if err := a.installNow(); err != nil {
				fail(w, 400, err.Error())
				return
			}
		case "plan":
			at, _ := strconv.ParseInt(q.Get("at"), 10, 64)
			planMu.Lock()
			plan = UpdPlan{At: at, OnExit: q.Get("exit") == "1", Version: s.Latest}
			a.save("update-plan.json", plan)
			planMu.Unlock()
		case "unplan":
			planMu.Lock()
			plan = UpdPlan{}
			a.save("update-plan.json", plan)
			planMu.Unlock()
		case "dismiss":
			planMu.Lock()
			dismissed, dismissedAt = s.Latest, time.Now()
			planMu.Unlock()
		}
		writeJSON(w, a.updInfo())
	})
}

// updLoop sucht regelmäßig nach einem neueren Setup und führt geplante Installationen aus.
func (a *App) updLoop() {
	a.load("update-plan.json", &plan)
	for {
		a.mu.Lock()
		auto := a.set.AutoUpdate
		a.mu.Unlock()
		// GitHub: alle 30 Minuten nachsehen (nach einem Fehler nach 5), damit neue Versionen
		// auch bei lange laufendem Hub angezeigt werden. Bei Auto-Update gleich im Hintergrund laden.
		if update.HasServer() && update.Due() {
			update.Check(kit.Lang())
		}
		if auto {
			update.CheckLocal()
			if s := update.Get(); update.HasServer() && s.Available && s.Source == "server" && !s.Ready && !s.Loading && s.Error == "" {
				update.Download()
			}
		}
		s := update.Get()
		planMu.Lock()
		due := plan.At > 0 && time.Now().Unix() >= plan.At && plan.Version == s.Latest && s.Ready
		planMu.Unlock()
		if due {
			a.installNow()
			return
		}
		time.Sleep(20 * time.Second)
	}
}

// updOnExit: beim Beenden des Hubs ein geplantes Update einspielen (ohne Neustart-Zwang).
func (a *App) updOnExit() bool {
	s := update.Get()
	planMu.Lock()
	go_ := plan.OnExit && plan.Version == s.Latest && s.Ready
	planMu.Unlock()
	if !go_ {
		return false
	}
	planMu.Lock()
	plan = UpdPlan{}
	a.save("update-plan.json", plan)
	planMu.Unlock()
	return update.ApplyOnExit() == nil
}
