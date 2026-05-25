import UIKit
import WebKit

/// Shared WKWebView controller — used by both iPhone and CarPlay scenes
class OneTeslaViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    // ── Change this URL to your ngrok URL or deployed backend URL ──
    static let appURL = URL(string: "https://pushup-polar-uncapped.ngrok-free.dev")!

    var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.04, green: 0.04, blue: 0.04, alpha: 1)
        setupWebView()
        loadApp()
    }

    private func setupWebView() {
        let config = WKWebViewConfiguration()

        // Allow inline media & autoplay (needed for CarPlay)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // Allow localStorage & cookies
        config.websiteDataStore = WKWebsiteDataStore.default()

        // Inject JS to signal we are running inside the native CarPlay wrapper
        let userScript = WKUserScript(
            source: "window.__ONETESLA_NATIVE__ = true; window.__ONETESLA_PLATFORM__ = 'carplay';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        config.userContentController.addUserScript(userScript)

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.scrollView.bounces = false
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.scrollView.showsHorizontalScrollIndicator = false
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }

    func loadApp() {
        let request = URLRequest(
            url: Self.appURL,
            cachePolicy: .reloadIgnoringLocalCacheData,
            timeoutInterval: 15
        )
        webView.load(request)
    }

    // ── Handle navigation errors — show retry screen ──────────────
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showError(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showError(error)
    }

    private func showError(_ error: Error) {
        // Remove existing overlays
        view.subviews.filter { $0.tag == 999 }.forEach { $0.removeFromSuperview() }

        let overlay = UIView(frame: view.bounds)
        overlay.tag = 999
        overlay.backgroundColor = UIColor(red: 0.04, green: 0.04, blue: 0.04, alpha: 1)
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]

        let stack = UIStackView()
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 20
        stack.translatesAutoresizingMaskIntoConstraints = false

        let emoji = UILabel()
        emoji.text = "⚡"
        emoji.font = .systemFont(ofSize: 72)

        let title = UILabel()
        title.text = "Cannot reach OneTesla"
        title.textColor = .white
        title.font = .boldSystemFont(ofSize: 22)

        let subtitle = UILabel()
        subtitle.text = "Make sure your backend\nand ngrok are running"
        subtitle.textColor = UIColor(white: 0.55, alpha: 1)
        subtitle.font = .systemFont(ofSize: 16)
        subtitle.numberOfLines = 2
        subtitle.textAlignment = .center

        let retry = UIButton(type: .system)
        retry.setTitle("  Retry  ", for: .normal)
        retry.titleLabel?.font = .boldSystemFont(ofSize: 18)
        retry.backgroundColor = UIColor(red: 0.89, green: 0.098, blue: 0.216, alpha: 1)
        retry.setTitleColor(.white, for: .normal)
        retry.layer.cornerRadius = 24
        retry.contentEdgeInsets = UIEdgeInsets(top: 14, left: 32, bottom: 14, right: 32)
        retry.addTarget(self, action: #selector(retryLoad), for: .touchUpInside)

        [emoji, title, subtitle, retry].forEach { stack.addArrangedSubview($0) }
        overlay.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: overlay.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: overlay.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: overlay.trailingAnchor, constant: -24)
        ])

        view.addSubview(overlay)
    }

    @objc private func retryLoad() {
        view.subviews.filter { $0.tag == 999 }.forEach { $0.removeFromSuperview() }
        loadApp()
    }
}
