use std::collections::HashMap;

use async_channel::bounded;
use doolittle_runtime::ControlMethod;
use gpui::Context;
use serde_json::Value;

use crate::workbench::Workbench;

#[derive(Default)]
pub(crate) struct ControlState {
    reads: HashMap<String, RequestState>,
    actions: HashMap<String, RequestState>,
    sequence: u64,
}

#[derive(Default)]
struct RequestState {
    value: Option<Value>,
    error: Option<String>,
    active: Option<u64>,
}

impl Workbench {
    pub(crate) fn control_value(&self, path: &str) -> Option<&Value> {
        self.controls.reads.get(path)?.value.as_ref()
    }

    pub(crate) fn control_error(&self, path: &str) -> Option<&str> {
        self.controls.reads.get(path)?.error.as_deref()
    }

    pub(crate) fn control_pending(&self, path: &str) -> bool {
        self.controls
            .reads
            .get(path)
            .is_some_and(|state| state.active.is_some())
    }

    pub(crate) fn control_action_value(&self, path: &str) -> Option<&Value> {
        self.controls.actions.get(path)?.value.as_ref()
    }

    pub(crate) fn control_action_error(&self, path: &str) -> Option<&str> {
        self.controls.actions.get(path)?.error.as_deref()
    }

    pub(crate) fn control_action_pending(&self, path: &str) -> bool {
        self.controls
            .actions
            .get(path)
            .is_some_and(|state| state.active.is_some())
    }

    pub(crate) fn control_get(&mut self, path: &str, cx: &mut Context<Self>) {
        self.control_send(ControlMethod::Get, path, None, &[], cx);
    }

    pub(crate) fn control_send(
        &mut self,
        method: ControlMethod,
        path: &str,
        body: Option<Value>,
        refresh: &[&str],
        cx: &mut Context<Self>,
    ) {
        let read = method == ControlMethod::Get;
        let states = if read {
            &mut self.controls.reads
        } else {
            &mut self.controls.actions
        };
        let entry = states.entry(path.to_owned()).or_default();
        if entry.active.is_some() {
            return;
        }
        let Some(client) = self.runtime_client() else {
            let states = if read {
                &mut self.controls.reads
            } else {
                &mut self.controls.actions
            };
            states.entry(path.to_owned()).or_default().error =
                Some("Open a workspace and start ElizaOS first.".into());
            cx.notify();
            return;
        };
        let id = self.controls.sequence.wrapping_add(1);
        self.controls.sequence = id;
        let states = if read {
            &mut self.controls.reads
        } else {
            &mut self.controls.actions
        };
        let entry = states.entry(path.to_owned()).or_default();
        entry.active = Some(id);
        entry.error = None;
        if !read {
            entry.value = None;
        }

        let path = path.to_owned();
        let requested_path = path.clone();
        let refresh: Vec<_> = refresh.iter().map(|path| (*path).to_owned()).collect();
        let (tx, rx) = bounded(1);
        std::thread::spawn(move || {
            let _ = tx.send_blocking(client.control(method, &requested_path, body.as_ref()));
        });
        cx.spawn(async move |this, cx| {
            let Ok(result) = rx.recv().await else { return };
            let _ = this.update(cx, |this, cx| {
                let states = if read {
                    &mut this.controls.reads
                } else {
                    &mut this.controls.actions
                };
                let Some(state) = states.get_mut(&path).filter(|s| s.active == Some(id)) else {
                    return;
                };
                state.active = None;
                match result {
                    Ok(value) => {
                        state.value = Some(value);
                        for path in &refresh {
                            // Supersede any read that started before the mutation finished.
                            if let Some(state) = this.controls.reads.get_mut(path) {
                                state.active = None;
                            }
                            this.control_get(path, cx);
                        }
                    }
                    Err(error) => state.error = Some(error.to_string()),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }
}
