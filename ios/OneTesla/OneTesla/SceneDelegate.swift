import UIKit
import WebKit

/// iPhone host window — shows the same web app on the phone
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = OneTeslaViewController()
        self.window = window
        window.makeKeyAndVisible()
    }
}
