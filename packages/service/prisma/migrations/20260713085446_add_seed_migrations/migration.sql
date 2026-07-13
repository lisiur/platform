-- CreateTable
CREATE TABLE "_seed_migrations" (
    "fingerprint" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "_seed_migrations_pkey" PRIMARY KEY ("fingerprint")
);
