/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("emailLog");
  const field = collection.fields.getByName("emailType");
  field.values = ["submission_notification", "user_confirmation", "reminder", "missing_info", "auto_assignment", "admin_notification", "activation_email", "password_reset_email"];
  return app.save(collection);
}, (app) => {
  try {
  const collection = app.findCollectionByNameOrId("emailLog");
  const field = collection.fields.getByName("emailType");
  if (!field) { console.log("Field not found, skipping revert"); return; }
  field.values = ["submission_notification", "user_confirmation", "reminder", "missing_info", "auto_assignment", "admin_notification"];
  return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("Collection or field not found, skipping revert");
      return;
    }
    throw e;
  }
})
