import Foundation
import Observation
import SwiftUI

struct UserCredit: Decodable {
    let id: String
    let userId: String
    let balance: Int
    let frozen: Int
}

private struct RedeemBody: Encodable {
    let code: String
}

private struct RedeemResponse: Decodable {
    let credit: Int
    let balance: Int
}

@MainActor
@Observable
final class ProfileStore {
    let client = APIClient.shared

    private(set) var credit: UserCredit?
    private(set) var isLoadingCredit = false

    private(set) var isRedeeming = false
    var redeemError: String?

    func loadCredit() async {
        isLoadingCredit = true
        defer { isLoadingCredit = false }
        do {
            credit = try await client.request("GET", "redeem-codes/me/credit") as UserCredit
        } catch {
            credit = nil
        }
    }

    /// Redeems a code. Returns the new balance on success.
    func redeem(code: String) async -> Int? {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            redeemError = "请输入兑换码。"
            return nil
        }
        isRedeeming = true
        defer { isRedeeming = false }
        do {
            let response: RedeemResponse = try await client.request(
                "POST",
                "redeem-codes/redeem",
                body: RedeemBody(code: trimmed)
            )
            redeemError = nil
            await loadCredit()
            return response.balance
        } catch {
            redeemError = error.localizedDescription
            return nil
        }
    }
}
