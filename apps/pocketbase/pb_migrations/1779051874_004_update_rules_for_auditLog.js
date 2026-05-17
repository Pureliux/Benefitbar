/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const auditLog = app.findCollectionByNameOrId("auditLog");
  auditLog.listRule = "@request.auth.isAdmin = true";
  auditLog.viewRule = "@request.auth.isAdmin = true";
  app.save(auditLog);

  const employees = app.findCollectionByNameOrId("employees");
  employees.listRule = "email = @request.auth.email || @request.auth.isAdmin = true";
  employees.viewRule = "email = @request.auth.email || @request.auth.isAdmin = true";
  employees.createRule = "@request.auth.isAdmin = true";
  employees.updateRule = "@request.auth.isAdmin = true";
  app.save(employees);

  const submissions = app.findCollectionByNameOrId("submissions");
  submissions.createRule = "@request.auth.id != \"\"";
  submissions.listRule = "employeeId.email = @request.auth.email || @request.auth.isAdmin = true";
  submissions.viewRule = "employeeId.email = @request.auth.email || @request.auth.isAdmin = true";
  submissions.updateRule = "employeeId.email = @request.auth.email || @request.auth.isAdmin = true";
  submissions.deleteRule = "@request.auth.isAdmin = true";
  app.save(submissions);

  const selectedBenefits = app.findCollectionByNameOrId("selectedBenefits");
  selectedBenefits.createRule = "@request.auth.id != \"\"";
  selectedBenefits.listRule = "@request.auth.id != \"\"";
  selectedBenefits.viewRule = "@request.auth.id != \"\"";
  selectedBenefits.updateRule = "@request.auth.id != \"\" || @request.auth.isAdmin = true";
  selectedBenefits.deleteRule = "@request.auth.id != \"\" || @request.auth.isAdmin = true";
  app.save(selectedBenefits);

  const attachments = app.findCollectionByNameOrId("attachments");
  attachments.createRule = "@request.auth.id != \"\"";
  attachments.listRule = "employeeId.email = @request.auth.email || @request.auth.isAdmin = true";
  attachments.viewRule = "employeeId.email = @request.auth.email || @request.auth.isAdmin = true";
  attachments.updateRule = "employeeId.email = @request.auth.email || @request.auth.isAdmin = true";
  attachments.deleteRule = "employeeId.email = @request.auth.email || @request.auth.isAdmin = true";
  app.save(attachments);
}, (app) => {
  try {
  const auditLog = app.findCollectionByNameOrId("auditLog");
  auditLog.listRule = "@request.auth.isAdmin = true";
  auditLog.viewRule = "@request.auth.isAdmin = true";
  app.save(auditLog);

  const employees = app.findCollectionByNameOrId("employees");
  employees.listRule = "id = @request.auth.id || @request.auth.isAdmin = true";
  employees.viewRule = "id = @request.auth.id || @request.auth.isAdmin = true";
  employees.createRule = "@request.auth.isAdmin = true";
  employees.updateRule = "@request.auth.isAdmin = true";
  app.save(employees);

  const submissions = app.findCollectionByNameOrId("submissions");
  submissions.createRule = "@request.auth.id != \"\"";
  submissions.listRule = "employeeId = @request.auth.id || @request.auth.isAdmin = true";
  submissions.viewRule = "employeeId = @request.auth.id || @request.auth.isAdmin = true";
  submissions.updateRule = "employeeId = @request.auth.id || @request.auth.isAdmin = true";
  submissions.deleteRule = "@request.auth.isAdmin = true";
  app.save(submissions);

  const selectedBenefits = app.findCollectionByNameOrId("selectedBenefits");
  selectedBenefits.createRule = "@request.auth.id != \"\"";
  selectedBenefits.listRule = "@request.auth.id != \"\"";
  selectedBenefits.viewRule = "@request.auth.id != \"\"";
  selectedBenefits.updateRule = "@request.auth.id != \"\" || @request.auth.isAdmin = true";
  selectedBenefits.deleteRule = "@request.auth.id != \"\" || @request.auth.isAdmin = true";
  app.save(selectedBenefits);

  const attachments = app.findCollectionByNameOrId("attachments");
  attachments.createRule = "@request.auth.id != \"\"";
  attachments.listRule = "employeeId = @request.auth.id || @request.auth.isAdmin = true";
  attachments.viewRule = "employeeId = @request.auth.id || @request.auth.isAdmin = true";
  attachments.updateRule = "employeeId = @request.auth.id || @request.auth.isAdmin = true";
  attachments.deleteRule = "employeeId = @request.auth.id || @request.auth.isAdmin = true";
  app.save(attachments);
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("Collection not found, skipping revert");
      return;
    }
    throw e;
  }
})
