/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("users");

  const existingThemePreference = collection.fields.getByName("themePreference");
  if (existingThemePreference) {
    if (existingThemePreference.type !== "select") {
      collection.fields.removeByName("themePreference");
      collection.fields.add(new SelectField({
        name: "themePreference",
        required: false,
        values: ["light", "dark"]
      }));
    }
  } else {
    collection.fields.add(new SelectField({
      name: "themePreference",
      required: false,
      values: ["light", "dark"]
    }));
  }

  const existingIsAdmin = collection.fields.getByName("isAdmin");
  if (existingIsAdmin) {
    if (existingIsAdmin.type !== "bool") {
      collection.fields.removeByName("isAdmin");
      collection.fields.add(new BoolField({
        name: "isAdmin",
        required: false
      }));
    }
  } else {
    collection.fields.add(new BoolField({
      name: "isAdmin",
      required: false
    }));
  }

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("users");
    collection.fields.removeByName("themePreference");
    collection.fields.removeByName("isAdmin");
    return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("Collection not found, skipping revert");
      return;
    }
    throw e;
  }
})
