//! Teamflow for Windows: a window and a tray icon around the Teamflow server.
//!
//! The installer ships the Windows release zip and a Node 20 `node.exe`. On start the app makes
//! the same layout the PowerShell one-liner makes (in %LOCALAPPDATA%\Teamflow), so both share
//! updates, backups and docs:
//!
//!   .env  data\  backups\  node\node.exe  releases\vX.Y.Z\  current -> releases\vX.Y.Z
//!
//! It then runs `node current\apps\server\dist\index.js` and keeps it running. An update from
//! Settings → Updates (update.ps1) stops node while it holds data\.update.lock; the app waits for
//! the lock to go and starts the new version. Closing the window keeps the server running for
//! people on the network; Quit in the tray menu stops it.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, Url, WindowEvent, Wry};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_opener::OpenerExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct AppState {
    root: PathBuf,
    port: Mutex<u16>,
    child: Mutex<Option<Child>>,
    quitting: AtomicBool,
    navigated: AtomicBool,
    network_item: Mutex<Option<MenuItem<Wry>>>,
    autostart_item: Mutex<Option<CheckMenuItem<Wry>>>,
    /// The bundled "Starting Teamflow…" page, to go back to if the server cannot run.
    loading_url: Mutex<Option<Url>>,
}

type Shared = Arc<AppState>;

fn main() {
    let hidden = std::env::args().any(|a| a == "--hidden");
    let root = install_root();
    let state: Shared = Arc::new(AppState {
        root,
        port: Mutex::new(3000),
        child: Mutex::new(None),
        quitting: AtomicBool::new(false),
        navigated: AtomicBool::new(false),
        network_item: Mutex::new(None),
        autostart_item: Mutex::new(None),
        loading_url: Mutex::new(None),
    });

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main(app)
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_opener::init())
        .manage(state.clone())
        .setup(move |app| {
            build_tray(app.handle())?;
            if let Some(window) = app.get_webview_window("main") {
                *state.loading_url.lock().unwrap() = window.url().ok();
            }
            if !hidden {
                show_main(app.handle());
            }
            let handle = app.handle().clone();
            let shared = state.clone();
            thread::spawn(move || {
                if let Err(err) = prepare(&handle, &shared) {
                    set_status(&handle, "Teamflow couldn't start", &err, true, "");
                    show_main(&handle);
                    return;
                }
                supervise(&handle, &shared);
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window keeps Teamflow running in the tray for people on the network.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while starting Teamflow");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            stop_server(&handle.state::<Shared>());
        }
    });
}

/* ---------------------------------------------------------------- paths and settings */

fn install_root() -> PathBuf {
    if let Ok(dir) = std::env::var("TEAMFLOW_ROOT") {
        return PathBuf::from(dir);
    }
    let base = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".into());
    PathBuf::from(base).join("Teamflow")
}

fn read_version(release_dir: &Path) -> Option<String> {
    let text = fs::read_to_string(release_dir.join("version.json")).ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    json.get("version")?.as_str().map(str::to_string)
}

/// SemVer comparison (x.y.z with optional -pre); pre-releases sort before their release.
fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let split = |v: &str| {
        let (main, pre) = match v.split_once('-') {
            Some((m, p)) => (m.to_string(), Some(p.to_string())),
            None => (v.to_string(), None),
        };
        let nums: Vec<u64> = main.split('.').map(|n| n.parse().unwrap_or(0)).collect();
        (nums, pre)
    };
    let (an, ap) = split(a);
    let (bn, bp) = split(b);
    for i in 0..3 {
        let x = an.get(i).copied().unwrap_or(0);
        let y = bn.get(i).copied().unwrap_or(0);
        if x != y {
            return x.cmp(&y);
        }
    }
    match (ap, bp) {
        (None, None) => std::cmp::Ordering::Equal,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (Some(_), None) => std::cmp::Ordering::Less,
        (Some(x), Some(y)) => x.cmp(&y),
    }
}

fn random_hex() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("no random source");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn env_get(lines: &[String], key: &str) -> Option<String> {
    let prefix = format!("{key}=");
    lines
        .iter()
        .rev()
        .find(|l| l.starts_with(&prefix))
        .map(|l| l[prefix.len()..].trim().trim_matches('"').to_string())
        .filter(|v| !v.is_empty())
}

fn is_placeholder(secret: &str) -> bool {
    secret.len() < 16 || secret.starts_with("change-me") || secret == "dev-secret"
}

fn free_port() -> u16 {
    (3000..3100)
        .find(|p| TcpListener::bind(("0.0.0.0", *p)).is_ok())
        .unwrap_or(3000)
}

/// Create or complete .env: only missing keys are added, existing values are never changed.
fn ensure_env(root: &Path) -> Result<u16, String> {
    let file = root.join(".env");
    let fresh = !file.exists();
    let mut lines: Vec<String> = if fresh {
        vec![
            "# Teamflow settings. Written by the Teamflow app; it only adds missing lines.".into(),
            "# Site name, public address, e-mail and invites are set on the Server admin page."
                .into(),
            "NODE_ENV=production".into(),
        ]
    } else {
        fs::read_to_string(&file)
            .map_err(|e| format!("Couldn't read {}: {e}", file.display()))?
            .lines()
            .map(str::to_string)
            .collect()
    };
    let add = |lines: &mut Vec<String>, key: &str, value: String| {
        if env_get(lines, key).is_none() {
            lines.retain(|l| !l.starts_with(&format!("{key}=")));
            lines.push(format!("{key}={value}"));
        }
    };
    add(&mut lines, "PORT", free_port().to_string());
    add(&mut lines, "HOST", "0.0.0.0".into());
    add(&mut lines, "DATABASE_URL", "file:./data/teamflow.db".into());
    add(&mut lines, "SERVE_WEB", "true".into());
    add(&mut lines, "TEAMFLOW_MAINTENANCE_ENABLED", "true".into());
    let jwt = env_get(&lines, "JWT_SECRET").unwrap_or_default();
    if is_placeholder(&jwt) {
        lines.retain(|l| !l.starts_with("JWT_SECRET="));
        add(&mut lines, "JWT_SECRET", random_hex());
    }
    if env_get(&lines, "TEAMFLOW_SECRETS_KEY").is_none() {
        // On an existing install, stored secrets were encrypted with JWT_SECRET; keep that key.
        let key = if fresh {
            random_hex()
        } else {
            env_get(&lines, "JWT_SECRET").unwrap_or_else(random_hex)
        };
        add(&mut lines, "TEAMFLOW_SECRETS_KEY", key);
    }
    let mut text = lines.join("\r\n");
    text.push_str("\r\n");
    fs::write(&file, text).map_err(|e| format!("Couldn't write {}: {e}", file.display()))?;
    env_get(&lines, "PORT")
        .and_then(|p| p.parse().ok())
        .ok_or_else(|| "PORT in .env is not a number".to_string())
}

fn hidden_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

fn set_junction(link: &Path, target: &Path) -> Result<(), String> {
    if link.exists() || fs::symlink_metadata(link).is_ok() {
        // rmdir removes a junction itself, never what it points to.
        let _ = hidden_command("cmd")
            .args(["/c", "rmdir"])
            .arg(link)
            .status();
    }
    let ok = hidden_command("cmd")
        .args(["/c", "mklink", "/J"])
        .arg(link)
        .arg(target)
        .stdout(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if ok {
        Ok(())
    } else {
        Err(format!(
            "Couldn't link {} to {}",
            link.display(),
            target.display()
        ))
    }
}

/* ---------------------------------------------------------------- first run and app upgrades */

fn prepare(app: &AppHandle, state: &Shared) -> Result<(), String> {
    let root = &state.root;
    for dir in ["releases", "data", "backups", "node", "data\\logs"] {
        fs::create_dir_all(root.join(dir)).map_err(|e| format!("Couldn't create {dir}: {e}"))?;
    }
    let resources = app
        .path()
        .resource_dir()
        .map_err(|e| format!("No resource folder: {e}"))?;
    let bundled = app.package_info().version.to_string();

    // Node 20 that came with this version of the app.
    let node = root.join("node").join("node.exe");
    let marker = root.join("node").join(".from-app");
    let marker_version = fs::read_to_string(&marker).unwrap_or_default();
    if !node.exists() || marker_version.trim() != bundled {
        set_status(app, "Setting up Teamflow…", "Copying Node.js", false, "");
        fs::copy(resources.join("node").join("node.exe"), &node)
            .map_err(|e| format!("Couldn't copy node.exe: {e}"))?;
        let _ = fs::write(&marker, &bundled);
    }

    // The bundled release, on first run or when this app is newer than what is installed.
    let current = root.join("current");
    let installed = read_version(&current);
    let needs = match &installed {
        None => true,
        Some(v) => compare_versions(&bundled, v) == std::cmp::Ordering::Greater,
    };
    if needs {
        set_status(
            app,
            "Setting up Teamflow…",
            &format!("Installing v{bundled}"),
            false,
            "",
        );
        let target = root.join("releases").join(format!("v{bundled}"));
        let tmp = root.join("releases").join(format!("v{bundled}.tmp"));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
        let tar =
            PathBuf::from(std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into()))
                .join("System32")
                .join("tar.exe");
        let ok = hidden_command(tar)
            .arg("-x")
            .arg("-f")
            .arg(resources.join("release.zip"))
            .arg("-C")
            .arg(&tmp)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !ok || read_version(&tmp).as_deref() != Some(bundled.as_str()) {
            return Err("The bundled Teamflow release could not be unpacked.".into());
        }
        if installed.is_some() {
            // An app upgrade: keep a copy of the database first (the server migrates on start).
            let db = root.join("data").join("teamflow.db");
            if db.exists() {
                let backup = root.join("backups").join(format!(
                    "teamflow_before-v{}-{}.db",
                    bundled,
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0)
                ));
                let _ = hidden_command(&node)
                    .arg(current.join("apps\\server\\dist\\backup-db.js"))
                    .arg(&backup)
                    .current_dir(root)
                    .status();
            }
        }
        let _ = fs::remove_dir_all(&target);
        fs::rename(&tmp, &target)
            .map_err(|e| format!("Couldn't move the release into place: {e}"))?;
        set_junction(&current, &target)?;
    }

    let port = ensure_env(root)?;
    *state.port.lock().unwrap() = port;
    if let Some(item) = state.network_item.lock().unwrap().as_ref() {
        let _ = item.set_text(format!("On your network: http://{}:{port}", lan_ip()));
    }

    // Start with Windows by default; the tray menu turns it off. Not for a TEAMFLOW_ROOT test copy.
    let asked = root.join("data").join(".autostart-set");
    if !asked.exists() && std::env::var_os("TEAMFLOW_ROOT").is_none() {
        let _ = app.autolaunch().enable();
        let _ = fs::write(&asked, "1");
        update_autostart_check(app);
    }
    Ok(())
}

/* ---------------------------------------------------------------- the server */

#[cfg(windows)]
fn process_alive(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, STILL_ACTIVE};
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        let mut code: u32 = 0;
        let ok = GetExitCodeProcess(handle, &mut code) != 0;
        CloseHandle(handle);
        ok && code == STILL_ACTIVE as u32
    }
}

#[cfg(not(windows))]
fn process_alive(_pid: u32) -> bool {
    false
}

/// Ties node to this app: Windows ends it when the app goes away, even when the app is killed or
/// crashes. Only node itself: what it starts (update.ps1 and the like) breaks away silently, so
/// an update keeps going when the app quits during it.
#[cfg(windows)]
fn bind_to_app(child: &std::process::Child) {
    use std::os::windows::io::AsRawHandle;
    use std::sync::OnceLock;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK,
    };
    static JOB: OnceLock<usize> = OnceLock::new();
    let job = *JOB.get_or_init(|| unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return 0;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags =
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK;
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        job as usize
    });
    if job != 0 {
        unsafe {
            AssignProcessToJobObject(job as _, child.as_raw_handle() as _);
        }
    }
}

#[cfg(not(windows))]
fn bind_to_app(_child: &std::process::Child) {}

/// An update or restore holds data\.update.lock (with its PID) while node is stopped.
fn update_running(root: &Path) -> bool {
    let lock = root.join("data").join(".update.lock");
    match fs::read_to_string(lock) {
        Ok(text) => text
            .trim()
            .parse::<u32>()
            .map(process_alive)
            .unwrap_or(false),
        Err(_) => false,
    }
}

fn http_get(port: u16, path: &str) -> Option<(u16, String)> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_secs(2)).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(3))).ok()?;
    write!(
        stream,
        "GET {path} HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n"
    )
    .ok()?;
    let mut text = String::new();
    stream.read_to_string(&mut text).ok()?;
    let status = text.split_whitespace().nth(1)?.parse().ok()?;
    let body = text
        .split_once("\r\n\r\n")
        .map(|(_, b)| b.to_string())
        .unwrap_or_default();
    Some((status, body))
}

fn lan_ip() -> String {
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("192.0.2.1:80")?;
            s.local_addr()
        })
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "localhost".into())
}

/// Where the window goes once the server answers: the setup page on a new install.
fn start_url(root: &Path, port: u16) -> String {
    let base = format!("http://localhost:{port}");
    if let Some((200, body)) = http_get(port, "/auth/setup") {
        if body.contains("\"needed\":true") {
            for _ in 0..10 {
                if let Ok(code) = fs::read_to_string(root.join("data").join("setup-code")) {
                    let code = code.lines().next().unwrap_or("").trim().to_string();
                    if !code.is_empty() {
                        return format!("{base}/setup?code={code}");
                    }
                }
                thread::sleep(Duration::from_secs(1));
            }
            return format!("{base}/setup");
        }
    }
    base
}

fn supervise(app: &AppHandle, state: &Shared) {
    let root = state.root.clone();
    let _ = fs::write(
        root.join("data").join("supervisor.pid"),
        std::process::id().to_string(),
    );
    let mut quick_crashes = 0;
    loop {
        if state.quitting.load(Ordering::SeqCst) {
            break;
        }
        let waited = Instant::now();
        while update_running(&root) && waited.elapsed() < Duration::from_secs(600) {
            thread::sleep(Duration::from_secs(1));
        }

        let log = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(root.join("data").join("logs").join("server.log"));
        let (out, err) = match log.and_then(|f| Ok((f.try_clone()?, f))) {
            Ok((a, b)) => (Stdio::from(a), Stdio::from(b)),
            Err(_) => (Stdio::null(), Stdio::null()),
        };
        let spawned = hidden_command(root.join("node").join("node.exe"))
            .arg(root.join("current").join("apps\\server\\dist\\index.js"))
            .current_dir(&root)
            .env("TEAMFLOW_SUPERVISOR", "app")
            .stdout(out)
            .stderr(err)
            .spawn();
        let child = match spawned {
            Ok(c) => {
                bind_to_app(&c);
                c
            }
            Err(e) => {
                set_status(
                    app,
                    "Teamflow couldn't start",
                    &format!("node.exe: {e}"),
                    true,
                    "",
                );
                show_main(app);
                return;
            }
        };
        let started = Instant::now();
        *state.child.lock().unwrap() = Some(child);

        if !state.navigated.load(Ordering::SeqCst) {
            let handle = app.clone();
            let shared = state.clone();
            thread::spawn(move || wait_and_open(&handle, &shared));
        }

        // Wait for node to exit, checking now and then so Quit can stop it.
        let code = loop {
            if state.quitting.load(Ordering::SeqCst) {
                return;
            }
            let mut guard = state.child.lock().unwrap();
            match guard.as_mut().map(|c| c.try_wait()) {
                Some(Ok(Some(status))) => {
                    *guard = None;
                    break status.code();
                }
                Some(Ok(None)) => {}
                _ => break None,
            }
            drop(guard);
            thread::sleep(Duration::from_millis(500));
        };

        if state.quitting.load(Ordering::SeqCst) {
            break;
        }
        if update_running(&root) {
            continue; // stopped for an update or restore; start the new version once it is done
        }
        if started.elapsed() > Duration::from_secs(60) {
            quick_crashes = 0;
        }
        quick_crashes += 1;
        if quick_crashes >= 5 {
            let tail = fs::read_to_string(root.join("data").join("logs").join("server.log"))
                .map(|t| {
                    t.lines()
                        .rev()
                        .take(15)
                        .collect::<Vec<_>>()
                        .into_iter()
                        .rev()
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default();
            let loading = state.loading_url.lock().unwrap().clone();
            if let (Some(window), Some(url)) = (app.get_webview_window("main"), loading) {
                let _ = window.navigate(url);
            }
            state.navigated.store(false, Ordering::SeqCst);
            thread::sleep(Duration::from_secs(1));
            set_status(
                app,
                "Teamflow keeps stopping",
                &format!(
                    "The server exited {} times (last code {:?}).",
                    quick_crashes, code
                ),
                true,
                &tail,
            );
            show_main(app);
            return;
        }
        thread::sleep(Duration::from_secs(3));
    }
}

fn wait_and_open(app: &AppHandle, state: &Shared) {
    let port = *state.port.lock().unwrap();
    let begun = Instant::now();
    while begun.elapsed() < Duration::from_secs(90) {
        if let Some((200, body)) = http_get(port, "/health") {
            if body.contains("\"ok\":true") {
                let url = start_url(&state.root, port);
                if let (Some(window), Ok(parsed)) =
                    (app.get_webview_window("main"), Url::parse(&url))
                {
                    if !state.navigated.swap(true, Ordering::SeqCst) {
                        let _ = window.navigate(parsed);
                    }
                }
                return;
            }
        }
        thread::sleep(Duration::from_millis(500));
    }
    set_status(
        app,
        "Teamflow is slow to start",
        "Still waiting for the server. The log is in data\\logs\\server.log.",
        true,
        "",
    );
}

fn stop_server(state: &Shared) {
    state.quitting.store(true, Ordering::SeqCst);
    if let Some(mut child) = state.child.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    let _ = fs::remove_file(state.root.join("data").join("supervisor.pid"));
}

/* ---------------------------------------------------------------- window and tray */

fn set_status(app: &AppHandle, title: &str, detail: &str, error: bool, more: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let js = format!(
            "window.setStatus && window.setStatus({}, {}, {}, {})",
            serde_json::to_string(title).unwrap_or_default(),
            serde_json::to_string(detail).unwrap_or_default(),
            error,
            serde_json::to_string(more).unwrap_or_default()
        );
        let _ = window.eval(&js);
    }
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn update_autostart_check(app: &AppHandle) {
    let state = app.state::<Shared>();
    let item = state.autostart_item.lock().unwrap().clone();
    if let Some(item) = item {
        let _ = item.set_checked(app.autolaunch().is_enabled().unwrap_or(false));
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Teamflow", true, None::<&str>)?;
    let browser = MenuItem::with_id(app, "browser", "Open in browser", true, None::<&str>)?;
    let network = MenuItem::with_id(
        app,
        "network",
        "On your network: starting…",
        false,
        None::<&str>,
    )?;
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        "Start with Windows",
        true,
        app.autolaunch().is_enabled().unwrap_or(false),
        None::<&str>,
    )?;
    let data = MenuItem::with_id(app, "data", "Open data folder", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Teamflow", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &browser,
            &network,
            &PredefinedMenuItem::separator(app)?,
            &autostart,
            &data,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    let state = app.state::<Shared>();
    *state.network_item.lock().unwrap() = Some(network.clone());
    *state.autostart_item.lock().unwrap() = Some(autostart.clone());
    let autostart_item = autostart.clone();

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().expect("app icon"))
        .tooltip("Teamflow")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| {
            let state = app.state::<Shared>();
            let port = *state.port.lock().unwrap();
            match event.id.as_ref() {
                "open" => show_main(app),
                "browser" => {
                    let _ = app
                        .opener()
                        .open_url(format!("http://localhost:{port}"), None::<&str>);
                }
                "autostart" => {
                    let launcher = app.autolaunch();
                    let on = launcher.is_enabled().unwrap_or(false);
                    let _ = if on {
                        launcher.disable()
                    } else {
                        launcher.enable()
                    };
                    let _ = autostart_item.set_checked(launcher.is_enabled().unwrap_or(!on));
                }
                "data" => {
                    let _ = app
                        .opener()
                        .open_path(state.root.to_string_lossy(), None::<&str>);
                }
                "quit" => {
                    stop_server(&state);
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}
