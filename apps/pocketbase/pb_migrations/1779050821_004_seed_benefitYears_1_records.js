/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("benefitYears");

  const record0 = new Record(collection);
    record0.set("year", 2026);
    record0.set("annualBudget", 1000);
    record0.set("processOpenDate", "2026-05-17");
    record0.set("submissionDeadline", "2026-10-31");
    record0.set("reminderDate", "2026-10-15");
    record0.set("autoAssignmentDate", "2026-11-15");
    record0.set("status", "open");
    record0.set("allowCustomBenefits", true);
  try {
    app.save(record0);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }
}, (app) => {
  // Rollback: record IDs not known, manual cleanup needed
})
