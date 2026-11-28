//
//  LocalJournalWriteRepository.swift
//  Qianlai
//

import Foundation
import GRDB

/// The local journal's write path (T2.1): post, update, delete, and the
/// balance adjustment — the server's journal.service / balance.service
/// flows mirrored transaction for transaction:
///
/// - every write re-validates through `LocalValidation` (the same rules,
///   the same messages);
/// - `entryNo` comes from the ledger row's monotonic counter bumped
///   inside the write transaction (`postEntryInTransaction`'s lock
///   discipline; SQLite's write transaction IS the lock);
/// - the draft's unselected line side falls back to the flagged default
///   pocket exactly like the server;
/// - updates keep `entryNo` and the original creator;
/// - deletes wipe the entry's photo files with its rows.
nonisolated final class LocalJournalWriteRepository {
    let database: LocalDatabase
    private let journal: LocalJournalRepository
    private let attachments: LocalAttachmentStore

    init(database: LocalDatabase) {
        self.database = database
        self.journal = LocalJournalRepository(database: database)
        self.attachments = LocalAttachmentStore(database: database)
    }

    /// The write draft — one shape for create and update, mirroring
    /// `CreateEntryBody`'s fields (the store maps `QuickEntryDraft` onto
    /// it; the tuple line keeps the optional account side that the
    /// default-pocket fallback resolves).
    nonisolated struct EntryDraft {
        var date: Date
        var memo: String?
        var lines: [(accountId: String?, debit: Double, credit: Double, memo: String?)]
        var participantUserIds: [String]?
        var paidByUserId: String?
        var projectId: String?
        var countsInLedger: Bool?
        var excludedFromBudget: Bool?
        /// nil = keep (create: no location); non-nil = replace; `.clear`
        /// on update strips it.
        var location: LocationWrite?
        /// nil = keep; non-nil = the counterparty (empty clears).
        var merchant: String?
        /// The receipts' final id set (staged refs claimed onto the entry;
        /// already-claimed ids are idempotent no-ops). nil on update keeps
        /// the stored receipts untouched.
        var attachmentIds: [String]? = nil

        /// The location's three wire states (`EntryLocationPayload`'s
        /// local twin): keep / replace / strip.
        nonisolated enum LocationWrite {
            case replace(EntryLocationBody)
            case clear
        }
    }

    /// Posts one entry and returns it assembled (the create endpoint's
    /// return contract).
    @discardableResult
    func createEntry(
        ledgerId: String,
        creatorId: String,
        draft: EntryDraft,
        now: Date = Date()
    ) async throws -> JournalEntry {
        // Validation inputs + the whole write share one transaction; the
        // reads inside `write` see a consistent snapshot under SQLite's
        // write lock.
        let entryId: String = try await database.writer.write { db in
            guard let ledgerRow = try LocalLedgerRow.fetchOne(db, key: ledgerId) else {
                throw LocalStoreError.ledgerNotFound
            }
            guard ledgerRow.status == "active" else {
                throw LocalValidationError(message: "This ledger is archived")
            }
            let accountRows = try LocalBookAccountRow
                .filter(Column("ledger_id") == ledgerId)
                .fetchAll(db)
            let accounts = accountRows.map(\.domainAccount)
            let lines = try LocalJournalValidation.lines(draft.lines, accounts: accounts)
            let rosterUserIds = Set(try String.fetchAll(
                db, sql: "SELECT user_id FROM qianlai_ledger_member WHERE ledger_id = ?",
                arguments: [ledgerId]
            ))
            let participants = try LocalJournalValidation.participants(draft.participantUserIds, roster: rosterUserIds)
            let paidById = try LocalJournalValidation.paidById(draft.paidByUserId, creatorId: creatorId, roster: rosterUserIds)
            let memo = try LocalJournalValidation.memo(draft.memo)

            // Project target: must belong to this ledger when given.
            var projectId = draft.projectId
            if let wanted = projectId {
                let project = try LocalProjectRow.fetchOne(db, key: wanted)
                guard let project, project.ledgerId == ledgerId else {
                    throw LocalValidationError(message: "Project not found in this ledger")
                }
            }

            // entryNo: the ledger row's monotonic counter, bumped in this
            // transaction — delete the highest entry and the number is
            // never reused.
            let entryNo = ledgerRow.lastEntryNo + 1
            var ledger = ledgerRow
            ledger.lastEntryNo = entryNo
            ledger.updatedAt = LocalValues.timestamp(from: now)
            try ledger.update(db)

            let id = UUID().uuidString
            let timestamp = LocalValues.timestamp(from: now)
            var locationBody: EntryLocationBody?
            if case .replace(let body)? = draft.location {
                locationBody = body
            }
            try LocalJournalEntryRow(
                id: id,
                ledgerId: ledgerId,
                entryNo: entryNo,
                date: LocalValues.timestamp(from: draft.date),
                dateDayKey: LocalAggregation.localDayKey(draft.date, tzOffsetMinutes: AppDates.localTzOffsetMinutes),
                memo: memo,
                status: "posted",
                countsInLedger: draft.countsInLedger ?? true,
                guestCreated: false,
                excludedFromBudget: draft.excludedFromBudget ?? false,
                createdById: creatorId,
                paidById: paidById,
                projectId: projectId,
                address: locationBody?.address,
                addressName: locationBody?.addressName,
                latitude: locationBody?.latitude,
                longitude: locationBody?.longitude,
                merchant: draft.merchant,
                createdAt: timestamp
            ).insert(db)
            for line in lines {
                try LocalJournalLineRow(
                    id: UUID().uuidString,
                    entryId: id,
                    accountId: line.accountId,
                    debitCents: line.debitCents,
                    creditCents: line.creditCents,
                    memo: line.memo
                ).insert(db)
            }
            for userId in participants ?? [] {
                try LocalEntryParticipantRow(
                    id: UUID().uuidString,
                    entryId: id,
                    userId: userId,
                    createdAt: timestamp
                ).insert(db)
            }
            return id
        }
        // Attachments claim onto the entry (file I/O already done at
        // stage time; the ids ride the draft).
        try await attachments.claim(ids: draft.attachmentIds ?? [], entryId: entryId)
        return try await entry(id: entryId, ledgerId: ledgerId)
    }

    /// Fetches one assembled entry by id (the update/delete returns).
    func entry(id: String, ledgerId: String) async throws -> JournalEntry {
        let assembled = try await database.writer.read { db in
            guard let row = try LocalJournalEntryRow.fetchOne(db, key: id) else {
                throw LocalStoreError.ledgerNotFound
            }
            return try journal.assemble([row], ledgerId: ledgerId, db: db).first
        }
        guard let assembled else { throw LocalStoreError.ledgerNotFound }
        return assembled
    }

    /// Replaces an entry's editable surface from the draft — the update
    /// endpoint's keep-rules: `entryNo`, creator, and `createdAt` stay.
    @discardableResult
    func updateEntry(
        ledgerId: String,
        entryId: String,
        editorId: String,
        draft: EntryDraft,
        now: Date = Date()
    ) async throws -> JournalEntry {
        try await database.writer.write { db in
            guard let existing = try LocalJournalEntryRow.fetchOne(db, key: entryId),
                  existing.ledgerId == ledgerId
            else {
                throw LocalStoreError.ledgerNotFound
            }
            let accountRows = try LocalBookAccountRow
                .filter(Column("ledger_id") == ledgerId)
                .fetchAll(db)
            let lines = try LocalJournalValidation.lines(draft.lines, accounts: accountRows.map(\.domainAccount))
            let rosterUserIds = Set(try String.fetchAll(
                db, sql: "SELECT user_id FROM qianlai_ledger_member WHERE ledger_id = ?",
                arguments: [ledgerId]
            ))
            let participants = try LocalJournalValidation.participants(draft.participantUserIds, roster: rosterUserIds)
            let paidById = try LocalJournalValidation.paidById(draft.paidByUserId, creatorId: existing.createdById ?? editorId, roster: rosterUserIds)
            let memo = try LocalJournalValidation.memo(draft.memo)

            var projectId = draft.projectId
            if let wanted = projectId {
                let project = try LocalProjectRow.fetchOne(db, key: wanted)
                guard let project, project.ledgerId == ledgerId else {
                    throw LocalValidationError(message: "Project not found in this ledger")
                }
            }

            var row = existing
            row.date = LocalValues.timestamp(from: draft.date)
            row.dateDayKey = LocalAggregation.localDayKey(draft.date, tzOffsetMinutes: AppDates.localTzOffsetMinutes)
            row.memo = memo
            row.countsInLedger = draft.countsInLedger ?? row.countsInLedger
            row.excludedFromBudget = draft.excludedFromBudget ?? row.excludedFromBudget
            row.paidById = paidById
            row.projectId = projectId
            // Location: omitted keeps, .clear strips, a body replaces.
            switch draft.location {
            case .replace(let body)?:
                row.address = body.address
                row.addressName = body.addressName
                row.latitude = body.latitude
                row.longitude = body.longitude
            case .clear?:
                row.address = nil
                row.addressName = nil
                row.latitude = nil
                row.longitude = nil
            case nil:
                break
            }
            if let merchant = draft.merchant {
                row.merchant = merchant.isEmpty ? nil : merchant
            }
            try row.update(db)

            // Lines: full replacement (the server deletes and recreates).
            try db.execute(
                sql: "DELETE FROM qianlai_journal_line WHERE entry_id = ?",
                arguments: [entryId]
            )
            for line in lines {
                try LocalJournalLineRow(
                    id: UUID().uuidString,
                    entryId: entryId,
                    accountId: line.accountId,
                    debitCents: line.debitCents,
                    creditCents: line.creditCents,
                    memo: line.memo
                ).insert(db)
            }
            // Participants: full replacement.
            try db.execute(
                sql: "DELETE FROM qianlai_journal_entry_participant WHERE entry_id = ?",
                arguments: [entryId]
            )
            let timestamp = LocalValues.timestamp(from: now)
            for userId in participants ?? [] {
                try LocalEntryParticipantRow(
                    id: UUID().uuidString,
                    entryId: entryId,
                    userId: userId,
                    createdAt: timestamp
                ).insert(db)
            }
        }
        // Attachments: the final id set claims (idempotent) and everything
        // not in it prunes — the update endpoint's set semantics.
        if let kept = draft.attachmentIds {
            try await attachments.claim(ids: kept, entryId: entryId)
            try await attachments.prune(entryId: entryId, keeping: kept)
        }
        return try await entry(id: entryId, ledgerId: ledgerId)
    }

    /// Deletes one entry (its receipts' files go with it — the rows
    /// cascade through the FK).
    func deleteEntry(ledgerId: String, entryId: String) async throws {
        try await database.writer.write { db in
            guard let row = try LocalJournalEntryRow.fetchOne(db, key: entryId),
                  row.ledgerId == ledgerId
            else {
                throw LocalStoreError.ledgerNotFound
            }
            _ = try LocalJournalEntryRow.deleteOne(db, key: entryId)
        }
        try await attachments.deleteAll(entryId: entryId)
    }

    /// The balance adjustment (`setAccountBalance`): the account's signed
    /// balance as of the date, the delta to the target, and a two-line
    /// entry against the adjustment-offset account. `adjusted == false`
    /// when the balance already matches (no entry, like the server).
    func setBalance(
        ledgerId: String,
        accountId: String,
        balance: Double,
        date: Date?,
        memo: String?,
        actorId: String,
        now: Date = Date()
    ) async throws -> (adjusted: Bool, entry: JournalEntry?) {
        let entryDate = date ?? now
        let adjustmentDraft = try await database.writer.write { db -> EntryDraft? in
            guard let ledgerRow = try LocalLedgerRow.fetchOne(db, key: ledgerId) else {
                throw LocalStoreError.ledgerNotFound
            }
            guard ledgerRow.status == "active" else {
                throw LocalValidationError(message: "This ledger is archived")
            }
            guard
                let accountRow = try LocalBookAccountRow.fetchOne(db, key: accountId),
                accountRow.ledgerId == ledgerId
            else {
                throw LocalValidationError(message: "Account not found")
            }
            guard accountRow.type == "asset" || accountRow.type == "liability" else {
                throw LocalValidationError(message: "Only asset and liability accounts can have their balance set")
            }
            guard accountRow.status == "active" else {
                throw LocalValidationError(message: "Account \(accountRow.name ?? accountRow.code ?? "") is archived")
            }
            let accountType = AccountType(rawValue: accountRow.type) ?? .asset

            // The as-of balance: line sums over entries dated ≤ the day's
            // end (`to` is inclusive — the client sends local end-of-day).
            let toBound = LocalValues.timestamp(from: AppDates.localEndOfDay(entryDate))
            let sums = try Row.fetchOne(
                db,
                sql: """
                    SELECT COALESCE(SUM(l.debit_cents), 0) AS debit,
                           COALESCE(SUM(l.credit_cents), 0) AS credit
                    FROM qianlai_journal_line l
                    JOIN qianlai_journal_entry e ON e.id = l.entry_id
                    WHERE l.account_id = ? AND e.date <= ?
                    """,
                arguments: [accountId, toBound]
            )
            let debit: Int = sums?["debit"] ?? 0
            let credit: Int = sums?["credit"] ?? 0
            let currentCents = accountType == .asset ? debit - credit : credit - debit
            let targetCents = LocalValues.cents(fromYuan: balance)
            let deltaCents = targetCents - currentCents
            if deltaCents == 0 {
                return nil
            }
            if abs(deltaCents) > LocalValidation.maxLineCents {
                throw LocalValidationError(message: "Line amounts cannot exceed 9,999,999,999.99")
            }

            // The offset account: flagged adjustmentOffset, else the first
            // active equity, else create the balanceAdjustment builtin.
            let offsetRow = try (LocalBookAccountRow.fetchOne(
                db,
                sql: """
                    SELECT * FROM qianlai_book_account
                    WHERE ledger_id = ? AND status = 'active'
                      AND flags LIKE '%adjustmentOffset%'
                    LIMIT 1
                    """,
                arguments: [ledgerId]
            ) ?? LocalBookAccountRow.fetchOne(
                db,
                sql: "SELECT * FROM qianlai_book_account WHERE ledger_id = ? AND status = 'active' AND type = 'equity' ORDER BY sort_order LIMIT 1",
                arguments: [ledgerId]
            ))
            let offset: LocalBookAccountRow
            if let offsetRow {
                offset = offsetRow
            } else {
                offset = LocalBookAccountRow(
                    id: UUID().uuidString,
                    ledgerId: ledgerId,
                    name: nil,
                    code: "balanceAdjustment",
                    type: "equity",
                    sortOrder: 61,
                    parentId: nil,
                    status: "active",
                    icon: "⚖️",
                    flags: LocalBookAccountRow.build(flags: [
                        LocalValidation.builtinFlag, LocalValidation.adjustmentOffsetFlag,
                    ]),
                    meta: nil,
                    realAccountId: nil,
                    createdAt: LocalValues.timestamp(from: now),
                    updatedAt: LocalValues.timestamp(from: now)
                )
                try offset.insert(db)
            }

            // Debit-normal target (asset): delta up ⇒ debit the target.
            // Credit-normal (liability): delta up ⇒ credit the target.
            let targetOnDebit = accountType == .asset ? deltaCents > 0 : deltaCents < 0
            let amount = Double(abs(deltaCents)) / 100
            var draft = EntryDraft(
                date: entryDate,
                memo: memo,
                lines: [
                    (
                        accountId: accountId,
                        debit: targetOnDebit ? amount : 0,
                        credit: targetOnDebit ? 0 : amount,
                        memo: nil as String?
                    ),
                    (
                        accountId: offset.id,
                        debit: targetOnDebit ? 0 : amount,
                        credit: targetOnDebit ? amount : 0,
                        memo: nil as String?
                    ),
                ],
                participantUserIds: nil,
                paidByUserId: actorId,
                projectId: nil,
                countsInLedger: true,
                excludedFromBudget: false,
                location: nil,
                merchant: nil
            )
            // The offset may be the ONLY equity account; the balance rule
            // creates it above — either way the two lines balance.
            _ = try LocalJournalValidation.lines(draft.lines, accounts: (try LocalBookAccountRow
                .filter(Column("ledger_id") == ledgerId)
                .fetchAll(db)).map(\.domainAccount))
            return draft
        }
        guard let adjustmentDraft else {
            return (adjusted: false, entry: nil)
        }
        let entry = try await createEntry(
            ledgerId: ledgerId, creatorId: actorId, draft: adjustmentDraft, now: now
        )
        return (adjusted: true, entry: entry)
    }
}

extension LocalBookAccountRow {
    /// The API shape the validation and display layers read.
    var domainAccount: BookAccount {
        BookAccount(
            id: id,
            ledgerId: ledgerId,
            name: name,
            code: code,
            type: AccountType(rawValue: type) ?? .expense,
            sortOrder: sortOrder,
            parentId: parentId,
            status: status,
            icon: icon,
            flags: flagsList,
            meta: LocalValues.metaDictionary(fromJSON: meta),
            createdAt: LocalValues.date(fromTimestamp: createdAt) ?? .distantPast
        )
    }
}
