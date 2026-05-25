import UIKit
import CarPlay

/// CarPlay scene — hosts the web app in a CPTemplateApplicationScene
class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {

    var interfaceController: CPInterfaceController?
    var carWindow: CPWindow?
    var webViewController: OneTeslaViewController?

    // ── CarPlay connected ─────────────────────────────────────────
    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController,
        to window: CPWindow
    ) {
        self.interfaceController = interfaceController
        self.carWindow = window

        // Show loading template while web app boots
        let loadingItem = CPListItem(text: "OneTesla", detailText: "Loading vehicle data...")
        loadingItem.accessoryType = .disclosureIndicator
        let loadingSection = CPListSection(items: [loadingItem])
        let loadingTemplate = CPListTemplate(title: "⚡ OneTesla", sections: [loadingSection])
        interfaceController.setRootTemplate(loadingTemplate, animated: false)

        // Embed the WKWebView inside the CarPlay window
        let vc = OneTeslaViewController()
        self.webViewController = vc

        window.rootViewController = vc

        // Give the web app a moment to load, then switch to it
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            self.showWebApp(in: window)
        }
    }

    private func showWebApp(in window: CPWindow) {
        guard let vc = webViewController else { return }

        // Use a CPInformationTemplate as the "shell" — the WKWebView
        // sits underneath filling the CPWindow
        let template = CPInformationTemplate(
            title: "OneTesla",
            layout: .leading,
            items: [],
            actions: []
        )
        interfaceController?.setRootTemplate(template, animated: true)

        // Make sure the web view fills the car window
        vc.view.frame = window.bounds
        vc.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.rootViewController = vc
    }

    // ── CarPlay disconnected ──────────────────────────────────────
    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didDisconnect interfaceController: CPInterfaceController,
        from window: CPWindow
    ) {
        self.interfaceController = nil
        self.carWindow = nil
        self.webViewController = nil
    }
}
