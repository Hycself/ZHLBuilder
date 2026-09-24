import SwiftUI

/// ZHLBuilder — XFlySim-ZHL 设备管理（基于 zai-org/ZCode 生态的设备中枢）。
@main
struct ZHLBuilderApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
        }
    }
}

enum AppScreen {
    case login, devices, detail
}

struct RootView: View {
    @AppStorage("hasToken") private var hasToken = false
    @State private var screen: AppScreen = .login
    @State private var selectedDevice: DeviceInfo?
    @State private var pairPayload: PairPayload?

    var body: some View {
        NavigationStack {
            switch screen {
            case .login:
                LoginView {
                    hasToken = true
                    screen = .devices
                }
            case .devices:
                DevicesView(
                    onScanDone: { payload in
                        pairPayload = payload
                    },
                    onOpen: { device in
                        selectedDevice = device
                        screen = .detail
                    }
                )
            case .detail:
                if let device = selectedDevice {
                    DeviceDetailView(device: device, onBack: { screen = .devices })
                }
            }
        }
        .fullScreenCover(item: $pairPayload) { payload in
            PairView(payload: payload) {
                pairPayload = nil
                screen = .devices
            }
        }
    }
}

struct PairPayload: Identifiable {
    var server: String
    var pairCode: String
    var id: String { pairCode }
}
