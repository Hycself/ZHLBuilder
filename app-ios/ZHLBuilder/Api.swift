import Foundation
import Security

// MARK: - 模型

struct DeviceInfo: Identifiable, Decodable {
    let id: Int
    let name: String
    let platform: String?
    let agentVersion: String?
    let online: Bool
    let lastSeen: String?

    enum CodingKeys: String, CodingKey {
        case id, name, platform, online
        case agentVersion = "agentVersion"
        case lastSeen = "lastSeen"
    }
}

struct TaskInfo: Identifiable, Decodable {
    let id: Int
    let prompt: String
    let status: Int
    let exitNote: String?

    enum CodingKeys: String, CodingKey {
        case id, prompt, status
        case exitNote = "exitNote"
    }
}

struct TaskOutput: Decodable {
    let status: Int
    let lines: [OutputLine]
    let lastSeq: Int

    enum CodingKeys: String, CodingKey {
        case status, lines
        case lastSeq = "lastSeq"
    }
}

struct OutputLine: Decodable {
    let seq: Int
    let line: String
}

// MARK: - 异常

enum ApiError: Error, LocalizedError {
    case network(String)
    case http(Int)
    case biz(String)

    var errorDescription: String? {
        switch self {
        case .network(let m): return "网络异常：\(m)"
        case .http(let c): return "HTTP \(c)"
        case .biz(let m): return m
        }
    }
}

// MARK: - 客户端

/// ZHL 平台 API。业务失败 = HTTP 200 + body code != 20000。
final class Api {
    static let shared = Api()
    private var baseUrl: String {
        UserDefaults.standard.string(forKey: "base_url") ?? "https://dis.zhl.asia"
    }

    private func call<T: Decodable>(_ path: String, method: String = "GET",
                                    body: [String: Any]? = nil,
                                    pinSession: String? = nil) async throws -> T {
        guard let url = URL(string: baseUrl + path) else {
            throw ApiError.network("URL 非法")
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 20
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(Store.token ?? "")", forHTTPHeaderField: "Authorization")
        if let pinSession { req.setValue(pinSession, forHTTPHeaderField: "X-Builder-Session") }
        if let body { req.httpBody = try JSONSerialization.data(withJSONObject: body) }

        let (data, resp): (Data, URLResponse)
        do {
            (data, resp) = try await URLSession.shared.data(for: req)
        } catch {
            throw ApiError.network(error.localizedDescription)
        }
        guard let http = resp as? HTTPURLResponse else { throw ApiError.network("无响应") }
        guard http.statusCode == 200 else { throw ApiError.http(http.statusCode) }

        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        guard obj["code"] as? Int == 20000 else {
            throw ApiError.biz(obj["message"] as? String ?? "操作失败")
        }
        let dataObj = try JSONSerialization.data(withJSONObject: obj["data"] ?? NSNull())
        return try JSONDecoder().decode(T.self, from: dataObj)
    }

    // 认证
    struct LoginResult: Decodable {
        let token: String
    }
    func login(account: String, password: String) async throws -> LoginResult {
        try await call("/api/auth/login", method: "POST",
                       body: ["account": account, "password": password])
    }

    // 设备
    func devices() async throws -> [DeviceInfo] {
        try await call("/api/builder/devices")
    }
    func claim(pairCode: String, pin: String) async throws -> [String: Any] {
        let r: [String: Any] = try await call("/api/builder/devices/claim", method: "POST",
                                              body: ["pairCode": pairCode, "pin": pin])
        return r
    }
    func verifyPin(deviceId: Int, pin: String) async throws -> [String: Any] {
        let r: [String: Any] = try await call("/api/builder/devices/\(deviceId)/verify-pin",
                                              method: "POST", body: ["pin": pin])
        return r
    }
    func deviceStatus(deviceId: Int, pinSession: String) async throws -> [String: Any] {
        try await call("/api/builder/devices/\(deviceId)/status", pinSession: pinSession)
    }
    func unpair(deviceId: Int) async throws {
        let _: [String: Any] = try await call("/api/builder/devices/\(deviceId)", method: "DELETE")
    }

    // 任务
    func createTask(deviceId: Int, pinSession: String, prompt: String) async throws -> [String: Any] {
        try await call("/api/builder/devices/\(deviceId)/tasks", method: "POST",
                       body: ["prompt": prompt], pinSession: pinSession)
    }
    func tasks(deviceId: Int, pinSession: String) async throws -> [TaskInfo] {
        try await call("/api/builder/devices/\(deviceId)/tasks?limit=20", pinSession: pinSession)
    }
    func taskOutput(deviceId: Int, pinSession: String, taskId: Int, since: Int) async throws -> TaskOutput {
        try await call("/api/builder/devices/\(deviceId)/tasks/\(taskId)/output?since=\(since)",
                       pinSession: pinSession)
    }
    func stopTask(deviceId: Int, pinSession: String, taskId: Int) async throws {
        let _: [String: Any] = try await call("/api/builder/devices/\(deviceId)/tasks/\(taskId)/stop",
                                              method: "POST", body: [:], pinSession: pinSession)
    }
}

// MARK: - Keychain 存储

enum Store {
    static var token: String? {
        get { keychainGet("zhlbuilder.jwt") }
        set {
            if let v = newValue { keychainSet("zhlbuilder.jwt", v) } else { keychainDelete("zhlbuilder.jwt") }
        }
    }

    static func pinSession(deviceId: Int) -> String? { keychainGet("zhlbuilder.pin.\(deviceId)") }
    static func setPinSession(deviceId: Int, token: String) { keychainSet("zhlbuilder.pin.\(deviceId)", token) }

    static func logout() { keychainDelete("zhlbuilder.jwt") }

    // MARK: Keychain 基础

    private static func keychainSet(_ key: String, _ value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
        var attrs = query
        attrs[kSecValueData as String] = data
        SecItemAdd(attrs as CFDictionary, nil)
    }

    private static func keychainGet(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func keychainDelete(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
