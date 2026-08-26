-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "QuizAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "questionId" TEXT NOT NULL,
    CONSTRAINT "QuizAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuizAnswerCharacteristic" (
    "answerId" TEXT NOT NULL,
    "characteristicId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY ("answerId", "characteristicId"),
    CONSTRAINT "QuizAnswerCharacteristic_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "QuizAnswer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuizAnswerCharacteristic_characteristicId_fkey" FOREIGN KEY ("characteristicId") REFERENCES "Characteristic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
