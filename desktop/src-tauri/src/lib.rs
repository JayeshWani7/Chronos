use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{State, Manager};

struct ServerState {
    child: Mutex<Option<Child>>,
}

#[tauri::command]
fn start_server(
    crn_path: String,
    state: State<'_, ServerState>,
) -> Result<u16, String> {
    // 1. Kill any existing server process
    {
        let mut guard = state.child.lock().unwrap();
        if let Some(mut existing_child) = guard.take() {
            let _ = existing_child.kill();
        }
    }

    // 2. Locate cli-1.0.0.jar
    let mut resolved_jar = None;
    let possible_paths = vec![
        PathBuf::from("../cli/build/libs/cli-1.0.0.jar"),
        PathBuf::from("cli/build/libs/cli-1.0.0.jar"),
        PathBuf::from("../../cli/build/libs/cli-1.0.0.jar"),
        PathBuf::from("cli-1.0.0.jar"),
        PathBuf::from("C:\\Users\\priya\\OneDrive\\Desktop\\Chronos\\cli\\build\\libs\\cli-1.0.0.jar"),
    ];

    for p in possible_paths {
        if p.exists() {
            resolved_jar = Some(p);
            break;
        }
        if let Ok(current_dir) = std::env::current_dir() {
            let abs = current_dir.join(&p);
            if abs.exists() {
                resolved_jar = Some(abs);
                break;
            }
        }
    }

    let jar_file = match resolved_jar {
        Some(path) => path,
        None => {
            return Err("Failed to find cli-1.0.0.jar. Ensure the CLI subproject has been compiled via gradlew.".to_string());
        }
    };

    println!("Starting Chronos session server using JAR: {:?}", jar_file);

    // 3. Spawn the Java subprocess with --port 0 to automatically allocate a free port
    let mut child = Command::new("java")
        .arg("-jar")
        .arg(jar_file)
        .arg("server")
        .arg(crn_path)
        .arg("--port")
        .arg("0")
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Failed to start Java server: {}", e))?;

    // 4. Capture the port from stdout
    let stdout = child.stdout.take().ok_or_else(|| "Failed to capture stdout of Java server".to_string())?;
    let mut reader = BufReader::new(stdout);
    let mut port = 0;
    
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => break, // EOF
            Ok(_) => {
                println!("[Java Server] {}", line.trim());
                if line.contains("Chronos server started on port:") {
                    let parts: Vec<&str> = line.split("port:").collect();
                    if parts.len() > 1 {
                        if let Ok(parsed_port) = parts[1].trim().parse::<u16>() {
                            port = parsed_port;
                            break;
                        }
                    }
                }
            }
            Err(e) => return Err(format!("Error reading server output: {}", e)),
        }
    }

    if port == 0 {
        let _ = child.kill();
        return Err("Server exited or failed to output assigned port".to_string());
    }

    // 5. Store the child process handle
    {
        let mut guard = state.child.lock().unwrap();
        *guard = Some(child);
    }

    Ok(port)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ServerState {
            child: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![start_server])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state: State<'_, ServerState> = window.state();
                let mut guard = state.child.lock().unwrap();
                if let Some(mut child) = guard.take() {
                    let _ = child.kill();
                    println!("Terminated Java session server process cleanly.");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
