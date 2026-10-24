-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "task_two_enquiries" (
    "id" SERIAL NOT NULL,
    "requestId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "enquiry" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_two_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_two_enquiries_requestId_key" ON "task_two_enquiries"("requestId");
