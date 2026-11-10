from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def test_modular_backend_and_clients_exist():
    assert (ROOT / "backend" / "app" / "main.py").is_file()
    assert (ROOT / "backend" / "app" / "api" / "routes.py").is_file()
    assert (ROOT / "backend" / "app" / "database" / "connection.py").is_file()
    assert (ROOT / "backend" / "app" / "services" / "backup_service.py").is_file()
    assert (ROOT / "frontend" / "index.html").is_file()
    assert (ROOT / "frontend" / "css" / "app.css").is_file()
    assert (ROOT / "frontend" / "js" / "app.js").is_file()
    assert (ROOT / "frontend" / "js" / "api-client.js").is_file()
    assert (ROOT / "mobile" / "pubspec.yaml").is_file()
    assert (ROOT / "mobile" / "lib" / "main.dart").is_file()


def test_health_routes_and_browser_address_guidance():
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    main = (root / "backend" / "app" / "main.py").read_text(encoding="utf-8")
    run = (root / "backend" / "run.py").read_text(encoding="utf-8")
    assert '@app.get("/health", include_in_schema=False)' in main
    assert '@app.get("/api/health/ready", include_in_schema=False)' in main
    assert "http://127.0.0.1:" in run


def test_run_script_resolves_backend_from_project_root():
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    run = (root / "backend" / "run.py").read_text(encoding="utf-8")
    assert "app_dir=str(backend_dir)" in run


def test_full_navigation_and_pinned_settings_are_present():
    html = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
    app = (ROOT / "frontend" / "js" / "app.js").read_text(encoding="utf-8")
    mobile = (ROOT / "mobile" / "lib" / "screens" / "home_screen.dart").read_text(encoding="utf-8")
    for label in ("Dashboard", "Weekly Schedule", "Monthly Calendar", "Upcoming Academic Activities",
                  "Modules", "Facilitators", "Examinations", "Recurring Activities",
                  "WhatsApp &amp; Communications", "Analytics Dashboard", "Activity History",
                  "Export &amp; Sharing", "Settings"):
        assert label in html
    assert 'id="settings" class="menu-nav settings-nav"' in html
    assert "'Dashboard', 'Weekly Schedule', 'Monthly Calendar'" in mobile
    assert "ListTile(selected: selected == 12" in mobile


def test_weekly_calendar_is_the_landing_view_with_on_screen_tabs():
    html = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
    app = (ROOT / "frontend" / "js" / "app.js").read_text(encoding="utf-8")
    mobile = (ROOT / "mobile" / "lib" / "screens" / "home_screen.dart").read_text(encoding="utf-8")
    assert 'class="view-tabs"' in html
    tabs = html[html.index('id="view-tabs"'):html.index('</nav>', html.index('id="view-tabs"'))]
    assert 'class="view-tab" data-view="dashboard">Dashboard</button>' in tabs
    assert 'class="view-tab active" data-view="weekly" aria-current="page">Weekly Schedule</button>' in tabs
    assert 'class="view-tab" data-view="upcoming">Upcoming Academic Activities</button>' in tabs
    assert tabs.index('data-view="dashboard"') < tabs.index('data-view="weekly"') < tabs.index('data-view="upcoming"')
    assert 'class="sched-head"' not in html
    assert 'id="week-select"' not in html
    assert 'class="menu-nav" data-view="weekly"' not in html
    assert 'class="menu-nav active" data-view="dashboard"' not in html
    assert 'class="menu-nav" data-view="upcoming"' not in html
    assert 'showView(location.hash.slice(1)||"weekly")' in app
    assert "int selected = 1;" in mobile
    assert "for (var i = 2; i < _labels.length - 1; i++) if (i != 3 && (i != 9 || canAnalytics))" in mobile
    assert "ChoiceChip(label: const Text('Weekly Schedule')" in mobile
    assert "ChoiceChip(label: const Text('Upcoming Academic Activities')" in mobile


def test_scheduling_uses_bounded_date_and_time_pickers():
    app = (ROOT / "frontend" / "js" / "app.js").read_text(encoding="utf-8")
    mobile = (ROOT / "mobile" / "lib" / "screens" / "home_screen.dart").read_text(encoding="utf-8")
    assert 'i.type=type' in app
    assert 'if(type==="date")' in app
    assert 'i.min=iso(now)' in app
    assert 'i.max=iso(new Date(now.getFullYear()+3' in app
    assert 'if(type==="time")i.step="900"' in app
    assert "Choose a date between today and three years from today." in app
    assert "showDatePicker(" in mobile
    assert "firstDate: today" in mobile
    assert "lastDate: DateTime(now.year + 3, now.month, now.day)" in mobile
    assert "showTimePicker(" in mobile
    assert "suffixIcon: Icon(Icons.calendar_month_outlined)" in mobile
    assert "suffixIcon: Icon(Icons.schedule_outlined)" in mobile


def test_recent_activity_panel_is_removed_from_every_view():
    html = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
    app = (ROOT / "frontend" / "js" / "app.js").read_text(encoding="utf-8")
    css = (ROOT / "frontend" / "css" / "app.css").read_text(encoding="utf-8")
    assert 'id="ops-panel"' not in html
    assert 'id="ops-history"' not in html
    assert 'id="ops-status"' not in html
    assert "Recent activity</h2>" not in html
    assert "refreshHistory" not in app
    assert "refreshHealth" not in app
    assert "ops-panel" not in css
    assert "window.exportTimetableCSV" in app
    assert "window.downloadSharedBackup" in app


def test_backend_has_shared_collections_and_manager_analytics():
    routes = (ROOT / "backend" / "app" / "api" / "routes.py").read_text(encoding="utf-8")
    assert '"facilitators", "examinations", "recurring", "communications"' in routes
    assert '"hod", "coordinator", "executive_dean"' in routes
