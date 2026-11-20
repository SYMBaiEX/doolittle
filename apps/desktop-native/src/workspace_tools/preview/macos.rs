use std::{cell::Cell, rc::Rc};

use async_channel::Sender;
use block2::{DynBlock, RcBlock};
use gpui::{Bounds, Pixels, Window};
use objc2::{
    DefinedClass as _, MainThreadMarker, MainThreadOnly, define_class, msg_send, rc::Retained,
    runtime::ProtocolObject,
};
use objc2_app_kit::NSView;
use objc2_foundation::{
    NSError, NSObject, NSObjectProtocol, NSPoint, NSRect, NSSize, NSString, NSURL, NSURLRequest,
};
use objc2_web_kit::{
    WKContentRuleList, WKContentRuleListStore, WKDownload, WKFrameInfo, WKMediaCaptureType,
    WKNavigation, WKNavigationAction, WKNavigationActionPolicy, WKNavigationDelegate,
    WKNavigationResponse, WKNavigationResponsePolicy, WKPermissionDecision, WKSecurityOrigin,
    WKUIDelegate, WKWebView, WKWebViewConfiguration, WKWebsiteDataStore,
};
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use url::Url;

use super::{Status, content_rules, permitted_navigation};

struct PolicyState {
    target: Url,
    events: Sender<Status>,
}

define_class!(
    // SAFETY: NSObject permits subclassing. WebKit invokes these delegates on the main thread.
    #[unsafe(super = NSObject)]
    #[thread_kind = MainThreadOnly]
    #[name = "DoolittlePreviewDelegate"]
    #[ivars = PolicyState]
    struct PreviewDelegate;

    unsafe impl NSObjectProtocol for PreviewDelegate {}

    unsafe impl WKNavigationDelegate for PreviewDelegate {
        #[unsafe(method(webView:decidePolicyForNavigationAction:decisionHandler:))]
        fn decide_action(
            &self,
            _view: &WKWebView,
            action: &WKNavigationAction,
            decision: &DynBlock<dyn Fn(WKNavigationActionPolicy)>,
        ) {
            // SAFETY: WebKit supplies a live action and this handler completes exactly once.
            let allowed = unsafe {
                action.targetFrame().is_some()
                    && !action.shouldPerformDownload()
                    && self.permits(action.request().URL().as_deref())
            };
            decision.call((if allowed {
                WKNavigationActionPolicy::Allow
            } else {
                WKNavigationActionPolicy::Cancel
            },));
            if !allowed {
                self.report(Status::Error("Preview links must stay on the opened origin. Popups and downloads are disabled."));
            }
        }

        #[unsafe(method(webView:decidePolicyForNavigationResponse:decisionHandler:))]
        fn decide_response(
            &self,
            _view: &WKWebView,
            response: &WKNavigationResponse,
            decision: &DynBlock<dyn Fn(WKNavigationResponsePolicy)>,
        ) {
            // SAFETY: The response may be redirected, so verify its actual URL as well.
            let allowed = unsafe {
                response.canShowMIMEType() && self.permits(response.response().URL().as_deref())
            };
            decision.call((if allowed {
                WKNavigationResponsePolicy::Allow
            } else {
                WKNavigationResponsePolicy::Cancel
            },));
            if !allowed {
                self.report(Status::Error(
                    "The preview blocked a redirect or unsupported response.",
                ));
            }
        }

        #[unsafe(method(webView:didFinishNavigation:))]
        fn did_finish(&self, _view: &WKWebView, _navigation: Option<&WKNavigation>) {
            self.report(Status::Ready);
        }

        #[unsafe(method(webView:didFailNavigation:withError:))]
        fn did_fail(&self, _view: &WKWebView, _navigation: Option<&WKNavigation>, error: &NSError) {
            self.report_failure(error);
        }

        #[unsafe(method(webView:didFailProvisionalNavigation:withError:))]
        fn did_fail_provisional(
            &self,
            _view: &WKWebView,
            _navigation: Option<&WKNavigation>,
            error: &NSError,
        ) {
            self.report_failure(error);
        }

        #[unsafe(method(webViewWebContentProcessDidTerminate:))]
        fn web_process_ended(&self, _view: &WKWebView) {
            self.report(Status::Error(
                "The preview process stopped. Reload to try again.",
            ));
        }

        #[unsafe(method(webView:navigationAction:didBecomeDownload:))]
        fn action_download(
            &self,
            _view: &WKWebView,
            _action: &WKNavigationAction,
            download: &WKDownload,
        ) {
            self.cancel_download(download);
        }

        #[unsafe(method(webView:navigationResponse:didBecomeDownload:))]
        fn response_download(
            &self,
            _view: &WKWebView,
            _response: &WKNavigationResponse,
            download: &WKDownload,
        ) {
            self.cancel_download(download);
        }
    }

    unsafe impl WKUIDelegate for PreviewDelegate {
        #[unsafe(method(webView:requestMediaCapturePermissionForOrigin:initiatedByFrame:type:decisionHandler:))]
        fn deny_media_capture(
            &self,
            _view: &WKWebView,
            _origin: &WKSecurityOrigin,
            _frame: &WKFrameInfo,
            _kind: WKMediaCaptureType,
            decision: &DynBlock<dyn Fn(WKPermissionDecision)>,
        ) {
            decision.call((WKPermissionDecision::Deny,));
        }
    }
);

impl PreviewDelegate {
    fn new(mtm: MainThreadMarker, state: PolicyState) -> Retained<Self> {
        let delegate = Self::alloc(mtm).set_ivars(state);
        // SAFETY: The superclass is NSObject, and init consumes this allocated instance.
        unsafe { msg_send![super(delegate), init] }
    }

    fn permits(&self, address: Option<&NSURL>) -> bool {
        address
            .and_then(NSURL::absoluteString)
            .is_some_and(|address| permitted_navigation(&self.ivars().target, &address.to_string()))
    }

    fn report(&self, status: Status) {
        let _ = self.ivars().events.try_send(status);
    }

    fn report_failure(&self, error: &NSError) {
        // NSURL cancellation also follows an intentional policy denial or reload.
        if error.code() != -999 {
            self.report(Status::Error("The local page did not load. Check that the development server is running and reload."));
        }
    }

    fn cancel_download(&self, download: &WKDownload) {
        // SAFETY: WebKit provides the live download and the optional completion can be omitted.
        unsafe { download.cancel(None) };
        self.report(Status::Error(
            "Downloads are disabled in the embedded preview.",
        ));
    }
}

pub(super) struct NativePreview {
    view: Retained<WKWebView>,
    delegate: Retained<PreviewDelegate>,
    store: Retained<WKContentRuleListStore>,
    _rule_directory: tempfile::TempDir,
    request: Retained<NSURLRequest>,
    ready: Cell<bool>,
}

impl NativePreview {
    pub(super) fn new(target: Url, events: Sender<Status>) -> Result<Rc<Self>, &'static str> {
        let mtm = MainThreadMarker::new().ok_or("The preview must open from a desktop window.")?;
        let url = NSURL::URLWithString(&NSString::from_str(target.as_str()))
            .ok_or("The local preview URL could not be opened.")?;
        let request = NSURLRequest::requestWithURL(&url);
        let rule_directory = tempfile::Builder::new()
            .prefix("doolittle-webkit-")
            .tempdir()
            .map_err(|_| "The preview could not initialize its network policy.")?;
        let directory = rule_directory
            .path()
            .to_str()
            .ok_or("The preview could not initialize its network policy.")?;
        let directory_url =
            NSURL::fileURLWithPath_isDirectory(&NSString::from_str(directory), true);
        let rule_json = NSString::from_str(&content_rules(&target));
        let delegate = PreviewDelegate::new(mtm, PolicyState { target, events });

        // SAFETY: All calls run on the main thread and pass initialized framework objects.
        // There is no navigation until this private content rule store successfully compiles.
        let (store, view) = unsafe {
            let store = WKContentRuleListStore::storeWithURL(Some(&directory_url), mtm)
                .ok_or("The preview could not initialize its network policy.")?;
            let configuration = WKWebViewConfiguration::new(mtm);
            configuration.setWebsiteDataStore(&WKWebsiteDataStore::nonPersistentDataStore(mtm));
            let view = WKWebView::initWithFrame_configuration(
                WKWebView::alloc(mtm),
                NSRect::ZERO,
                &configuration,
            );
            view.setNavigationDelegate(Some(ProtocolObject::from_ref(&*delegate)));
            view.setUIDelegate(Some(ProtocolObject::from_ref(&*delegate)));
            view.setHidden(true);
            (store, view)
        };
        let page = Rc::new(Self {
            view,
            delegate,
            store,
            _rule_directory: rule_directory,
            request,
            ready: Cell::new(false),
        });
        let pending_page = Rc::downgrade(&page);
        let completion = RcBlock::new(move |rule: *mut WKContentRuleList, _error: *mut NSError| {
            let Some(page) = pending_page.upgrade() else {
                return;
            };
            // SAFETY: WebKit invokes completion on the main run loop and supplies this
            // reference for the callback. The content controller retains the installed rule.
            let Some(rule) = (unsafe { rule.as_ref() }) else {
                page.delegate.report(Status::Error(
                    "The preview could not secure its network policy.",
                ));
                return;
            };
            unsafe {
                page.view
                    .configuration()
                    .userContentController()
                    .addContentRuleList(rule)
            };
            page.ready.set(true);
            page.reload();
        });
        // SAFETY: The nonnull identifier, JSON and block are valid for this call. WebKit
        // copies the asynchronous completion and releases it after main-thread delivery.
        unsafe {
            page.store
                .compileContentRuleListForIdentifier_encodedContentRuleList_completionHandler(
                    Some(&NSString::from_str("origin-policy")),
                    Some(&rule_json),
                    Some(&completion),
                );
        }
        Ok(page)
    }

    pub(super) fn reload(&self) -> bool {
        if !self.ready.get() {
            return false;
        }
        // SAFETY: The WKWebView is owned on the main thread. Use the original validated
        // request whenever there is no committed page to reload.
        unsafe {
            if self.view.reload().is_none() {
                self.view.loadRequest(&self.request);
            }
        }
        true
    }

    pub(super) fn place(&self, window: &Window, bounds: Bounds<Pixels>) {
        let Ok(handle) = HasWindowHandle::window_handle(window) else {
            return;
        };
        let RawWindowHandle::AppKit(handle) = handle.as_raw() else {
            return;
        };
        // SAFETY: GPUI exposes its living content NSView through the AppKit window handle.
        // The handle bounds this reference and all AppKit operations run on the main thread.
        let parent = unsafe { handle.ns_view.cast::<NSView>().as_ref() };
        let size = NSSize::new(bounds.size.width.into(), bounds.size.height.into());
        if size.width <= 0. || size.height <= 0. || !self.ready.get() {
            self.hide();
            return;
        }
        let parent_bounds = parent.bounds();
        let offset_y = f64::from(bounds.origin.y);
        let y = if parent.isFlipped() {
            offset_y
        } else {
            parent_bounds.size.height - offset_y - size.height
        };
        let frame = NSRect::new(
            NSPoint::new(
                parent_bounds.origin.x + f64::from(bounds.origin.x),
                parent_bounds.origin.y + y,
            ),
            size,
        );
        if self.view.frame() != frame {
            self.view.setFrame(frame);
        }
        // SAFETY: Querying the superview and retaining it is valid on the main thread.
        let already_attached =
            unsafe { self.view.superview() }.is_some_and(|current| std::ptr::eq(&*current, parent));
        if !already_attached {
            self.view.removeFromSuperview();
            parent.addSubview(&self.view);
        }
        self.view.setHidden(false);
    }

    pub(super) fn hide(&self) {
        self.view.setHidden(true);
    }
}

impl Drop for NativePreview {
    fn drop(&mut self) {
        // SAFETY: This is main-thread ownership and both delegate properties are weak.
        unsafe {
            self.view.setNavigationDelegate(None);
            self.view.setUIDelegate(None);
            self.view.stopLoading();
        }
        self.view.removeFromSuperview();
    }
}
