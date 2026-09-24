import SwiftUI

// MARK: - 品牌

enum Zhl {
    static let bg = Color(hex: 0x05090F)
    static let panel = Color(hex: 0x0C1420)
    static let panel2 = Color(hex: 0x101A28)
    static let line = Color(hex: 0x1B2839)
    static let txt = Color(hex: 0xE6EDF6)
    static let dim = Color(hex: 0x8CA0B8)
    static let faint = Color(hex: 0x5A6E86)
    static let accent = Color(hex: 0x22D3EE)
    static let ok = Color(hex: 0x34D399)
    static let warn = Color(hex: 0xFBBF24)
    static let down = Color(hex: 0xF87171)
}

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB,
                  Double((hex >> 16) & 0xFF) / 255.0,
                  Double((hex >> 8) & 0xFF) / 255.0,
                  Double(hex & 0xFF) / 255.0,
                  1)
    }
}

// MARK: - 登录

struct LoginView: View {
    var onDone: () -> Void
    @State private var account = ""
    @State private var password = ""
    @State private var server = UserDefaults.standard.string(forKey: "base_url") ?? "https://dis.zhl.asia"
    @State private var showServer = false
    @State private var err = ""
    @State private var loading = false

    var body: some View {
        ZStack(Zhl.bg.ignoresSafeArea()) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("ZB").font(.system(size: 13, weight: .heavy)).foregroundColor(Zhl.accent)
                            .frame(width: 34, height: 34).background(Color(hex: 0x123047)).cornerRadius(9)
                        Text("ZHLBuilder").font(.system(size: 19, weight: .bold)).foregroundColor(Zhl.txt)
                        Text("设备").font(.system(size: 13)).foregroundColor(Zhl.faint)
                    }.padding(.top, 16)

                    field("账号（用户名或邮箱）", text: $account)
                    field("密码", text: $password, secure: true)
                    Button(showServer ? "收起服务器设置" : "服务器设置") { showServer.toggle() }
                        .font(.system(size: 12)).foregroundColor(Zhl.faint)
                    if showServer {
                        field("https://dis.zhl.asia", text: $server)
                    }
                    if !err.isEmpty {
                        Text(err).font(.system(size: 13)).foregroundColor(Zhl.down)
                    }
                    Button {
                        loading = true; err = ""
                        Task {
                            UserDefaults.standard.set(server.trimmingCharacters(in: CharacterSet(charactersIn: "/")), forKey: "base_url")
                            do {
                                let r = try await Api.shared.login(account: account.trimmed, password: password)
                                Store.token = r.token
                                await MainActor.run { loading = false; onDone() }
                            } catch {
                                await MainActor.run { loading = false; err = error.localizedDescription }
                            }
                        }
                    } label: {
                        Group {
                            if loading { ProgressView().tint(.black) } else { Text("登录").bold() }
                        }
                        .frame(maxWidth: .infinity).frame(height: 20)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Zhl.accent)
                    .disabled(account.isEmpty || password.isEmpty || loading)
                }.padding(20)
            }
        }
    }

}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespaces) }
}

@ViewBuilder
private func field(_ hint: String, text: Binding<String>, secure: Bool = false) -> some View {
    Group {
        if secure { SecureField(hint, text: text) } else { TextField(hint, text: text) }
    }
    .padding(12).background(Zhl.panel).cornerRadius(10)
    .foregroundStyle(Zhl.txt)
}

// MARK: - 设备列表

struct DevicesView: View {
    var onScanDone: (PairPayload) -> Void
    var onOpen: (DeviceInfo) -> Void
    @State private var devices: [DeviceInfo] = []
    @State private var err = ""
    @State private var showScanner = false
    @State private var scanning = false
    @State private var manualCode = ""
    @State private var showManual = false
    @State private var pendingPairCode: String?
    @State private var deleteTarget: DeviceInfo?

    // 扫码：CodeScanner 封装见 ScannerView（AVFoundation）
    var body: some View {
        ZStack(Zhl.bg.ignoresSafeArea()) {
            List {
                if !err.isEmpty {
                    Text(err).font(.system(size: 13)).foregroundColor(Zhl.warn).listRowBackground(Color.clear)
                }
                ForEach(devices) { d in
                    Button { onOpen(d) } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(d.name).font(.system(size: 15, weight: .semibold)).foregroundColor(Zhl.txt)
                                Text(subtitle(d)).font(.system(size: 12.5)).foregroundColor(Zhl.dim)
                            }
                            Spacer()
                            Circle().fill(d.online ? Zhl.ok : Zhl.faint).frame(width: 9, height: 9)
                            Text("在线").font(.system(size: 12)).foregroundColor(Zhl.dim)
                                .opacity(d.online ? 0 : 1)
                            Button { deleteTarget = d } label: {
                                Text("解绑").font(.system(size: 12)).foregroundColor(Zhl.down)
                            }.buttonStyle(.plain)
                        }
                    }
                    .listRowBackground(Zhl.panel)
                }
                Button { showScanner = true } label: {
                    Text("扫码添加设备").bold()
                        .frame(maxWidth: .infinity).frame(height: 22)
                }
                .buttonStyle(.borderedProminent).tint(Zhl.accent)
                .foregroundColor(Color(hex: 0x06222B))
                .listRowBackground(Color.clear)
                Button("手动输入配对码") { showManual = true }
                    .font(.system(size: 12)).foregroundColor(Zhl.faint)
                    .listRowBackground(Color.clear)
            }
            .scrollContentBackground(.hidden)
        }
        .navigationTitle("设备")
        .task { await refresh() }
        .refreshable { await refresh() }
        .sheet(isPresented: $showScanner) {
            ScannerView { code in
                showScanner = false
                if let code { handlePairQr(code) }
            }
        }
        .alert("手动输入配对码", isPresented: $showManual) {
            TextField("8 位配对码", text: $manualCode)
            Button("继续") { if !manualCode.isEmpty { handlePairQr(manualCode.uppercased()) } }
            Button("取消", role: .cancel) {}
        } message: {
            Text("设备端运行 zhlbuilder device pair 后会显示配对码")
        }
        .alert("解绑设备", isPresented: Binding(get: { deleteTarget != nil }, set: { if !$0 { deleteTarget = nil } })) {
            Button("解绑", role: .destructive) {
                if let d = deleteTarget {
                    Task { try? await Api.shared.unpair(deviceId: d.id); await refresh() }
                }
                deleteTarget = nil
            }
            Button("取消", role: .cancel) { deleteTarget = nil }
        } message: {
            Text("设备端令牌将被吊销，需重新扫码配对。")
        }
    }

    private func subtitle(_ d: DeviceInfo) -> String {
        var parts = [d.online ? "在线" : "离线"]
        if let p = d.platform, !p.isEmpty { parts.append(p) }
        if let v = d.agentVersion, !v.isEmpty { parts.append("v\(v)") }
        return parts.joined(separator: " · ")
    }

    private func refresh() async {
        do {
            devices = try await Api.shared.devices()
            err = ""
        } catch {
            err = error.localizedDescription
        }
    }

    private func handlePairQr(_ raw: String) {
        var pairCode = ""
        if let data = raw.data(using: .utf8),
           let o = try? JSONSerialization.jsonObject(with: data) as? [String: String] {
            pairCode = o["pairCode"] ?? ""
            if let server = o["server"], !server.isEmpty {
                UserDefaults.standard.set(server, forKey: "base_url")
            }
        } else if raw.range(of: "^[A-Z2-9]{8}$", options: .regularExpression) != nil {
            pairCode = raw
        }
        guard !pairCode.isEmpty else {
            err = "二维码内容无法识别"
            return
        }
        onScanDone(PairPayload(server: UserDefaults.standard.string(forKey: "base_url") ?? "",
                               pairCode: pairCode))
    }
}

// MARK: - 扫码（AVFoundation，iOS 16 兼容；iOS 17+ 可换 DataScannerViewController）

struct ScannerView: UIViewControllerRepresentable {
    var onResult: (String?) -> Void

    func makeUIViewController(context: Context) -> ScannerViewController {
        ScannerViewController(onResult: onResult)
    }
    func updateUIViewController(_ vc: ScannerViewController, context: Context) {}
}

import AVFoundation

class ScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    private let onResult: (String?) -> Void
    private var session: AVCaptureSession?
    private var didFire = false

    init(onResult: @escaping (String?) -> Void) {
        self.onResult = onResult
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        let session = AVCaptureSession()
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else {
            onResult(nil); return
        }
        session.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { onResult(nil); return }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.qr]
        self.session = session
        DispatchQueue.global(qos: .userInitiated).async { session.startRunning() }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        session?.stopRunning()
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput,
                        didOutput metadataObjects: [AVMetadataObject],
                        from connection: AVCaptureConnection) {
        guard !didFire,
              let obj = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              obj.type == .qr, let value = obj.stringValue else { return }
        didFire = true
        onResult(value)
    }
}

// MARK: - 配对（设 6 位 PIN）

struct PairView: View {
    var payload: PairPayload
    var onDone: () -> Void
    @State private var pin1 = ""
    @State private var pin2 = ""
    @State private var err = ""
    @State private var loading = false

    var body: some View {
        ZStack(Zhl.bg.ignoresSafeArea()) {
            VStack(alignment: .leading, spacing: 12) {
                Text("绑定设备").font(.system(size: 19, weight: .bold)).foregroundColor(Zhl.txt)
                Text("配对码 \(payload.pairCode)").font(.system(size: 15, weight: .semibold)).foregroundColor(Zhl.accent)
                Text("为该设备设置 6 位数字 PIN，之后每次进入设备会话都要输入。")
                    .font(.system(size: 13)).foregroundColor(Zhl.dim)
                secureField("6 位 PIN", $pin1)
                secureField("再输一次", $pin2)
                if !err.isEmpty { Text(err).font(.system(size: 13)).foregroundColor(Zhl.down) }
                Button {
                    loading = true; err = ""
                    Task {
                        do {
                            _ = try await Api.shared.claim(pairCode: payload.pairCode, pin: pin1)
                            await MainActor.run { loading = false; onDone() }
                        } catch {
                            await MainActor.run { loading = false; err = error.localizedDescription }
                        }
                    }
                } label: {
                    Group {
                        if loading { ProgressView().tint(.black) } else { Text("绑定").bold() }
                    }.frame(maxWidth: .infinity).frame(height: 20)
                }
                .buttonStyle(.borderedProminent).tint(Zhl.accent)
                .foregroundColor(Color(hex: 0x06222B))
                .disabled(pin1.count != 6 || pin1 != pin2 || loading)
                Spacer()
            }.padding(20)
        }
    }
}

private func secureField(_ hint: String, _ text: Binding<String>) -> some View {
    SecureField(hint, text: Binding(get: { text.wrappedValue },
                                    set: { text.wrappedValue = String($0.filter(\.isNumber).prefix(6)) }))
        .padding(12).background(Zhl.panel).cornerRadius(10)
        .foregroundStyle(Zhl.txt)
}

// MARK: - 设备详情（PIN 门 + 任务）

struct DeviceDetailView: View {
    let device: DeviceInfo
    var onBack: () -> Void
    @State private var pinSession: String = ""
    @State private var needPin = true
    @State private var pin = ""
    @State private var pinErr = ""

    var body: some View {
        ZStack(Zhl.bg.ignoresSafeArea()) {
            if needPin {
                VStack(spacing: 12) {
                    Text("输入设备 PIN").font(.system(size: 19, weight: .bold)).foregroundColor(Zhl.txt)
                    Text("每次进入设备会话需要验证 6 位 PIN。").font(.system(size: 13)).foregroundColor(Zhl.dim)
                    secureField("6 位 PIN", $pin)
                    if !pinErr.isEmpty { Text(pinErr).font(.system(size: 13)).foregroundColor(Zhl.down) }
                    Button("解锁") {
                        Task {
                            do {
                                let r = try await Api.shared.verifyPin(deviceId: device.id, pin: pin)
                                pinSession = r["sessionToken"] as? String ?? ""
                                Store.setPinSession(deviceId: device.id, token: pinSession)
                                needPin = false
                            } catch { pinErr = error.localizedDescription }
                        }
                    }
                    .buttonStyle(.borderedProminent).tint(Zhl.accent)
                    .disabled(pin.count != 6)
                }.padding(20)
            } else {
                DeviceTasksView(device: device, pinSession: pinSession)
            }
        }
        .navigationTitle(device.name)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button("‹ 返回") { onBack() }.foregroundColor(Zhl.dim)
            }
        }
    }
}

struct DeviceTasksView: View {
    let device: DeviceInfo
    let pinSession: String
    @State private var online = false
    @State private var tasks: [TaskInfo] = []
    @State private var openTask: TaskInfo?
    @State private var output = ""
    @State private var showNewTask = false
    @State private var prompt = ""
    @State private var timer: Timer?

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Circle().fill(online ? Zhl.ok : Zhl.faint).frame(width: 9, height: 9)
                Text(online ? "在线" : "离线").font(.system(size: 13)).foregroundColor(Zhl.dim)
                Spacer()
            }.padding(.horizontal, 20)

            Button("下发新任务") { showNewTask = true }
                .buttonStyle(.borderedProminent).tint(Zhl.accent)
                .foregroundColor(Color(hex: 0x06222B))
                .disabled(!online)

            List {
                ForEach(tasks) { t in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("#\(t.id)").font(.system(size: 13, weight: .bold)).foregroundColor(Zhl.accent)
                            Text(statusLabel(t.status)).font(.system(size: 12)).foregroundColor(statusColor(t.status))
                        }
                        Text(t.prompt).font(.system(size: 13.5)).foregroundColor(Zhl.txt).lineLimit(2)
                        if openTask?.id == t.id {
                            Text(output.isEmpty ? "等待输出…" : output)
                                .font(.system(size: 12)).foregroundColor(Color(hex: 0x9FB6CE))
                                .padding(10).background(Zhl.panel).cornerRadius(10)
                            if t.status == 1 {
                                Button("停止任务") {
                                    Task { try? await Api.shared.stopTask(deviceId: device.id, pinSession: pinSession, taskId: t.id) }
                                }.font(.system(size: 12)).foregroundColor(Zhl.down)
                            }
                        }
                    }
                    .padding(10).background(openTask?.id == t.id ? Zhl.panel2 : Zhl.panel).cornerRadius(12)
                    .listRowBackground(Color.clear)
                    .onTapGesture {
                        openTask = t
                        output = ""
                        startOutputPolling(t)
                    }
                }
            }
            .scrollContentBackground(.hidden)
        }
        .task {
            await pollStatus()
            await pollTasks()
        }
        .sheet(isPresented: $showNewTask) {
            VStack(spacing: 12) {
                Text("下发任务").font(.system(size: 17, weight: .bold)).foregroundColor(Zhl.txt)
                TextField("要给 agent 的指令…", text: $prompt)
                    .padding(12).background(Zhl.panel).cornerRadius(10).foregroundStyle(Zhl.txt)
                Button("下发") {
                    Task {
                        _ = try? await Api.shared.createTask(deviceId: device.id, pinSession: pinSession, prompt: prompt)
                        showNewTask = false
                        prompt = ""
                        await pollTasks()
                    }
                }
                .buttonStyle(.borderedProminent).tint(Zhl.accent)
                .disabled(prompt.isEmpty)
                Spacer()
            }.padding(20).presentationDetents([.height(240)])
        }
    }

    private func statusLabel(_ s: Int) -> String {
        [0: "待下发", 1: "运行中", 2: "完成", 3: "失败", 4: "已停止"][s] ?? "未知"
    }
    private func statusColor(_ s: Int) -> Color {
        switch s { case 1: return Zhl.accent; case 2: return Zhl.ok; case 3: return Zhl.down; default: return Zhl.faint }
    }

    private func pollStatus() async {
        repeat {
            if let st = try? await Api.shared.deviceStatus(deviceId: device.id, pinSession: pinSession) {
                online = st["online"] as? Bool ?? false
            }
            try? await Task.sleep(nanoseconds: 6_000_000_000)
        } while !Task.isCancelled
    }

    private func pollTasks() async {
        repeat {
            if let list = try? await Api.shared.tasks(deviceId: device.id, pinSession: pinSession) {
                tasks = list
            }
            try? await Task.sleep(nanoseconds: 6_000_000_000)
        } while !Task.isCancelled
    }

    private func startOutputPolling(_ t: TaskInfo) {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { _ in
            guard openTask?.id == t.id else { timer?.invalidate(); return }
            Task {
                if let o = try? await Api.shared.taskOutput(deviceId: device.id, pinSession: pinSession,
                                                            taskId: t.id, since: 0) {
                    output = o.lines.map(\.line).joined(separator: "\n")
                }
            }
        }
    }
}
