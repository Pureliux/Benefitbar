/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("employees");

  const existing = collection.fields.getByName("authStatus");
  if (existing) {
    if (existing.type === "select") {
      return; // field already exists with correct type, skip
    }
    collection.fields.removeByName("authStatus"); // exists with wrong type, remove first
  }

  collection.fields.add(new SelectField({
    name: "authStatus",
    required: false,
    values: ["not_invited", "invited", "active", "locked"]
  }));

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("employees");
    collection.fields.removeByName("authStatus");
    return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("Collection not found, skipping revert");
      return;
    }
    throw e;
  }
})
