use crate::connection::{ConnectionManager, PortInfo};
use tauri::State;

// Note: `connect` is no longer a Tauri command here. The unified entry
// point lives in `session_commands::create_session`, which dispatches
// remote variants (SSH/Telnet/Serial) to `ConnectionManager::connect`.

/// Disconnect an active connection session.
#[tauri::command]
pub async fn disconnect(
    manager: State<'_, ConnectionManager>,
    session_id: String,
) -> Result<(), String> {
    manager.disconnect(&session_id).map_err(|e| e.to_string())
}

/// Write data to a connection session.
#[tauri::command]
pub async fn write_to_connection(
    manager: State<'_, ConnectionManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    manager
        .write_input(&session_id, data.as_bytes())
        .map_err(|e| e.to_string())
}

/// Resize a connection session (SSH only, others are no-op).
#[tauri::command]
pub async fn resize_connection(
    manager: State<'_, ConnectionManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    manager
        .resize(&session_id, cols, rows)
        .map_err(|e| e.to_string())
}

/// List available serial (COM) ports.
#[tauri::command]
pub async fn list_serial_ports() -> Result<Vec<PortInfo>, String> {
    Ok(ConnectionManager::list_serial_ports())
}
