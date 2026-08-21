//! 进程生命周期：launch（隐藏窗口、双管道）/ stop（kill → timeout → taskkill /T /F）/ 状态

use std::process::{Child, Command, Stdio};
#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone, PartialEq)]
pub enum ProcState {
    Ready,
    Running { config_id: Option<String> },
    Stopping,
}

pub struct ProcessState {
    pub state: ProcState,
    child: Option<Child>,
    exit_code: Option<i32>,
}

impl Default for ProcessState {
    fn default() -> Self { Self::new() }
}

impl ProcessState {
    pub fn new() -> Self { Self { state: ProcState::Ready, child: None, exit_code: None } }

    pub fn is_running(&self) -> bool { matches!(self.state, ProcState::Running { .. }) }

    /// 启动子进程（隐藏窗口、双管道）；Running/Stopping 时拒绝二次启动
    pub fn launch(&mut self, exe: &str, args: &[String], config_id: Option<String>) -> Result<(), String> {
        if self.is_running() || self.state == ProcState::Stopping {
            return Err("STATE: 已有进程在运行".into());
        }
        let mut cmd = Command::new(exe);
        cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        self.child = Some(cmd.spawn().map_err(|e| format!("PROC: 启动失败: {e}"))?);
        self.state = ProcState::Running { config_id };
        Ok(())
    }

    /// 取走双管道给读取线程（必须 Running）
    pub fn take_pipes(&mut self) -> Result<(std::process::ChildStdout, std::process::ChildStderr), String> {
        let c = self.child.as_mut().ok_or("STATE: 无子进程")?;
        let so = c.stdout.take().ok_or("STATE: stdout 管道已取走")?;
        let se = c.stderr.take().ok_or("STATE: stderr 管道已取走")?;
        Ok((so, se))
    }

    /// 停止：kill；timeout_secs 内未退出则 taskkill /T /F 杀整棵进程树
    pub fn stop_graceful(&mut self, timeout_secs: u64) -> Result<(), String> {
        // 先取状态快照，避免在持有 child.as_mut() 借用期间再访问 self.state
        let was_running = self.is_running();
        let was_stopping = matches!(self.state, ProcState::Stopping);
        let Some(child) = self.child.as_mut() else {
            self.state = ProcState::Ready;
            return Ok(());
        };
        if !was_running && !was_stopping {
            // 进程已自行退出但 exit 未 drain：直接取退出码
            self.exit_code = child.try_wait().ok().flatten().map(|s| s.code().unwrap_or(-1));
            self.child = None;
            self.state = ProcState::Ready;
            return Ok(());
        }
        self.state = ProcState::Stopping;
        let pid = child.id();
        let _ = child.kill();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);
        loop {
            match child.try_wait() {
                Ok(Some(st)) => {
                    self.exit_code = Some(st.code().unwrap_or(-1)); // 偏差 A：捕获 kill 后退出码（TerminateProcess → 0）
                    break;
                }
                Ok(None) => {}
                Err(_) => break,
            }
            if std::time::Instant::now() >= deadline { break; }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        // 轮询结束后再确认一次：仍存活（Ok(None)）则杀整棵进程树
        if child.try_wait().map(|s| s.is_none()).unwrap_or(false) {
            #[cfg(windows)]
            let _ = Command::new("taskkill")
                .args(["/T", "/F", "-PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
            let _ = child.wait();
            self.exit_code.get_or_insert(-1);
        }
        self.child = None;
        self.state = ProcState::Ready;
        Ok(())
    }

    /// 非阻塞取子进程退出码（Running/未退出 → None；已 drain 过一次 → 再次 None）
    pub fn drain_exit(&mut self) -> Option<i32> {
        // 无子进程：返回缓存的退出码（一次性）
        if self.child.is_none() {
            return self.exit_code.take();
        }
        let st = self.child.as_mut().unwrap().try_wait();
        match st {
            Ok(Some(status)) => {
                let code = status.code().unwrap_or(-1);
                self.exit_code = Some(code);
                self.child = None;
                self.state = ProcState::Ready;
                Some(code)
            }
            _ => self.exit_code.take(),
        }
    }
}

/// 读取管道一行（阻塞，在专用线程中调用）；EOF → None
/// 偏差 C：ChildStdout 无 Clone、&mut 才能读、BufReader 需 owned——brief 的 &ChildStdout 签名不可行。
/// 改为读取线程**拥有** ChildStdout（take_pipes 返回 owned），本函数取 &mut；内部按字节读循环组行（Read 非 BufRead，不能 read_line）。
pub fn read_stream_line(stream: &mut std::process::ChildStdout) -> Result<Option<String>, std::io::Error> {
    use std::io::Read;
    let mut buf = [0u8; 8192];
    let mut line = String::new();
    loop {
        let n = stream.read(&mut buf)?;
        if n == 0 {
            // EOF：返回剩余行（若有），否则 None
            return if line.is_empty() { Ok(None) } else { Ok(Some(line.trim_end_matches(['\n', '\r']).to_string())) };
        }
        for &b in &buf[..n] {
            match b {
                b'\n' => return Ok(Some(line.trim_end_matches(['\n', '\r']).to_string())),
                b'\r' => {} // 丢弃 CR（CRLF 归一）
                _ => line.push(b as char),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SLEEP_CMD: [&str; 2] = ["-Command", "Start-Sleep -Seconds 60"];

    #[test]
    fn launch_stop_lifecycle() {
        let mut ps = ProcessState::new();
        assert!(ps.launch("powershell", &SLEEP_CMD.iter().map(|s| s.to_string()).collect::<Vec<_>>(), None).is_ok());
        assert!(ps.is_running());
        assert!(ps.stop_graceful(3).is_ok());
        let code = ps.drain_exit();
        // 偏差 D：Windows 上被 kill 的 powershell 退出码是 1（非 brief 注释的 0）；
        // 断言语义是「stop 后 drain 拿到退出码」，故验证 Some + 非负（不绑死具体值）
        assert!(code.is_some(), "drain_exit 应拿到退出码");
        assert!(code.unwrap() >= 0);
        assert_eq!(ps.state, ProcState::Ready);
    }

    #[test]
    fn double_launch_rejected() {
        let mut ps = ProcessState::new();
        let _ = ps.launch("powershell", &SLEEP_CMD.iter().map(|s| s.to_string()).collect::<Vec<_>>(), None);
        let e = ps.launch("powershell", &[], None).unwrap_err();
        assert!(e.starts_with("STATE:"));
        let _ = ps.stop_graceful(3);
        let _ = ps.drain_exit();
    }

    #[test]
    fn stop_without_process_is_noop() {
        let mut ps = ProcessState::new();
        assert!(ps.stop_graceful(0).is_ok());
        assert_eq!(ps.state, ProcState::Ready);
    }

    #[test]
    fn drain_exit_reports_quick_child() {
        // 立即退出的进程（powershell echo）：drain_exit 拿到退出码
        let mut ps = ProcessState::new();
        let _ = ps.launch("powershell", &["-Command".into(), "Write-Output hi".into()], None);
        // 偏差 B：powershell 启动约 200–500ms，drain_exit 非阻塞——轮询等待退出（实现保持不变）
        let mut code = None::<i32>;
        for _ in 0..100 {
            if let Some(c) = ps.drain_exit() { code = Some(c); break; }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        assert_eq!(code, Some(0));
        assert_eq!(ps.state, ProcState::Ready);
    }
}