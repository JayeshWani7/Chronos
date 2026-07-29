use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{State, Manager};

struct ServerState {
    child: Mutex<Option<Child>>,
}

struct RecorderState {
    child: Mutex<Option<Child>>,
    output_path: Mutex<Option<String>>,
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

#[tauri::command]
fn start_recording(
    cdp_url: String,
    target_tab_url: String,
    output_path: String,
    state: State<'_, RecorderState>,
) -> Result<(), String> {
    // 1. Stop any current recording first
    {
        let mut guard = state.child.lock().unwrap();
        if let Some(mut existing_child) = guard.take() {
            if let Some(mut stdin) = existing_child.stdin.take() {
                let _ = writeln!(stdin);
                let _ = stdin.flush();
            }
            let _ = existing_child.wait();
        }
    }

    // 2. Locate recorder-1.0.0.jar
    let mut resolved_jar = None;
    let possible_paths = vec![
        PathBuf::from("../recorder/build/libs/recorder-1.0.0.jar"),
        PathBuf::from("recorder/build/libs/recorder-1.0.0.jar"),
        PathBuf::from("../../recorder/build/libs/recorder-1.0.0.jar"),
        PathBuf::from("recorder-1.0.0.jar"),
        PathBuf::from("C:\\Users\\priya\\OneDrive\\Desktop\\Chronos\\recorder\\build\\libs\\recorder-1.0.0.jar"),
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
            return Err("Failed to find recorder-1.0.0.jar. Ensure the recorder subproject has been compiled.".to_string());
        }
    };

    println!("Starting Chronos recorder using JAR: {:?} for tab: {}", jar_file, target_tab_url);

    // 3. Spawn the Java recorder subprocess
    let child = Command::new("java")
        .arg("-jar")
        .arg(jar_file)
        .arg(&output_path)
        .env("CHROME_CDP_URL", &cdp_url)
        .env("CHROME_TARGET_TAB_URL", &target_tab_url)
        .stdin(Stdio::piped())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Failed to start Java recorder: {}", e))?;

    // 4. Save child and output path
    {
        let mut guard = state.child.lock().unwrap();
        *guard = Some(child);
    }
    {
        let mut guard = state.output_path.lock().unwrap();
        *guard = Some(output_path);
    }

    Ok(())
}

#[tauri::command]
fn get_chrome_tabs(cdp_url: String) -> Result<String, String> {
    use std::net::TcpStream;
    use std::io::{Read, Write};

    let addr = cdp_url.replace("http://", "").replace("https://", "");
    let parts: Vec<&str> = addr.split(':').collect();
    if parts.is_empty() {
        return Err("Invalid CDP URL".to_string());
    }
    let host = parts[0];
    let port = if parts.len() > 1 { parts[1] } else { "9222" };
    let connect_addr = format!("{}:{}", host, port);

    let mut stream = TcpStream::connect(&connect_addr)
        .map_err(|e| format!("Failed to connect to Chrome CDP target list: {}", e))?;

    let request = format!(
        "GET /json/list HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",
        connect_addr
    );

    stream.write_all(request.as_bytes())
        .map_err(|e| format!("Failed to send GET request to CDP target list: {}", e))?;

    let mut response = Vec::new();
    stream.read_to_end(&mut response)
        .map_err(|e| format!("Failed to read response from CDP target list: {}", e))?;

    let resp_str = String::from_utf8_lossy(&response);
    if let Some(body_start) = resp_str.find("\r\n\r\n") {
        Ok(resp_str[body_start + 4..].to_string())
    } else {
        Err("Invalid HTTP response format from Chrome remote debugging".to_string())
    }
}

#[tauri::command]
fn stop_recording(
    state: State<'_, RecorderState>,
) -> Result<String, String> {
    let mut guard = state.child.lock().unwrap();
    let child_opt = guard.take();

    let output_path_opt = {
        let mut path_guard = state.output_path.lock().unwrap();
        path_guard.take()
    };

    let path = match output_path_opt {
        Some(p) => p,
        None => return Err("No active recording session found".to_string()),
    };

    if let Some(mut child) = child_opt {
        println!("Stopping Chronos recorder and packaging output...");
        if let Some(mut stdin) = child.stdin.take() {
            let _ = writeln!(stdin);
            let _ = stdin.flush();
        }
        let _ = child.wait();
    }

    Ok(path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ServerState {
            child: Mutex::new(None),
        })
        .manage(RecorderState {
            child: Mutex::new(None),
            output_path: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![start_server, start_recording, get_chrome_tabs, stop_recording])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Stop server
                {
                    let state: State<'_, ServerState> = window.state();
                    let mut guard = state.child.lock().unwrap();
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                        println!("Terminated Java session server process cleanly.");
                    }
                }
                // Stop recorder
                {
                    let state: State<'_, RecorderState> = window.state();
                    let mut guard = state.child.lock().unwrap();
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                        println!("Terminated Java recorder process cleanly.");
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
