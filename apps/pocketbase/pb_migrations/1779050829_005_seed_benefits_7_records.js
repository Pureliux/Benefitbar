/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("benefits");

  const record0 = new Record(collection);
    const record0_benefitYearIdLookup = app.findFirstRecordByFilter("benefitYears", "year=2026");
    if (!record0_benefitYearIdLookup) { throw new Error("Lookup failed for benefitYearId: no record in 'benefitYears' matching \"year=2026\""); }
    record0.set("benefitYearId", record0_benefitYearIdLookup.id);
    record0.set("title", "Yoga-Kurs");
    record0.set("description", "Yoga-Kurse zur Entspannung und Fitness");
    record0.set("category", "Wellness");
    record0.set("fixedAmount", 200);
    record0.set("payoutMode", "one_time");
    record0.set("receiptRequired", true);
    record0.set("active", true);
    record0.set("sortOrder", 1);
  try {
    app.save(record0);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record1 = new Record(collection);
    const record1_benefitYearIdLookup = app.findFirstRecordByFilter("benefitYears", "year=2026");
    if (!record1_benefitYearIdLookup) { throw new Error("Lookup failed for benefitYearId: no record in 'benefitYears' matching \"year=2026\""); }
    record1.set("benefitYearId", record1_benefitYearIdLookup.id);
    record1.set("title", "Wiener \u00d6ffi-Ticket");
    record1.set("description", "Jahresticket f\u00fcr Wiener \u00d6ffentliche Verkehrsmittel");
    record1.set("category", "Mobilit\u00e4t");
    record1.set("fixedAmount", 460);
    record1.set("payoutMode", "monthly_12");
    record1.set("receiptRequired", true);
    record1.set("active", true);
    record1.set("sortOrder", 2);
  try {
    app.save(record1);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record2 = new Record(collection);
    const record2_benefitYearIdLookup = app.findFirstRecordByFilter("benefitYears", "year=2026");
    if (!record2_benefitYearIdLookup) { throw new Error("Lookup failed for benefitYearId: no record in 'benefitYears' matching \"year=2026\""); }
    record2.set("benefitYearId", record2_benefitYearIdLookup.id);
    record2.set("title", "Fitness-Zuschuss");
    record2.set("description", "Zuschuss f\u00fcr Fitnessstudio oder Sportverein");
    record2.set("category", "Wellness");
    record2.set("fixedAmount", 300);
    record2.set("payoutMode", "one_time");
    record2.set("receiptRequired", true);
    record2.set("active", true);
    record2.set("sortOrder", 3);
  try {
    app.save(record2);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record3 = new Record(collection);
    const record3_benefitYearIdLookup = app.findFirstRecordByFilter("benefitYears", "year=2026");
    if (!record3_benefitYearIdLookup) { throw new Error("Lookup failed for benefitYearId: no record in 'benefitYears' matching \"year=2026\""); }
    record3.set("benefitYearId", record3_benefitYearIdLookup.id);
    record3.set("title", "Weiterbildung");
    record3.set("description", "Kurse und Schulungen zur beruflichen Entwicklung");
    record3.set("category", "Bildung");
    record3.set("fixedAmount", 500);
    record3.set("payoutMode", "one_time");
    record3.set("receiptRequired", true);
    record3.set("active", true);
    record3.set("sortOrder", 4);
  try {
    app.save(record3);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record4 = new Record(collection);
    const record4_benefitYearIdLookup = app.findFirstRecordByFilter("benefitYears", "year=2026");
    if (!record4_benefitYearIdLookup) { throw new Error("Lookup failed for benefitYearId: no record in 'benefitYears' matching \"year=2026\""); }
    record4.set("benefitYearId", record4_benefitYearIdLookup.id);
    record4.set("title", "Gesundheitscheck");
    record4.set("description", "J\u00e4hrlicher Gesundheitscheck und Vorsorgeuntersuchung");
    record4.set("category", "Gesundheit");
    record4.set("fixedAmount", 250);
    record4.set("payoutMode", "one_time");
    record4.set("receiptRequired", true);
    record4.set("active", true);
    record4.set("sortOrder", 5);
  try {
    app.save(record4);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record5 = new Record(collection);
    const record5_benefitYearIdLookup = app.findFirstRecordByFilter("benefitYears", "year=2026");
    if (!record5_benefitYearIdLookup) { throw new Error("Lookup failed for benefitYearId: no record in 'benefitYears' matching \"year=2026\""); }
    record5.set("benefitYearId", record5_benefitYearIdLookup.id);
    record5.set("title", "Ergonomie / Homeoffice");
    record5.set("description", "Ergonomische Ausr\u00fcstung und Homeoffice-Zubeh\u00f6r");
    record5.set("category", "Ausstattung");
    record5.set("fixedAmount", 350);
    record5.set("payoutMode", "one_time");
    record5.set("receiptRequired", true);
    record5.set("active", true);
    record5.set("sortOrder", 6);
  try {
    app.save(record5);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record6 = new Record(collection);
    const record6_benefitYearIdLookup = app.findFirstRecordByFilter("benefitYears", "year=2026");
    if (!record6_benefitYearIdLookup) { throw new Error("Lookup failed for benefitYearId: no record in 'benefitYears' matching \"year=2026\""); }
    record6.set("benefitYearId", record6_benefitYearIdLookup.id);
    record6.set("title", "Essens-/Verpflegungszuschuss");
    record6.set("description", "Zuschuss f\u00fcr Mittagessen und Verpflegung");
    record6.set("category", "Verpflegung");
    record6.set("fixedAmount", 600);
    record6.set("payoutMode", "monthly_12");
    record6.set("receiptRequired", false);
    record6.set("active", true);
    record6.set("sortOrder", 7);
  try {
    app.save(record6);
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
