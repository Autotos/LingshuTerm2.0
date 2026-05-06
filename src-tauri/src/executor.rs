use anyhow::Result;

/// Trait abstracting shell execution.
/// Desktop platforms use PtyManager; future Android builds will
/// provide an alternative implementation (e.g., via JNI / Termux APIs).
pub trait ShellExecutor: Send + Sync {
    fn create_session(&self, shell: Option<String>, cwd: Option<String>) -> Result<String>;
    fn write_input(&self, session_id: &str, data: &[u8]) -> Result<()>;
    fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<()>;
    fn destroy_session(&self, session_id: &str) -> Result<()>;
    fn execute_block_command(&self, session_id: &str, command: &str) -> Result<String>;
}

/// Desktop implementation – delegates to PtyManager.
impl ShellExecutor for crate::shell::PtyManager {
    fn create_session(&self, shell: Option<String>, cwd: Option<String>) -> Result<String> {
        self.create_session(shell, cwd)
    }

    fn write_input(&self, session_id: &str, data: &[u8]) -> Result<()> {
        self.write_input(session_id, data)
    }

    fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        self.resize(session_id, cols, rows)
    }

    fn destroy_session(&self, session_id: &str) -> Result<()> {
        self.destroy_session(session_id)
    }

    fn execute_block_command(&self, session_id: &str, command: &str) -> Result<String> {
        self.execute_block_command(session_id, command)
    }
}

/// Trait abstracting network/serial connection execution.
#[async_trait::async_trait]
pub trait ConnectionExecutor: Send + Sync {
    async fn connect(&self, config: crate::connection::ConnectionConfig) -> Result<String>;
    fn write_input(&self, session_id: &str, data: &[u8]) -> Result<()>;
    fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<()>;
    fn disconnect(&self, session_id: &str) -> Result<()>;
}

/// Desktop implementation – delegates to ConnectionManager.
#[async_trait::async_trait]
impl ConnectionExecutor for crate::connection::ConnectionManager {
    async fn connect(&self, config: crate::connection::ConnectionConfig) -> Result<String> {
        self.connect(config).await
    }

    fn write_input(&self, session_id: &str, data: &[u8]) -> Result<()> {
        self.write_input(session_id, data)
    }

    fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        self.resize(session_id, cols, rows)
    }

    fn disconnect(&self, session_id: &str) -> Result<()> {
        self.disconnect(session_id)
    }
}

// ---------------------------------------------------------------------------
// Android stubs – compiled only when targeting Android
// ---------------------------------------------------------------------------

#[cfg(target_os = "android")]
pub struct AndroidShellExecutor;

#[cfg(target_os = "android")]
impl ShellExecutor for AndroidShellExecutor {
    fn create_session(&self, _shell: Option<String>, _cwd: Option<String>) -> Result<String> {
        anyhow::bail!("Android shell executor not yet implemented – requires Termux/JNI bridge")
    }

    fn write_input(&self, _session_id: &str, _data: &[u8]) -> Result<()> {
        anyhow::bail!("Android shell executor not yet implemented")
    }

    fn resize(&self, _session_id: &str, _cols: u16, _rows: u16) -> Result<()> {
        anyhow::bail!("Android shell executor not yet implemented")
    }

    fn destroy_session(&self, _session_id: &str) -> Result<()> {
        anyhow::bail!("Android shell executor not yet implemented")
    }

    fn execute_block_command(&self, _session_id: &str, _command: &str) -> Result<String> {
        anyhow::bail!("Android shell executor not yet implemented")
    }
}

#[cfg(target_os = "android")]
pub struct AndroidConnectionExecutor;

#[cfg(target_os = "android")]
#[async_trait::async_trait]
impl ConnectionExecutor for AndroidConnectionExecutor {
    async fn connect(&self, _config: crate::connection::ConnectionConfig) -> Result<String> {
        anyhow::bail!("Android connection executor not yet implemented – requires USB/network permissions")
    }

    fn write_input(&self, _session_id: &str, _data: &[u8]) -> Result<()> {
        anyhow::bail!("Android connection executor not yet implemented")
    }

    fn resize(&self, _session_id: &str, _cols: u16, _rows: u16) -> Result<()> {
        anyhow::bail!("Android connection executor not yet implemented")
    }

    fn disconnect(&self, _session_id: &str) -> Result<()> {
        anyhow::bail!("Android connection executor not yet implemented")
    }
}
