/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("authLog");

  const emailField = collection.fields.getByName("email");
  if (emailField) {
    emailField.required = false;
  }

  const existing = collection.fields.getByName("createdAt");
  if (existing) {
    if (existing.type !== "autodate") {
      collection.fields.removeByName("createdAt"); // exists with wrong type, remove first
      collection.fields.add(new AutodateField({
        name: "createdAt",
        onCreate: true,
        onUpdate: false
      }));
    }
  } else {
    collection.fields.add(new AutodateField({
      name: "createdAt",
      onCreate: true,
      onUpdate: false
    }));
  }

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("authLog");
    const emailField = collection.fields.getByName("email");
    if (emailField) {
      emailField.required = true;
    }
    collection.fields.removeByName("createdAt");
    return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("Collection not found, skipping revert");
      return;
    }
    throw e;
  }
})
