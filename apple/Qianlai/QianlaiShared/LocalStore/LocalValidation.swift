//
//  LocalValidation.swift
//  Qianlai
//

import Foundation

/// The local write validation (T2.1) — every rule mirrors the server's
/// write path (journal.service / balance.service / account.service /
/// budget.service) so an offline local write lands in exactly the state
/// the server would have accepted. All pure, all throwing
/// `LocalValidationError` with the server's message wording.
nonisolated enum LocalValidation {
    // Limits (schema + service constants, mirror sources commented).
    static let minLines = 2        // journal.service entrySchema `.min(2)`
    static let maxLines = 50       // journal.service entrySchema `.max(50)`
    static let maxParticipants = 20 // journal.service participantUserIds `.max(20)`
    static let maxMemoLength = 500  // journal.service memo `.max(500)`
    /// balance.service / domain.ts `MAX_LINE_CENTS`.
    static let maxLineCents = 999_999_999_999

    /// The flags the fallback pocket and offset lookups read
    /// (`hasAccountFlag`).
    static let defaultDebitFlag = "defaultDebit"
    static let defaultCreditFlag = "defaultCredit"
    static let adjustmentOffsetFlag = "adjustmentOffset"
    static let builtinFlag = "builtin"
}

/// The write-path error, mirroring the server's HTTPException messages so
/// toasts read identically offline.
nonisolated struct LocalValidationError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// One normalized line — the shape `validateJournalLines` produces.
nonisolated struct LocalNormalizedLine {
    var accountId: String
    var debitCents: Int
    var creditCents: Int
    var memo: String?
}

nonisolated enum LocalJournalValidation {
    /// `validateJournalLines`: count bounds, per-line rules, default-pocket
    /// fallback, ledger membership, active status, balance. Returns the
    /// normalized lines (resolved account ids, integer cents).
    static func lines(
        _ rawLines: [(accountId: String?, debit: Double, credit: Double, memo: String?)],
        accounts: [BookAccount]
    ) throws -> [LocalNormalizedLine] {
        guard rawLines.count >= LocalValidation.minLines,
              rawLines.count <= LocalValidation.maxLines
        else {
            throw LocalValidationError(message: "Each entry needs 2 to 50 lines")
        }
        let accountsById = Dictionary(uniqueKeysWithValues: accounts.map { ($0.id, $0) })
        var normalized: [LocalNormalizedLine] = []
        var totalDebitCents = 0
        var totalCreditCents = 0
        for line in rawLines {
            guard line.debit >= 0, line.credit >= 0 else {
                throw LocalValidationError(message: "Line amounts cannot be negative")
            }
            let debitCents = LocalValues.cents(fromYuan: line.debit)
            let creditCents = LocalValues.cents(fromYuan: line.credit)
            guard debitCents <= LocalValidation.maxLineCents, creditCents <= LocalValidation.maxLineCents else {
                throw LocalValidationError(message: "Line amounts cannot exceed 9,999,999,999.99")
            }
            guard (debitCents > 0) != (creditCents > 0) else {
                throw LocalValidationError(message: "Each line must have exactly one positive amount on either debit or credit")
            }
            // Unselected side falls back to the ledger's flagged default
            // pocket (defaultCredit pays, defaultDebit receives).
            var accountId = line.accountId
            if accountId == nil || accountId?.isEmpty == true {
                let fallback = accounts.first { account in
                    let flags = account.flags ?? []
                    let wanted = creditCents > 0 ? LocalValidation.defaultCreditFlag : LocalValidation.defaultDebitFlag
                    return flags.contains(wanted)
                }
                guard let fallback else {
                    throw LocalValidationError(message: "No default account is configured for this ledger")
                }
                accountId = fallback.id
            }
            guard let accountId, let account = accountsById[accountId] else {
                throw LocalValidationError(message: "All lines must reference accounts from this ledger")
            }
            guard account.status == "active" else {
                throw LocalValidationError(message: "Account \(account.displayName) is archived")
            }
            totalDebitCents += debitCents
            totalCreditCents += creditCents
            normalized.append(
                LocalNormalizedLine(
                    accountId: accountId,
                    debitCents: debitCents,
                    creditCents: creditCents,
                    memo: line.memo
                )
            )
        }
        guard totalDebitCents == totalCreditCents else {
            throw LocalValidationError(message: "Entry is not balanced: total debits must equal total credits")
        }
        return normalized
    }

    /// `validateParticipants`: deduped, roster-checked, count bound.
    /// Local rosters hold exactly the install identity, so any foreign id
    /// throws like the server does.
    static func participants(
        _ participantUserIds: [String]?, roster: Set<String>
    ) throws -> [String]? {
        guard let participantUserIds, !participantUserIds.isEmpty else { return nil }
        for userId in Set(participantUserIds) {
            guard roster.contains(userId) else {
                throw LocalValidationError(message: "Participants must be members of this ledger")
            }
        }
        let deduped = Array(Set(participantUserIds))
        guard deduped.count <= LocalValidation.maxParticipants else {
            throw LocalValidationError(message: "Each entry can have at most \(LocalValidation.maxParticipants) participants")
        }
        return deduped
    }

    /// `resolvePaidById`: explicit payer on the roster, nil falls back to
    /// the creator.
    static func paidById(
        _ paidByUserId: String?, creatorId: String, roster: Set<String>
    ) throws -> String {
        guard let paidByUserId, !paidByUserId.isEmpty else { return creatorId }
        guard roster.contains(paidByUserId) else {
            throw LocalValidationError(message: "The payer must be a member of this ledger")
        }
        return paidByUserId
    }

    /// The entry memo's schema bound.
    static func memo(_ memo: String?) throws -> String? {
        guard let memo else { return nil }
        guard memo.count <= LocalValidation.maxMemoLength else {
            throw LocalValidationError(message: "Memo must be at most \(LocalValidation.maxMemoLength) characters")
        }
        return memo.isEmpty ? nil : memo
    }
}
