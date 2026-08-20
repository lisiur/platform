-- Existing article/link items are retained as sentence items because the enum
-- values must be gone before the PostgreSQL enum can be recreated.
UPDATE "studybuddy_collection_item"
SET "type" = 'SENTENCE'
WHERE "type" IN ('ARTICLE', 'LINK');

ALTER TYPE "CollectionItemType" RENAME TO "CollectionItemType_old";

CREATE TYPE "CollectionItemType" AS ENUM ('WORD', 'PHRASE', 'SENTENCE');

ALTER TABLE "studybuddy_collection_item"
ALTER COLUMN "type" TYPE "CollectionItemType"
USING ("type"::text::"CollectionItemType");

DROP TYPE "CollectionItemType_old";
